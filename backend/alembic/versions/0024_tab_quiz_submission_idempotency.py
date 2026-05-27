"""add tab quiz submission idempotency

Revision ID: 0024_tab_quiz_submission_idempotency
Revises: 0023_context_and_professor_fks
Create Date: 2026-05-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_tab_quiz_submission_idempotency"
down_revision: Union[str, None] = "0023_context_and_professor_fks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_quiz_attempts_user_set_submission"


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
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if "quiz_attempts" not in _tables():
        return
    if "submission_hash" not in _columns("quiz_attempts"):
        op.add_column("quiz_attempts", sa.Column("submission_hash", sa.String(length=64), nullable=True))
    if INDEX_NAME not in _indexes("quiz_attempts"):
        op.create_index(
            INDEX_NAME,
            "quiz_attempts",
            ["user_id", "question_set_id", "submission_hash"],
            unique=True,
        )


def downgrade() -> None:
    if "quiz_attempts" not in _tables():
        return
    if INDEX_NAME in _indexes("quiz_attempts"):
        op.drop_index(INDEX_NAME, table_name="quiz_attempts")
    if "submission_hash" in _columns("quiz_attempts"):
        op.drop_column("quiz_attempts", "submission_hash")
