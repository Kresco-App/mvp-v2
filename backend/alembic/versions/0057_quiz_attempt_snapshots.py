"""Add quiz attempt question snapshots.

Revision ID: 0057
Revises: 0056
Create Date: 2026-06-15 14:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0057"
down_revision: Union[str, None] = "0056"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "quiz_attempts"


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME) if index.get("name")}


def upgrade() -> None:
    if TABLE_NAME not in sa.inspect(op.get_bind()).get_table_names():
        return

    columns = _columns()
    if "question_snapshot_json" not in columns:
        op.add_column(TABLE_NAME, sa.Column("question_snapshot_json", sa.JSON(), nullable=True))
    if "question_snapshot_hash" not in columns:
        op.add_column(TABLE_NAME, sa.Column("question_snapshot_hash", sa.String(length=64), nullable=True))
    if "question_snapshot_version" not in columns:
        op.add_column(
            TABLE_NAME,
            sa.Column("question_snapshot_version", sa.Integer(), server_default="1", nullable=False),
        )

    if "ix_quiz_attempts_question_snapshot_hash" not in _indexes():
        op.create_index("ix_quiz_attempts_question_snapshot_hash", TABLE_NAME, ["question_snapshot_hash"])


def downgrade() -> None:
    if TABLE_NAME not in sa.inspect(op.get_bind()).get_table_names():
        return
    indexes = _indexes()
    if "ix_quiz_attempts_question_snapshot_hash" in indexes:
        op.drop_index("ix_quiz_attempts_question_snapshot_hash", table_name=TABLE_NAME)

    columns = _columns()
    for column_name in ("question_snapshot_version", "question_snapshot_hash", "question_snapshot_json"):
        if column_name in columns:
            op.drop_column(TABLE_NAME, column_name)
