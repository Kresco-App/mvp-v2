from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.courses import TopicItem
from app.models.gamification import (
    DailyQuest,
    TopicItemProgress,
    XPDailyCapUsage,
    XPTransaction,
)
from app.models.interactions import SavedItem
from app.services.xp import xp_daily_cap_limit


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
            (XPTransaction.user_id, XPTransaction.idempotency_key),
            XPTransaction.idempotency_key.is_not(None) & (XPTransaction.idempotency_key != ""),
        ),
    )
    for check, model, columns, where_clause in duplicate_specs:
        findings.extend(await _duplicate_findings(db, check, model, columns, where_clause))

    orphan_specs = (
        (
            "topic_item_progress_orphan_topic_item",
            TopicItemProgress,
            (TopicItemProgress.topic_item_id,),
            TopicItem,
            (TopicItem.id,),
            None,
        ),
    )
    for check, model, columns, referred_model, referred_columns, where_clause in orphan_specs:
        findings.extend(
            await _orphan_findings(
                db,
                check,
                model,
                columns,
                referred_model,
                referred_columns,
                where_clause,
            )
        )
    findings.extend(await _xp_daily_cap_findings(db))
    findings.extend(await _xp_daily_cap_usage_findings(db))
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


async def _orphan_findings(
    db: AsyncSession,
    check: str,
    model: type,
    columns: Iterable[ColumnElement],
    referred_model: type,
    referred_columns: Iterable[ColumnElement],
    where_clause: ColumnElement | None,
) -> list[DataIntegrityFinding]:
    grouped_columns = tuple(columns)
    reference_columns = tuple(referred_columns)
    count_label = "orphan_count"
    reference_exists = (
        select(1)
        .select_from(referred_model)
        .where(
            and_(
                *(
                    reference_column == local_column
                    for local_column, reference_column in zip(grouped_columns, reference_columns)
                )
            )
        )
        .exists()
    )
    stmt: Select = (
        select(*grouped_columns, func.count().label(count_label))
        .select_from(model)
        .where(~reference_exists)
        .group_by(*grouped_columns)
    )
    if where_clause is not None:
        stmt = stmt.where(where_clause)

    result = await db.execute(stmt)
    findings: list[DataIntegrityFinding] = []
    for row in result.mappings().all():
        key = {column.key: row[column.key] for column in grouped_columns}
        findings.append(DataIntegrityFinding(check=check, key=key, count=int(row[count_label])))
    return findings


async def _xp_daily_cap_findings(db: AsyncSession) -> list[DataIntegrityFinding]:
    total_label = "amount_total"
    stmt = (
        select(
            XPTransaction.user_id,
            XPTransaction.daily_cap_date,
            XPTransaction.daily_cap_category,
            func.sum(XPTransaction.amount).label(total_label),
        )
        .where(
            XPTransaction.daily_cap_date.is_not(None),
            XPTransaction.daily_cap_category.is_not(None),
        )
        .group_by(
            XPTransaction.user_id,
            XPTransaction.daily_cap_date,
            XPTransaction.daily_cap_category,
        )
    )
    result = await db.execute(stmt)
    findings: list[DataIntegrityFinding] = []
    for row in result.mappings().all():
        category = str(row["daily_cap_category"])
        total = int(row[total_label] or 0)
        limit = xp_daily_cap_limit(category)
        if total <= limit:
            continue
        findings.append(
            DataIntegrityFinding(
                check="xp_daily_cap_exceeded",
                key={
                    "user_id": row["user_id"],
                    "daily_cap_date": row["daily_cap_date"],
                    "daily_cap_category": category,
                    "limit": limit,
                },
                count=total,
            )
        )
    return findings


async def _xp_daily_cap_usage_findings(db: AsyncSession) -> list[DataIntegrityFinding]:
    usage_rows = (
        await db.execute(
            select(
                XPDailyCapUsage.user_id,
                XPDailyCapUsage.award_date,
                XPDailyCapUsage.category,
                XPDailyCapUsage.amount_awarded,
            )
        )
    ).mappings().all()
    usage_by_key = {
        (row["user_id"], row["award_date"], row["category"]): int(row["amount_awarded"] or 0)
        for row in usage_rows
    }

    total_label = "amount_total"
    transaction_rows = (
        await db.execute(
            select(
                XPTransaction.user_id,
                XPTransaction.daily_cap_date,
                XPTransaction.daily_cap_category,
                func.sum(XPTransaction.amount).label(total_label),
            )
            .where(
                XPTransaction.daily_cap_date.is_not(None),
                XPTransaction.daily_cap_category.is_not(None),
            )
            .group_by(
                XPTransaction.user_id,
                XPTransaction.daily_cap_date,
                XPTransaction.daily_cap_category,
            )
        )
    ).mappings().all()
    transaction_by_key = {
        (row["user_id"], row["daily_cap_date"], row["daily_cap_category"]): int(row[total_label] or 0)
        for row in transaction_rows
    }

    findings: list[DataIntegrityFinding] = []
    for user_id, cap_date, category in sorted(set(usage_by_key) | set(transaction_by_key)):
        usage_amount = usage_by_key.get((user_id, cap_date, category), 0)
        transaction_amount = transaction_by_key.get((user_id, cap_date, category), 0)
        limit = xp_daily_cap_limit(str(category))
        key = {
            "user_id": user_id,
            "daily_cap_date": cap_date,
            "daily_cap_category": str(category),
            "usage_amount": usage_amount,
            "transaction_amount": transaction_amount,
            "limit": limit,
        }
        if usage_amount != transaction_amount:
            findings.append(
                DataIntegrityFinding(
                    check="xp_daily_cap_usage_mismatch",
                    key=key,
                    count=abs(usage_amount - transaction_amount),
                )
            )
        if usage_amount > limit:
            findings.append(
                DataIntegrityFinding(
                    check="xp_daily_cap_usage_exceeded",
                    key=key,
                    count=usage_amount,
                )
            )
    return findings
