"""Add standalone hot filter indexes

Revision ID: 0039_hot_filter_indexes
Revises: 0038_gamification_context_foreign_keys
Create Date: 2026-05-28 07:35:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0039_hot_filter_indexes"
down_revision: Union[str, None] = "0038_gamification_context_foreign_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_SPECS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("ix_topics_status", "topics", ("status",)),
    ("ix_resources_status", "resources", ("status",)),
    ("ix_exams_status", "exams", ("status",)),
    ("ix_exam_problems_status", "exam_problems", ("status",)),
    ("ix_saved_items_target_lookup", "saved_items", ("target_type", "target_id")),
    ("ix_admin_audit_created_at", "admin_audit_logs", ("created_at",)),
)


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _postgres_index_sql(index_name: str, table_name: str, columns: tuple[str, ...]) -> str:
    columns_sql = ", ".join(_quote_identifier(column) for column in columns)
    return (
        f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {_quote_identifier(index_name)} "
        f"ON {_quote_identifier(table_name)} ({columns_sql})"
    )


def _existing_indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _create_index(index_name: str, table_name: str, columns: tuple[str, ...]) -> None:
    if index_name in _existing_indexes(table_name):
        return
    op.create_index(index_name, table_name, list(columns))


def _drop_index(index_name: str, table_name: str) -> None:
    if index_name in _existing_indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            for index_name, table_name, columns in INDEX_SPECS:
                op.execute(sa.text(_postgres_index_sql(index_name, table_name, columns)))
        return

    for index_name, table_name, columns in INDEX_SPECS:
        _create_index(index_name, table_name, columns)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            for index_name, _, _ in reversed(INDEX_SPECS):
                op.execute(sa.text(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote_identifier(index_name)}"))
        return

    for index_name, table_name, _ in reversed(INDEX_SPECS):
        _drop_index(index_name, table_name)
