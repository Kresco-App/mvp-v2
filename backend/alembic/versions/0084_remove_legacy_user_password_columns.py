"""Remove legacy app-owned user password columns.

Revision ID: 0084
Revises: 0083
Create Date: 2026-06-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0084"
down_revision: Union[str, None] = "0083"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "users"
LEGACY_COLUMNS = ("email_token_version", "password_changed_at", "password")


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    existing_columns = _columns(TABLE_NAME)
    columns_to_drop = [column for column in LEGACY_COLUMNS if column in existing_columns]
    if not columns_to_drop:
        return
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        for column in columns_to_drop:
            batch_op.drop_column(column)


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    existing_columns = _columns(TABLE_NAME)
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        if "email_token_version" not in existing_columns:
            batch_op.add_column(sa.Column("email_token_version", sa.Integer(), server_default="0", nullable=True))
        if "password_changed_at" not in existing_columns:
            batch_op.add_column(sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
        if "password" not in existing_columns:
            batch_op.add_column(sa.Column("password", sa.String(length=128), server_default="!", nullable=True))
