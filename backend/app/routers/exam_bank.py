from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.exam_bank import (
    ExamBankListOut,
    ExamBankProblemDetailOut,
    ExamProblemPartProgressIn,
    ExamProblemPartProgressOut,
    ExamProblemProgressIn,
    ExamProblemProgressOut,
)
from app.services.exam_bank import (
    get_exam_problem_detail,
    list_exam_bank,
    record_exam_problem_part_progress,
    record_exam_problem_progress,
)

router = APIRouter(tags=["Exam Bank"])


@router.get("", response_model=ExamBankListOut)
async def list_exam_bank_items(
    subject_id: int | None = None,
    topic_id: int | None = None,
    year: int | None = None,
    q: str = "",
    progress_status: Literal["not_started", "opened", "completed"] | None = None,
    saved: bool | None = None,
    part_self_grade: Literal["not_started", "again", "partial", "mastered"] | None = None,
    part_retry_later: bool | None = None,
    part_correction_revealed: bool | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_exam_bank(
        db,
        user,
        subject_id=subject_id,
        topic_id=topic_id,
        year=year,
        q=q,
        progress_status=progress_status,
        saved=saved,
        part_self_grade=part_self_grade,
        part_retry_later=part_retry_later,
        part_correction_revealed=part_correction_revealed,
    )


@router.get("/problems/{problem_id}", response_model=ExamBankProblemDetailOut)
async def get_exam_bank_problem(
    problem_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    problem = await get_exam_problem_detail(db, user, problem_id=problem_id)
    if problem is None:
        raise HTTPException(status_code=404, detail="Exam problem not found")
    return problem


@router.post("/problems/{problem_id}/progress", response_model=ExamProblemProgressOut)
async def update_exam_bank_problem_progress(
    problem_id: int,
    body: ExamProblemProgressIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await record_exam_problem_progress(db, user, problem_id=problem_id, body=body)


@router.post("/parts/{part_id}/progress", response_model=ExamProblemPartProgressOut)
async def update_exam_bank_part_progress(
    part_id: int,
    body: ExamProblemPartProgressIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await record_exam_problem_part_progress(db, user, part_id=part_id, body=body)
