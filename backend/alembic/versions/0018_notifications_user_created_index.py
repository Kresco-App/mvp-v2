"""add notification user created index

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-26 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "ix_notifications_user_created"
TABLE_NAME = "notifications"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if TABLE_NAME in _tables() and INDEX_NAME not in _indexes(TABLE_NAME):
        op.create_index(INDEX_NAME, TABLE_NAME, ["user_id", "created_at"])


def downgrade() -> None:
    if TABLE_NAME in _tables() and INDEX_NAME in _indexes(TABLE_NAME):
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)

