from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.rate_limit import limiter
from app.models.users import User
from app.schemas.quizzes import QuizDiscoveryOut, QuizOut, QuizResultOut, QuizSubmitIn
from app.services.legacy_quizzes import (
    get_quiz_detail_state,
    get_subject_quiz_discovery_state,
    submit_lesson_quiz_attempt,
)

router = APIRouter(tags=["Quizzes"])


@router.get("/subjects/{subject_id}/discovery", response_model=QuizDiscoveryOut)
async def get_subject_quiz_discovery(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_subject_quiz_discovery_state(db, user=user, subject_id=subject_id)


@router.get("/{quiz_id}", response_model=QuizOut)
async def get_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_quiz_detail_state(db, user=user, quiz_id=quiz_id)


@router.post("/lessons/{lesson_id}/quiz/submit", response_model=QuizResultOut)
@limiter.limit("20/minute")
async def submit_quiz(
    request: Request,
    lesson_id: int,
    body: QuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await submit_lesson_quiz_attempt(db, user=user, lesson_id=lesson_id, body=body)
