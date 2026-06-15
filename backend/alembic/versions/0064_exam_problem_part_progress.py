"""Add exam problem part progress.

Revision ID: 0064
Revises: 0063
Create Date: 2026-06-16 00:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0064"
down_revision: Union[str, None] = "0063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "user_exam_problem_part_progress"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("exam_problem_part_id", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(length=30), server_default="not_started", nullable=False),
            sa.Column("current_self_grade", sa.String(length=30), server_default="not_started", nullable=False),
            sa.Column("correction_reveal_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("video_watch_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("retry_later", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("self_grade_history_json", sa.JSON(), nullable=False),
            sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("first_correction_revealed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_correction_revealed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_video_watched_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["exam_problem_part_id"], ["exam_problem_parts.id"], ondelete="CASCADE"),
            sa.CheckConstraint("status IN ('not_started', 'opened')", name="ck_user_exam_problem_part_progress_status"),
            sa.CheckConstraint(
                "current_self_grade IN ('not_started', 'again', 'partial', 'mastered')",
                name="ck_user_exam_problem_part_progress_self_grade",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "exam_problem_part_id", name="uq_user_exam_problem_part_progress_user_part"),
        )

    indexes = _indexes(TABLE_NAME)
    for name, columns in {
        "ix_user_exam_problem_part_progress_user_status": ["user_id", "status"],
        "ix_user_exam_problem_part_progress_user_grade": ["user_id", "current_self_grade"],
        "ix_user_exam_problem_part_progress_part": ["exam_problem_part_id"],
    }.items():
        if name not in indexes:
            op.create_index(name, TABLE_NAME, columns)


def downgrade() -> None:
    if TABLE_NAME in _tables():
        op.drop_table(TABLE_NAME)
