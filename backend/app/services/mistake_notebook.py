from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.mistake_notebook import (
    MISTAKE_NOTEBOOK_STATUS_CORRECTED,
    MISTAKE_NOTEBOOK_STATUS_OPEN,
    MISTAKE_NOTEBOOK_STATUSES,
    MistakeNotebookEntry,
)
from app.models.quizzes import QuestionSet
from app.models.users import User

MistakeNotebookStatus = Literal["open", "corrected"]


async def update_mistake_notebook_from_question_attempts(
    db: AsyncSession,
    *,
    user_id: int,
    question_set: QuestionSet,
    quiz_attempt_id: int,
    question_attempts: list[dict],
) -> None:
    if not question_attempts:
        return

    now = datetime.now(timezone.utc)
    for question_attempt in question_attempts:
        entry = await db.scalar(
            select(MistakeNotebookEntry)
            .where(
                MistakeNotebookEntry.user_id == user_id,
                MistakeNotebookEntry.question_id == question_attempt["question_id"],
            )
            .with_for_update()
        )
        if question_attempt["is_correct"]:
            if entry is not None and entry.status == MISTAKE_NOTEBOOK_STATUS_OPEN:
                _mark_entry_corrected(
                    entry,
                    question_attempt=question_attempt,
                    question_set_id=question_set.id,
                    quiz_attempt_id=quiz_attempt_id,
                    now=now,
                )
            continue

        if entry is None:
            entry = MistakeNotebookEntry(
                user_id=user_id,
                question_id=question_attempt["question_id"],
                question_set_id=question_set.id,
                subject_id=question_attempt["subject_id"],
                topic_id=question_attempt["topic_id"],
                topic_section_id=question_attempt["topic_section_id"],
                topic_item_id=question_attempt["topic_item_id"],
                tab_content_id=question_attempt["tab_content_id"],
                first_quiz_attempt_id=quiz_attempt_id,
                first_question_attempt_id=question_attempt["id"],
            )
            db.add(entry)
        _mark_entry_open(
            entry,
            question_attempt=question_attempt,
            question_set_id=question_set.id,
            quiz_attempt_id=quiz_attempt_id,
            now=now,
        )


def _mark_entry_open(
    entry: MistakeNotebookEntry,
    *,
    question_attempt: dict,
    question_set_id: int,
    quiz_attempt_id: int,
    now: datetime,
) -> None:
    entry.status = MISTAKE_NOTEBOOK_STATUS_OPEN
    _sync_entry_context(entry, question_attempt=question_attempt, question_set_id=question_set_id)
    entry.last_quiz_attempt_id = quiz_attempt_id
    entry.last_question_attempt_id = question_attempt["id"]
    entry.mistake_count = (entry.mistake_count or 0) + 1
    entry.last_answer_json = question_attempt["selected_answer_json"] or {}
    entry.last_correct_answer_json = question_attempt["correct_answer_json"] or {}
    entry.last_grading_json = question_attempt["grading_json"] or {}
    entry.last_mistake_at = now
    entry.updated_at = now


def _mark_entry_corrected(
    entry: MistakeNotebookEntry,
    *,
    question_attempt: dict,
    question_set_id: int,
    quiz_attempt_id: int,
    now: datetime,
) -> None:
    entry.status = MISTAKE_NOTEBOOK_STATUS_CORRECTED
    _sync_entry_context(entry, question_attempt=question_attempt, question_set_id=question_set_id)
    entry.last_quiz_attempt_id = quiz_attempt_id
    entry.last_question_attempt_id = question_attempt["id"]
    entry.corrected_count = (entry.corrected_count or 0) + 1
    entry.last_answer_json = question_attempt["selected_answer_json"] or {}
    entry.last_correct_answer_json = question_attempt["correct_answer_json"] or {}
    entry.last_grading_json = question_attempt["grading_json"] or {}
    entry.last_correct_at = now
    entry.updated_at = now


def _sync_entry_context(
    entry: MistakeNotebookEntry,
    *,
    question_attempt: dict,
    question_set_id: int,
) -> None:
    entry.question_set_id = question_set_id
    entry.subject_id = question_attempt["subject_id"]
    entry.topic_id = question_attempt["topic_id"]
    entry.topic_section_id = question_attempt["topic_section_id"]
    entry.topic_item_id = question_attempt["topic_item_id"]
    entry.tab_content_id = question_attempt["tab_content_id"]


async def list_mistake_notebook_entries(
    db: AsyncSession,
    *,
    user: User,
    status: MistakeNotebookStatus | None = None,
    subject_id: int | None = None,
    topic_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    filters = [MistakeNotebookEntry.user_id == user.id]
    if status is not None:
        if status not in MISTAKE_NOTEBOOK_STATUSES:
            raise ValueError("Unsupported mistake notebook status")
        filters.append(MistakeNotebookEntry.status == status)
    if subject_id is not None:
        filters.append(MistakeNotebookEntry.subject_id == subject_id)
    if topic_id is not None:
        filters.append(MistakeNotebookEntry.topic_id == topic_id)

    total = await db.scalar(select(func.count()).select_from(MistakeNotebookEntry).where(*filters))
    result = await db.execute(
        select(MistakeNotebookEntry)
        .options(selectinload(MistakeNotebookEntry.question))
        .where(*filters)
        .order_by(MistakeNotebookEntry.updated_at.desc(), MistakeNotebookEntry.id.desc())
        .offset(offset)
        .limit(limit)
    )
    entries = result.scalars().all()
    return {
        "total": int(total or 0),
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": entry.id,
                "question_id": entry.question_id,
                "question_set_id": entry.question_set_id,
                "subject_id": entry.subject_id,
                "topic_id": entry.topic_id,
                "topic_section_id": entry.topic_section_id,
                "topic_item_id": entry.topic_item_id,
                "tab_content_id": entry.tab_content_id,
                "status": entry.status,
                "mistake_count": entry.mistake_count,
                "corrected_count": entry.corrected_count,
                "last_answer_json": entry.last_answer_json or {},
                "last_mistake_at": entry.last_mistake_at,
                "last_correct_at": entry.last_correct_at,
                "updated_at": entry.updated_at,
                "question_title": entry.question.title if entry.question is not None else "",
                "question_prompt": entry.question.prompt if entry.question is not None else "",
                "question_type": entry.question.type if entry.question is not None else "",
                "question_difficulty": entry.question.difficulty if entry.question is not None else "",
                "question_concept_slugs": entry.question.concept_slugs if entry.question is not None else [],
            }
            for entry in entries
        ],
    }
