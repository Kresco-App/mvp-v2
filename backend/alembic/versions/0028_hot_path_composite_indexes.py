"""Add composite indexes for topic and watch hot paths

Revision ID: 0028_hot_path_composite_indexes
Revises: 0027_media_quota_counters
Create Date: 2026-05-27 21:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0028_hot_path_composite_indexes"
down_revision: Union[str, None] = "0027_media_quota_counters"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_SPECS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("ix_topic_sections_topic_order", "topic_sections", ("topic_id", "order", "id")),
    ("ix_topic_items_workspace_order", "topic_items", ("topic_id", "status", "section_id", "order", "id")),
    ("ix_tab_contents_item_status_order", "tab_contents", ("topic_item_id", "status", "order", "id")),
    ("ix_topic_item_progress_user_topic_item", "topic_item_progress", ("user_id", "topic_id", "topic_item_id")),
    ("ix_user_notes_user_topic_updated", "user_notes", ("user_id", "topic_id", "updated_at")),
    ("ix_chapters_subject_order", "chapters", ("subject_id", "order", "id")),
    ("ix_chapter_sections_chapter_order", "chapter_sections", ("chapter_id", "order", "id")),
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
