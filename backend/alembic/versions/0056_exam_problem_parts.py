"""Add exam problem parts.

Revision ID: 0056
Revises: 0055
Create Date: 2026-06-15 09:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0056"
down_revision: Union[str, None] = "0055"
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
    if "exam_problem_parts" not in _tables():
        op.create_table(
            "exam_problem_parts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("exam_problem_id", sa.BigInteger(), nullable=False),
            sa.Column("topic_id", sa.BigInteger(), nullable=True),
            sa.Column("video_resource_id", sa.BigInteger(), nullable=True),
            sa.Column("part_label", sa.String(length=40), server_default="", nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("statement_body", sa.Text(), nullable=False),
            sa.Column("written_solution_body", sa.Text(), nullable=False),
            sa.Column("written_solution_url", sa.String(length=500), server_default="", nullable=False),
            sa.Column("correction_video_url", sa.String(length=500), server_default="", nullable=False),
            sa.Column("order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("difficulty", sa.String(length=40), server_default="bac", nullable=False),
            sa.Column("concept_slugs", sa.JSON(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("required_tier", sa.String(length=40), nullable=False),
            sa.Column("required_feature_key", sa.String(length=80), nullable=False),
            sa.Column("is_free_preview", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["exam_problem_id"], ["exam_problems.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["video_resource_id"], ["resources.id"], ondelete="SET NULL"),
            sa.CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_exam_problem_parts_status"),
            sa.PrimaryKeyConstraint("id"),
        )
    indexes = _indexes("exam_problem_parts")
    for name, columns in {
        "ix_exam_problem_parts_exam_problem_id": ["exam_problem_id"],
        "ix_exam_problem_parts_topic_id": ["topic_id"],
        "ix_exam_problem_parts_video_resource_id": ["video_resource_id"],
        "ix_exam_problem_parts_problem_order": ["exam_problem_id", "status", "order", "id"],
        "ix_exam_problem_parts_topic_status": ["topic_id", "status"],
    }.items():
        if name not in indexes:
            op.create_index(name, "exam_problem_parts", columns)


def downgrade() -> None:
    if "exam_problem_parts" in _tables():
        op.drop_table("exam_problem_parts")
