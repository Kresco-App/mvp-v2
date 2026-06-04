"""Add professor unread chat counter

Revision ID: 0049
Revises: 0048
Create Date: 2026-06-04 21:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0049"
down_revision: Union[str, None] = "0048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "users"
COLUMN_NAME = "professor_unread_chat_count"


def _existing_columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if COLUMN_NAME in _existing_columns(TABLE_NAME):
        return
    op.add_column(
        TABLE_NAME,
        sa.Column(COLUMN_NAME, sa.Integer(), nullable=False, server_default="0"),
    )
    if "professor_chat_conversations" in sa.inspect(op.get_bind()).get_table_names():
        op.execute(
            """
            UPDATE users
            SET professor_unread_chat_count = COALESCE((
                SELECT SUM(unread_for_professor)
                FROM professor_chat_conversations
                WHERE professor_chat_conversations.professor_user_id = users.id
                  AND professor_chat_conversations.unread_for_professor > 0
            ), 0)
            """
        )


def downgrade() -> None:
    if COLUMN_NAME in _existing_columns(TABLE_NAME):
        op.drop_column(TABLE_NAME, COLUMN_NAME)
