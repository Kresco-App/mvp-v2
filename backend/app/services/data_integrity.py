from dataclasses import dataclass
from typing import Any, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import ContentProgress, DailyQuest, LessonProgress, XPTransaction
from app.models.interactions import SavedItem


@dataclass(frozen=True)
class IntegrityFinding:
    check: str
    key: dict[str, Any]
    count: int


async def audit_data_integrity(db: AsyncSession) -> list[IntegrityFinding]:
    findings: list[IntegrityFinding] = []
    findings.extend(
        await _duplicate_groups(
            db,
            "lesson_progress_duplicate_user_lesson",
            LessonProgress,
            [LessonProgress.user_id, LessonProgress.lesson_id],
        )
    )
    findings.extend(
        await _duplicate_groups(
            db,
            "content_progress_duplicate_user_item",
            ContentProgress,
            [ContentProgress.user_id, ContentProgress.item_type, ContentProgress.item_id],
        )
    )
    findings.extend(
        await _duplicate_groups(
            db,
            "saved_item_duplicate_user_target",
            SavedItem,
            [SavedItem.user_id, SavedItem.target_type, SavedItem.target_id],
        )
    )
    findings.extend(
        await _duplicate_groups(
            db,
            "daily_quest_duplicate_user_type_date",
            DailyQuest,
            [DailyQuest.user_id, DailyQuest.quest_type, DailyQuest.date],
        )
    )
    findings.extend(
        await _duplicate_groups(
            db,
            "xp_transaction_duplicate_idempotency_key",
            XPTransaction,
            [XPTransaction.idempotency_key],
            XPTransaction.idempotency_key.is_not(None),
            XPTransaction.idempotency_key != "",
        )
    )
    return findings


async def _duplicate_groups(
    db: AsyncSession,
    check: str,
    model,
    columns: Sequence[Any],
    *where_clauses: Any,
) -> list[IntegrityFinding]:
    duplicate_count = func.count(model.id).label("duplicate_count")
    stmt = (
        select(*columns, duplicate_count)
        .select_from(model)
        .group_by(*columns)
        .having(func.count(model.id) > 1)
        .order_by(*columns)
    )
    if where_clauses:
        stmt = stmt.where(*where_clauses)

    result = await db.execute(stmt)
    findings: list[IntegrityFinding] = []
    for row in result.all():
        mapping = row._mapping
        findings.append(
            IntegrityFinding(
                check=check,
                key={column.key: mapping[column.key] for column in columns},
                count=mapping["duplicate_count"],
            )
        )
    return findings
