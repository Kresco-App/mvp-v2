from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings


@dataclass(frozen=True)
class RequiredIndex:
    table: str
    name: str
    columns: tuple[str, ...]


@dataclass(frozen=True)
class PlanCheck:
    name: str
    sql: str
    expected_index: str


@dataclass(frozen=True)
class QueryPlanAuditResult:
    ok: bool
    missing_indexes: tuple[str, ...]
    plan_failures: tuple[str, ...]


REQUIRED_INDEXES: tuple[RequiredIndex, ...] = (
    RequiredIndex("topic_sections", "ix_topic_sections_topic_order", ("topic_id", "order", "id")),
    RequiredIndex("topic_items", "ix_topic_items_workspace_order", ("topic_id", "status", "section_id", "order", "id")),
    RequiredIndex("tab_contents", "ix_tab_contents_item_status_order", ("topic_item_id", "status", "order", "id")),
    RequiredIndex("topic_item_progress", "ix_topic_item_progress_user_topic_item", ("user_id", "topic_id", "topic_item_id")),
    RequiredIndex("user_notes", "ix_user_notes_user_topic_updated", ("user_id", "topic_id", "updated_at")),
    RequiredIndex("chapters", "ix_chapters_subject_order", ("subject_id", "order", "id")),
    RequiredIndex("chapter_sections", "ix_chapter_sections_chapter_order", ("chapter_id", "order", "id")),
)

PLAN_CHECKS: tuple[PlanCheck, ...] = (
    PlanCheck(
        "topic workspace sections",
        'SELECT id FROM topic_sections WHERE topic_id = 1 ORDER BY "order", id',
        "ix_topic_sections_topic_order",
    ),
    PlanCheck(
        "topic workspace items",
        (
            "SELECT id FROM topic_items "
            "WHERE topic_id = 1 AND status = 'published' AND section_id IN (1, 2, 3) "
            'ORDER BY section_id, "order", id'
        ),
        "ix_topic_items_workspace_order",
    ),
    PlanCheck(
        "topic workspace tabs",
        (
            "SELECT id FROM tab_contents "
            "WHERE topic_item_id IN (1, 2, 3) AND status = 'published' "
            'ORDER BY topic_item_id, "order", id'
        ),
        "ix_tab_contents_item_status_order",
    ),
    PlanCheck(
        "topic workspace progress",
        (
            "SELECT id FROM topic_item_progress "
            "WHERE user_id = 1 AND topic_id = 1 AND topic_item_id IN (1, 2, 3)"
        ),
        "ix_topic_item_progress_user_topic_item",
    ),
    PlanCheck(
        "topic workspace notes",
        "SELECT id FROM user_notes WHERE user_id = 1 AND topic_id = 1 ORDER BY updated_at DESC",
        "ix_user_notes_user_topic_updated",
    ),
    PlanCheck(
        "watch context chapters",
        'SELECT id FROM chapters WHERE subject_id = 1 ORDER BY "order", id',
        "ix_chapters_subject_order",
    ),
    PlanCheck(
        "watch context chapter sections",
        'SELECT id FROM chapter_sections WHERE chapter_id = 1 ORDER BY "order", id',
        "ix_chapter_sections_chapter_order",
    ),
)


async def run_query_plan_audit(database_url: str | None = None) -> QueryPlanAuditResult:
    url = database_url or os.environ.get("DATABASE_URL") or Settings().database_url
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            existing_indexes = await connection.run_sync(_load_indexes)
            missing_indexes = tuple(_missing_indexes(existing_indexes))
            plan_failures: tuple[str, ...] = ()
            if not missing_indexes:
                plan_failures = tuple(await _plan_failures(connection))
            return QueryPlanAuditResult(
                ok=not missing_indexes and not plan_failures,
                missing_indexes=missing_indexes,
                plan_failures=plan_failures,
            )
    finally:
        await engine.dispose()


def _load_indexes(sync_connection) -> dict[str, dict[str, tuple[str, ...]]]:
    inspector = sa.inspect(sync_connection)
    tables = set(inspector.get_table_names())
    indexes: dict[str, dict[str, tuple[str, ...]]] = {}
    for table in tables:
        indexes[table] = {
            index["name"]: tuple(index.get("column_names") or ())
            for index in inspector.get_indexes(table)
            if index.get("name")
        }
    return indexes


def _missing_indexes(existing_indexes: dict[str, dict[str, tuple[str, ...]]]) -> list[str]:
    missing: list[str] = []
    for required in REQUIRED_INDEXES:
        table_indexes = existing_indexes.get(required.table, {})
        if table_indexes.get(required.name) != required.columns:
            missing.append(f"{required.table}.{required.name}({', '.join(required.columns)})")
    return missing


async def _plan_failures(connection: AsyncConnection) -> list[str]:
    failures: list[str] = []
    dialect = connection.dialect.name
    for check in PLAN_CHECKS:
        plan_text = await explain_query(connection, check.sql)
        if check.expected_index not in plan_text:
            failures.append(f"{check.name} did not use {check.expected_index}: {plan_text}")
        if dialect == "postgresql" and "Seq Scan" in plan_text:
            failures.append(f"{check.name} used a sequential scan despite index guard: {plan_text}")
        if dialect == "sqlite" and "SCAN " in plan_text and "USING INDEX" not in plan_text:
            failures.append(f"{check.name} used a table scan despite index guard: {plan_text}")
    return failures


async def explain_query(connection: AsyncConnection, sql: str) -> str:
    dialect = connection.dialect.name
    if dialect == "postgresql":
        await connection.execute(text("SET enable_seqscan = off"))
        result = await connection.execute(text(f"EXPLAIN {sql}"))
        return "\n".join(str(row[0]) for row in result)
    if dialect == "sqlite":
        result = await connection.execute(text(f"EXPLAIN QUERY PLAN {sql}"))
        return "\n".join(" ".join(str(part) for part in row) for row in result)
    result = await connection.execute(text(f"EXPLAIN {sql}"))
    return "\n".join(" ".join(str(part) for part in row) for row in result)


def main() -> int:
    result = asyncio.run(run_query_plan_audit())
    if result.ok:
        print("Query plan audit passed.")
        return 0

    print("Query plan audit failed.", file=sys.stderr)
    for missing in result.missing_indexes:
        print(f"- missing index: {missing}", file=sys.stderr)
    for failure in result.plan_failures:
        print(f"- plan failure: {failure}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
