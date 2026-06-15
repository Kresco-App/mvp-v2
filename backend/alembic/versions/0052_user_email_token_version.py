"""Separate email link tokens from session token rotation.

Revision ID: 0052
Revises: 0051
Create Date: 2026-06-04 23:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0052"
down_revision: Union[str, None] = "0051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "users"
COLUMN_NAME = "email_token_version"


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def upgrade() -> None:
    created_column = False
    if COLUMN_NAME not in _columns():
        op.add_column(
            TABLE_NAME,
            sa.Column(COLUMN_NAME, sa.Integer(), nullable=False, server_default="0"),
        )
        created_column = True
    if created_column:
        op.execute(
            sa.text(
                "UPDATE users "
                "SET email_token_version = COALESCE(auth_token_version, 0)"
            )
        )


def downgrade() -> None:
    if COLUMN_NAME in _columns():
        op.drop_column(TABLE_NAME, COLUMN_NAME)
