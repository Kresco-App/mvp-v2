from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import Lesson
from app.models.gamification import QuizResult
from app.models.quizzes import Quiz, QuizQuestion
from app.models.users import User
from app.schemas.quizzes import QuizResultOut, QuizSubmitIn
from app.services.access import build_access_context
from app.services.gamification_stats import apply_quiz_pass_stats_delta
from app.services.quiz_scoring import score_quiz_answers
from app.services.xp import award_xp


async def record_legacy_quiz_result(
    db: AsyncSession,
    *,
    user: User,
    quiz_id: int,
    body: QuizSubmitIn,
) -> QuizResultOut:
    quiz_result = await db.execute(
        select(Quiz)
        .options(
            selectinload(Quiz.lesson).selectinload(Lesson.chapter),
            selectinload(Quiz.questions).selectinload(QuizQuestion.options),
        )
        .where(Quiz.id == quiz_id)
    )
    quiz = quiz_result.scalar_one_or_none()
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.lesson is None:
        raise HTTPException(status_code=404, detail="Quiz lesson not found")
    access_context = await build_access_context(db, user)
    subject_id = quiz.lesson.chapter.subject_id if quiz.lesson.chapter else None
    access = access_context.decide_for(quiz.lesson, subject_id=subject_id, fallback_required_tier="pro")
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)

    scored = score_quiz_answers(quiz, body.answers)
    existing_result = await db.scalar(
        select(QuizResult)
        .where(
            QuizResult.user_id == user.id,
            QuizResult.quiz_id == quiz_id,
        )
        .with_for_update()
    )
    already_passed = existing_result.passed if existing_result is not None else False

    if existing_result is None:
        existing_result = QuizResult(user_id=user.id, quiz_id=quiz_id, score=scored.score, passed=scored.passed)
        try:
            async with db.begin_nested():
                db.add(existing_result)
                await db.flush()
        except IntegrityError:
            existing_result = await db.scalar(
                select(QuizResult)
                .where(QuizResult.user_id == user.id, QuizResult.quiz_id == quiz_id)
                .with_for_update()
            )
            if existing_result is None:
                raise
            already_passed = existing_result.passed
    if existing_result is not None:
        existing_result.score = max(existing_result.score, scored.score)
        existing_result.passed = existing_result.passed or scored.passed

    xp_earned = 0
    if scored.passed and not already_passed:
        xp_earned = await award_xp(
            user.id,
            "quiz_pass",
            f"Quiz {quiz_id} passed",
            db,
            dedupe=True,
            subject_id=subject_id,
            idempotency_key=f"quiz_pass:user:{user.id}:quiz:{quiz_id}",
        )
        await apply_quiz_pass_stats_delta(db, user_id=user.id, quizzes_passed_delta=1)
    await db.commit()
    return QuizResultOut(
        score=scored.score,
        passed=scored.passed,
        correct=scored.correct,
        total=scored.total,
        pass_score=quiz.pass_score,
        xp_earned=xp_earned,
    )
