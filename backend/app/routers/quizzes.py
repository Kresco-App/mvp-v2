from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.courses import Lesson
from app.models.gamification import QuizResult
from app.models.quizzes import Quiz, QuizOption, QuizQuestion
from app.models.users import User
from app.schemas.quizzes import QuizOut, QuizResultOut, QuizSubmitIn
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
    return QuizOut.model_validate(quiz)


@router.post("/lessons/{lesson_id}/quiz/submit", response_model=QuizResultOut)
async def submit_quiz(
    lesson_id: int,
    body: QuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions).selectinload(QuizQuestion.options))
        .where(Quiz.lesson_id == lesson_id)
    )
    quiz = result.scalar_one_or_none()
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found for this lesson")

    # Build a map of question_id → correct option_id
    correct_map: dict[int, int] = {}
    for question in quiz.questions:
        for option in question.options:
            if option.is_correct:
                correct_map[question.id] = option.id
                break

    total = len(quiz.questions)
    correct = sum(
        1 for qid, oid in body.answers.items()
        if correct_map.get(int(qid)) == int(oid)
    )
    score = round((correct / total) * 100) if total > 0 else 0
    passed = score >= quiz.pass_score

    quiz_result = QuizResult(user_id=user.id, quiz_id=quiz.id, score=score, passed=passed)
    db.add(quiz_result)

    xp_earned = 0
    if passed:
        xp_earned += await award_xp(user.id, "quiz_pass", f"Quiz {quiz.id} passed", db)
        if score == 100:
            xp_earned += await award_xp(user.id, "quiz_perfect", f"Quiz {quiz.id} perfect score", db)

    await db.commit()

    return QuizResultOut(
        score=score, passed=passed, correct=correct, total=total,
        pass_score=quiz.pass_score, xp_earned=xp_earned,
    )
