"""Add TopicItemProgress topic item leading index

Revision ID: 0048
Revises: 0047
Create Date: 2026-06-04 17:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0048"
down_revision: Union[str, None] = "0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "ix_topic_item_progress_topic_item_id"
TABLE_NAME = "topic_item_progress"
COLUMNS = ("topic_item_id",)


def _existing_indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if INDEX_NAME in _existing_indexes(TABLE_NAME):
        return
    op.create_index(INDEX_NAME, TABLE_NAME, list(COLUMNS))


def downgrade() -> None:
    if INDEX_NAME in _existing_indexes(TABLE_NAME):
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
