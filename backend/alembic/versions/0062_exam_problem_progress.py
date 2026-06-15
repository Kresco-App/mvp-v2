"""Add exam problem progress.

Revision ID: 0062
Revises: 0061
Create Date: 2026-06-15 10:05:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0062"
down_revision: Union[str, None] = "0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def upgrade() -> None:
    if "user_exam_problem_progress" not in _tables():
        op.create_table(
            "user_exam_problem_progress",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("exam_problem_id", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(length=30), server_default="not_started", nullable=False),
            sa.Column("saved", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["exam_problem_id"], ["exam_problems.id"], ondelete="CASCADE"),
            sa.CheckConstraint("status IN ('not_started', 'opened', 'completed')", name="ck_user_exam_problem_progress_status"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "exam_problem_id", name="uq_user_exam_problem_progress_user_problem"),
        )
    indexes = _indexes("user_exam_problem_progress")
    for name, columns in {
        "ix_user_exam_problem_progress_user_status": ["user_id", "status"],
        "ix_user_exam_problem_progress_problem": ["exam_problem_id"],
    }.items():
        if name not in indexes:
            op.create_index(name, "user_exam_problem_progress", columns)


def downgrade() -> None:
    if "user_exam_problem_progress" in _tables():
        op.drop_table("user_exam_problem_progress")
