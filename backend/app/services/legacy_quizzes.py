from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import Chapter, Lesson
from app.models.gamification import QuizResult
from app.models.quizzes import Quiz, QuizQuestion
from app.models.users import User
from app.schemas.quizzes import QuizDiscoveryOut, QuizOut, QuizResultOut, QuizSubmitIn
from app.services.course_access import require_lesson_access
from app.services.quiz_scoring import score_quiz_answers
from app.services.xp import XPAward, award_xp_bulk


async def ensure_lesson_quiz_access(db: AsyncSession, user: User, lesson_id: int) -> None:
    await require_lesson_access(db, user, lesson_id)


async def get_subject_quiz_discovery_state(
    db: AsyncSession,
    *,
    user: User,
    subject_id: int,
) -> QuizDiscoveryOut:
    result = await db.execute(
        select(Quiz)
        .join(Lesson, Quiz.lesson_id == Lesson.id)
        .join(Chapter, Lesson.chapter_id == Chapter.id)
        .options(selectinload(Quiz.questions).selectinload(QuizQuestion.options))
        .where(Chapter.subject_id == subject_id, Quiz.questions.any())
        .order_by(Chapter.order.asc(), Lesson.order.asc(), Quiz.id.asc())
        .limit(1)
    )
    quiz = result.scalar_one_or_none()
    if quiz is None:
        return QuizDiscoveryOut(subject_id=subject_id, lesson_id=None, quiz=None)

    await ensure_lesson_quiz_access(db, user, quiz.lesson_id)
    return QuizDiscoveryOut(
        subject_id=subject_id,
        lesson_id=quiz.lesson_id,
        quiz=QuizOut.model_validate(quiz),
    )


async def get_quiz_detail_state(
    db: AsyncSession,
    *,
    user: User,
    quiz_id: int,
) -> QuizOut:
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions).selectinload(QuizQuestion.options))
        .where(Quiz.id == quiz_id)
    )
    quiz = result.scalar_one_or_none()
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    await ensure_lesson_quiz_access(db, user, quiz.lesson_id)
    return QuizOut.model_validate(quiz)


async def submit_lesson_quiz_attempt(
    db: AsyncSession,
    *,
    user: User,
    lesson_id: int,
    body: QuizSubmitIn,
) -> QuizResultOut:
    result = await db.execute(
        select(Quiz)
        .options(
            selectinload(Quiz.lesson).selectinload(Lesson.chapter),
            selectinload(Quiz.questions).selectinload(QuizQuestion.options),
        )
        .where(Quiz.lesson_id == lesson_id)
    )
    quiz = result.scalar_one_or_none()
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found for this lesson")
    await ensure_lesson_quiz_access(db, user, lesson_id)

    user_id = user.id
    quiz_id = quiz.id
    scored = score_quiz_answers(quiz, body.answers)
    score_payload = {
        "score": scored.score,
        "passed": scored.passed,
        "correct": scored.correct,
        "total": scored.total,
    }
    pass_score = quiz.pass_score
    subject_id = quiz.lesson.chapter.subject_id if quiz.lesson and quiz.lesson.chapter else None
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())
    existing_result = await db.scalar(
        select(QuizResult)
        .where(
            QuizResult.user_id == user_id,
            QuizResult.quiz_id == quiz_id,
        )
        .order_by(QuizResult.passed.desc(), QuizResult.score.desc(), QuizResult.id.asc())
        .limit(1)
        .with_for_update()
    )

    if existing_result is not None and existing_result.passed:
        stored_score = int(existing_result.score or 0)
        await db.rollback()
        stored_correct = round((stored_score / 100) * scored.total) if scored.total else 0
        return QuizResultOut(
            score=stored_score,
            passed=True,
            correct=stored_correct,
            total=scored.total,
            pass_score=pass_score,
            xp_earned=0,
        )

    should_commit = False
    if existing_result is None:
        existing_result = QuizResult(user_id=user_id, quiz_id=quiz_id, score=scored.score, passed=scored.passed)
        try:
            async with db.begin_nested():
                db.add(existing_result)
                await db.flush()
            should_commit = True
        except IntegrityError:
            existing_result = await db.scalar(
                select(QuizResult)
                .where(
                    QuizResult.user_id == user_id,
                    QuizResult.quiz_id == quiz_id,
                )
                .with_for_update()
            )
            if existing_result is None:
                raise

    if existing_result is not None and not existing_result.passed and (scored.passed or scored.score > existing_result.score):
        existing_result.score = scored.score
        existing_result.passed = scored.passed
        should_commit = True

    xp_awards: list[XPAward] = []
    if scored.passed:
        xp_awards.append(XPAward(
            reason="quiz_pass",
            description=f"Quiz {quiz_id} passed",
            subject_id=subject_id,
            idempotency_key=f"legacy_quiz_pass:user:{user_id}:quiz:{quiz_id}",
        ))
        if scored.score == 100:
            xp_awards.append(XPAward(
                reason="quiz_perfect",
                description=f"Quiz {quiz_id} perfect score",
                subject_id=subject_id,
                idempotency_key=f"legacy_quiz_perfect:user:{user_id}:quiz:{quiz_id}",
            ))
    xp_earned = await award_xp_bulk(user_id, xp_awards, db)

    if should_commit:
        await db.commit()
    else:
        await db.rollback()

    return QuizResultOut(
        **score_payload,
        pass_score=pass_score,
        xp_earned=xp_earned,
    )
