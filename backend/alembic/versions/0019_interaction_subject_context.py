"""add subject context to interactions

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-26 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("user_notes", "subject_id"),
    ("saved_items", "subject_id"),
)

INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("ix_user_notes_user_subject", "user_notes", ("user_id", "subject_id")),
    ("ix_saved_items_user_subject", "saved_items", ("user_id", "subject_id")),
)


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    tables = _table_names()
    for table_name, column_name in TABLE_COLUMNS:
        if table_name in tables and column_name not in _columns(table_name):
            op.add_column(table_name, sa.Column(column_name, sa.Integer(), nullable=True))

    for index_name, table_name, columns in INDEXES:
        table_columns = _columns(table_name)
        if table_columns and set(columns).issubset(table_columns) and index_name not in _indexes(table_name):
            op.create_index(index_name, table_name, list(columns))


def downgrade() -> None:
    for index_name, table_name, _columns_for_index in reversed(INDEXES):
        if index_name in _indexes(table_name):
            op.drop_index(index_name, table_name=table_name)

    for table_name, column_name in reversed(TABLE_COLUMNS):
        if table_name in _table_names() and column_name in _columns(table_name):
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.drop_column(column_name)

