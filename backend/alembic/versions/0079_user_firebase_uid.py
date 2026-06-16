"""Add Firebase UID to users.

Revision ID: 0079
Revises: 0078
Create Date: 2026-06-16 08:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0079"
down_revision: Union[str, None] = "0078"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
    if "users" not in _tables():
        return
    if "firebase_uid" not in _columns("users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("firebase_uid", sa.String(length=255), nullable=True))
    if "ix_users_firebase_uid" not in _indexes("users"):
        op.create_index("ix_users_firebase_uid", "users", ["firebase_uid"], unique=True)


def downgrade() -> None:
    if "users" not in _tables():
        return
    if "ix_users_firebase_uid" in _indexes("users"):
        op.drop_index("ix_users_firebase_uid", table_name="users")
    if "firebase_uid" in _columns("users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("firebase_uid")
