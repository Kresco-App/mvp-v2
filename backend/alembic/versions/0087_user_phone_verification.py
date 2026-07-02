"""Add Firebase phone verification fields to users.

Revision ID: 0087
Revises: 0086
Create Date: 2026-07-02 12:25:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0087"
down_revision: Union[str, None] = "0086"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "users"


def _tables() -> set[str]:
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
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        return

    existing_columns = _columns(TABLE_NAME)
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        if "phone_number" not in existing_columns:
            batch_op.add_column(sa.Column("phone_number", sa.String(length=32), nullable=True))
        if "is_phone_verified" not in existing_columns:
            batch_op.add_column(
                sa.Column("is_phone_verified", sa.Boolean(), nullable=False, server_default=sa.false())
            )
        if "phone_verified_at" not in existing_columns:
            batch_op.add_column(sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True))

    if "ix_users_phone_number" not in _indexes(TABLE_NAME):
        op.create_index("ix_users_phone_number", TABLE_NAME, ["phone_number"], unique=True)


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return

    if "ix_users_phone_number" in _indexes(TABLE_NAME):
        op.drop_index("ix_users_phone_number", table_name=TABLE_NAME)

    existing_columns = _columns(TABLE_NAME)
    columns_to_drop = [
        column
        for column in ("phone_verified_at", "is_phone_verified", "phone_number")
        if column in existing_columns
    ]
    if not columns_to_drop:
        return

    with op.batch_alter_table(TABLE_NAME) as batch_op:
        for column in columns_to_drop:
            batch_op.drop_column(column)
