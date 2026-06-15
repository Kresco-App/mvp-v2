from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.exercises import ExerciseBankListOut, ExerciseDetailOut
from app.services.exercise_bank import get_exercise_detail, list_exercise_bank_items

router = APIRouter(tags=["Exercise Bank"])


@router.get("/subjects/{subject_id}", response_model=ExerciseBankListOut)
async def list_subject_exercises(
    subject_id: int,
    topic_id: int | None = None,
    difficulty: str | None = None,
    self_grade: str | None = None,
    saved: bool | None = None,
    concept: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_exercise_bank_items(
        db,
        user,
        subject_id=subject_id,
        topic_id=topic_id,
        difficulty=difficulty,
        self_grade=self_grade,
        saved=saved,
        concept=concept,
        limit=limit,
        offset=offset,
    )


@router.get("/{exercise_id}", response_model=ExerciseDetailOut)
async def get_exercise(
    exercise_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exercise = await get_exercise_detail(db, user, exercise_id=exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise
