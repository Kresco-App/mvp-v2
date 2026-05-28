from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.gamification import (
    DailyQuest,
    TopicItemProgress,
    XPTransaction,
)
from app.models.interactions import SavedItem


@dataclass(frozen=True)
class DataIntegrityFinding:
    check: str
    key: dict[str, Any]
    count: int


async def audit_data_integrity(db: AsyncSession) -> list[DataIntegrityFinding]:
    findings: list[DataIntegrityFinding] = []
    duplicate_specs = (
        (
            "saved_item_duplicate_user_target",
            SavedItem,
            (SavedItem.user_id, SavedItem.target_type, SavedItem.target_id),
            None,
        ),
        (
            "daily_quest_duplicate_user_type_date",
            DailyQuest,
            (DailyQuest.user_id, DailyQuest.quest_type, DailyQuest.date),
            None,
        ),
        (
            "topic_item_progress_duplicate_user_item",
            TopicItemProgress,
            (TopicItemProgress.user_id, TopicItemProgress.topic_item_id),
            None,
        ),
        (
            "xp_transaction_duplicate_idempotency_key",
            XPTransaction,
            (XPTransaction.idempotency_key,),
            XPTransaction.idempotency_key.is_not(None) & (XPTransaction.idempotency_key != ""),
        ),
    )
    for check, model, columns, where_clause in duplicate_specs:
        findings.extend(await _duplicate_findings(db, check, model, columns, where_clause))
    return findings


async def _duplicate_findings(
    db: AsyncSession,
    check: str,
    model: type,
    columns: Iterable[ColumnElement],
    where_clause: ColumnElement | None,
) -> list[DataIntegrityFinding]:
    grouped_columns = tuple(columns)
    count_label = "duplicate_count"
    stmt: Select = (
        select(*grouped_columns, func.count().label(count_label))
        .select_from(model)
        .group_by(*grouped_columns)
        .having(func.count() > 1)
    )
    if where_clause is not None:
        stmt = stmt.where(where_clause)

    result = await db.execute(stmt)
    findings: list[DataIntegrityFinding] = []
    for row in result.mappings().all():
        key = {column.key: row[column.key] for column in grouped_columns}
        findings.append(DataIntegrityFinding(check=check, key=key, count=int(row[count_label])))
    return findings
