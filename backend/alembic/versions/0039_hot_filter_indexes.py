"""Add standalone hot filter indexes

Revision ID: 0039
Revises: 0038
Create Date: 2026-05-28 07:35:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0039"
down_revision: Union[str, None] = "0038"
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


def _indexable_specs() -> list[tuple[str, str, tuple[str, ...]]]:
    inspector = sa.inspect(op.get_bind())
    table_names = set(inspector.get_table_names())
    specs: list[tuple[str, str, tuple[str, ...]]] = []
    for index_name, table_name, columns in INDEX_SPECS:
        if table_name not in table_names:
            continue
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        if set(columns).issubset(existing_columns):
            specs.append((index_name, table_name, columns))
    return specs


def _create_index(index_name: str, table_name: str, columns: tuple[str, ...]) -> None:
    if index_name in _existing_indexes(table_name):
        return
    op.create_index(index_name, table_name, list(columns))


def _drop_index(index_name: str, table_name: str) -> None:
    if index_name in _existing_indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    specs = _indexable_specs()
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            for index_name, table_name, columns in specs:
                op.execute(sa.text(_postgres_index_sql(index_name, table_name, columns)))
        return

    for index_name, table_name, columns in specs:
        _create_index(index_name, table_name, columns)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            for index_name, _, _ in reversed(INDEX_SPECS):
                op.execute(sa.text(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote_identifier(index_name)}"))
        return

    for index_name, table_name, _ in reversed(INDEX_SPECS):
        _drop_index(index_name, table_name)

