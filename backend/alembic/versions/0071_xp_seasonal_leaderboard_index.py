"""Add XP season leaderboard scan index.

Revision ID: 0071
Revises: 0070
Create Date: 2026-06-17 01:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0071"
down_revision: Union[str, None] = "0070"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_xp_transactions_created_user"
TABLE_NAME = "xp_transactions"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {
        index["name"]
        for index in inspector.get_indexes(table_name)
        if index.get("name")
    }


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    if INDEX_NAME not in _indexes(TABLE_NAME):
        op.create_index(INDEX_NAME, TABLE_NAME, ["created_at", "user_id"])


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    if INDEX_NAME in _indexes(TABLE_NAME):
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
