"""Add concept mastery review scheduling.

Revision ID: 0074
Revises: 0073
Create Date: 2026-06-17 04:00:00.000000
"""
from datetime import datetime, timedelta, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0074"
down_revision: Union[str, None] = "0073"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_NAME = "user_concept_mastery"


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {
        index["name"]
        for index in inspector.get_indexes(TABLE_NAME)
        if index.get("name")
    }


def _review_interval_days(status: str, last_result: str) -> int:
    if last_result in {"incorrect", "mixed"} or status == "weak":
        return 1
    if status == "mastered":
        return 14
    return 4


def _as_datetime(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _backfill_existing_review_schedule() -> None:
    columns = _columns()
    required = {"id", "status", "last_result", "last_practiced_at", "updated_at", "review_interval_days", "next_review_at"}
    if not required <= columns:
        return

    table = sa.table(
        TABLE_NAME,
        sa.column("id", sa.Integer()),
        sa.column("status", sa.String()),
        sa.column("last_result", sa.String()),
        sa.column("last_practiced_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("review_interval_days", sa.Integer()),
        sa.column("next_review_at", sa.DateTime(timezone=True)),
    )
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(
            table.c.id,
            table.c.status,
            table.c.last_result,
            table.c.last_practiced_at,
            table.c.updated_at,
            table.c.next_review_at,
        )
    ).all()
    for row in rows:
        if row.next_review_at is not None:
            continue
        interval = _review_interval_days(str(row.status or "weak"), str(row.last_result or "unknown"))
        practiced_at = _as_datetime(row.last_practiced_at or row.updated_at)
        bind.execute(
            table.update()
            .where(table.c.id == row.id)
            .values(
                review_interval_days=interval,
                next_review_at=practiced_at + timedelta(days=interval),
            )
        )


def upgrade() -> None:
    columns = _columns()
    if "review_interval_days" not in columns:
        op.add_column(
            TABLE_NAME,
            sa.Column("review_interval_days", sa.Integer(), server_default="1", nullable=False),
        )
    if "next_review_at" not in columns:
        op.add_column(
            TABLE_NAME,
            sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        )
    _backfill_existing_review_schedule()

    indexes = _indexes()
    if "ix_user_concept_mastery_user_next_review" not in indexes:
        op.create_index(
            "ix_user_concept_mastery_user_next_review",
            TABLE_NAME,
            ["user_id", "next_review_at"],
        )


def downgrade() -> None:
    columns = _columns()
    indexes = _indexes()
    if "ix_user_concept_mastery_user_next_review" in indexes:
        op.drop_index("ix_user_concept_mastery_user_next_review", table_name=TABLE_NAME)
    if "next_review_at" in columns:
        op.drop_column(TABLE_NAME, "next_review_at")
    if "review_interval_days" in columns:
        op.drop_column(TABLE_NAME, "review_interval_days")
