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
from app.services.xp import award_xp

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

    scored = score_quiz_answers(quiz, body.answers)
    already_passed = await db.scalar(
        select(QuizResult.id)
        .where(
            QuizResult.user_id == user.id,
            QuizResult.quiz_id == quiz.id,
            QuizResult.passed == True,  # noqa: E712
        )
        .limit(1)
    )

    if already_passed is not None:
        return QuizResultOut(
            score=scored.score,
            passed=scored.passed,
            correct=scored.correct,
            total=scored.total,
            pass_score=quiz.pass_score,
            xp_earned=0,
        )

    quiz_result = QuizResult(user_id=user.id, quiz_id=quiz.id, score=scored.score, passed=scored.passed)
    db.add(quiz_result)

    xp_earned = 0
    subject_id = quiz.lesson.chapter.subject_id if quiz.lesson and quiz.lesson.chapter else None
    if scored.passed:
        xp_earned += await award_xp(
            user.id,
            "quiz_pass",
            f"Quiz {quiz.id} passed",
            db,
            subject_id=subject_id,
            idempotency_key=f"legacy_quiz_pass:user:{user.id}:quiz:{quiz.id}",
        )
        if scored.score == 100:
            xp_earned += await award_xp(
                user.id,
                "quiz_perfect",
                f"Quiz {quiz.id} perfect score",
                db,
                subject_id=subject_id,
                idempotency_key=f"legacy_quiz_perfect:user:{user.id}:quiz:{quiz.id}",
            )

    await db.commit()

    return QuizResultOut(
        score=scored.score, passed=scored.passed, correct=scored.correct, total=scored.total,
        pass_score=quiz.pass_score, xp_earned=xp_earned,
    )


async def _ensure_lesson_quiz_access(db: AsyncSession, user: User, lesson_id: int) -> None:
    await require_lesson_access(db, user, lesson_id)
