from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.courses import Lesson
from app.models.gamification import QuizResult
from app.models.quizzes import Quiz, QuizQuestion
from app.rate_limit import limiter
from app.models.users import User
from app.schemas.quizzes import QuizOut, QuizResultOut, QuizSubmitIn
from app.services.course_access import require_lesson_access
from app.services.quiz_scoring import score_quiz_answers
from app.services.xp import XPAward, award_xp_bulk

router = APIRouter(tags=["Quizzes"])


@router.get("/{quiz_id}", response_model=QuizOut)
async def get_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions).selectinload(QuizQuestion.options))
        .where(Quiz.id == quiz_id)
    )
    quiz = result.scalar_one_or_none()
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    await _ensure_lesson_quiz_access(db, user, quiz.lesson_id)
    return QuizOut.model_validate(quiz)


@router.post("/lessons/{lesson_id}/quiz/submit", response_model=QuizResultOut)
@limiter.limit("20/minute")
async def submit_quiz(
    request: Request,
    lesson_id: int,
    body: QuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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
    await _ensure_lesson_quiz_access(db, user, lesson_id)

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
        await db.rollback()
        return QuizResultOut(
            **score_payload,
            pass_score=pass_score,
            xp_earned=0,
        )

    should_commit = False
    if existing_result is None:
        db.add(QuizResult(user_id=user_id, quiz_id=quiz_id, score=scored.score, passed=scored.passed))
        should_commit = True
    elif scored.passed or scored.score > existing_result.score:
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


async def _ensure_lesson_quiz_access(db: AsyncSession, user: User, lesson_id: int) -> None:
    await require_lesson_access(db, user, lesson_id)
