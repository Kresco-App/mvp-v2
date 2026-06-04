"""Add realtime outbox retention index.

Revision ID: 0050
Revises: 0049
Create Date: 2026-06-04 22:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0050"
down_revision: Union[str, None] = "0049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "realtime_outbox"
INDEX_NAME = "ix_realtime_outbox_status_updated"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    if INDEX_NAME not in _indexes():
        op.create_index(INDEX_NAME, TABLE_NAME, ["status", "updated_at", "id"], unique=False)


def downgrade() -> None:
    if TABLE_NAME in _tables() and INDEX_NAME in _indexes():
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
