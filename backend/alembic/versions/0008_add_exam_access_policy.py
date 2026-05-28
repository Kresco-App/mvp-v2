"""add exam access policy

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-10 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    exam_columns = _column_names("exams")
    if "required_tier" not in exam_columns:
        op.add_column("exams", sa.Column("required_tier", sa.String(length=40), nullable=False, server_default=""))
    if "required_feature_key" not in exam_columns:
        op.add_column("exams", sa.Column("required_feature_key", sa.String(length=80), nullable=False, server_default=""))
    if "is_free_preview" not in exam_columns:
        op.add_column("exams", sa.Column("is_free_preview", sa.Boolean(), nullable=False, server_default=sa.false()))

    problem_columns = _column_names("exam_problems")
    if "required_tier" not in problem_columns:
        op.add_column("exam_problems", sa.Column("required_tier", sa.String(length=40), nullable=False, server_default=""))
    if "required_feature_key" not in problem_columns:
        op.add_column("exam_problems", sa.Column("required_feature_key", sa.String(length=80), nullable=False, server_default=""))
    if "is_free_preview" not in problem_columns:
        op.add_column("exam_problems", sa.Column("is_free_preview", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    problem_columns = _column_names("exam_problems")
    if "is_free_preview" in problem_columns:
        op.drop_column("exam_problems", "is_free_preview")
    if "required_feature_key" in problem_columns:
        op.drop_column("exam_problems", "required_feature_key")
    if "required_tier" in problem_columns:
        op.drop_column("exam_problems", "required_tier")

    exam_columns = _column_names("exams")
    if "is_free_preview" in exam_columns:
        op.drop_column("exams", "is_free_preview")
    if "required_feature_key" in exam_columns:
        op.drop_column("exams", "required_feature_key")
    if "required_tier" in exam_columns:
        op.drop_column("exams", "required_tier")

