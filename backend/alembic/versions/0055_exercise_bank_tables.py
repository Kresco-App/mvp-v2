"""Add exercise bank tables.

Revision ID: 0055
Revises: 0054
Create Date: 2026-06-15 08:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0055"
down_revision: Union[str, None] = "0054"
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
    tables = _tables()
    if "exercises" not in tables:
        op.create_table(
            "exercises",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("subject_id", sa.BigInteger(), nullable=False),
            sa.Column("topic_id", sa.BigInteger(), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("slug", sa.String(length=180), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("statement_body", sa.Text(), nullable=False),
            sa.Column("solution_body", sa.Text(), nullable=False),
            sa.Column("solution_video_url", sa.String(length=500), nullable=False),
            sa.Column("difficulty", sa.String(length=40), server_default="medium", nullable=False),
            sa.Column("estimated_minutes", sa.Integer(), server_default="0", nullable=False),
            sa.Column("order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("source_type", sa.String(length=60), server_default="exercise_bank", nullable=False),
            sa.Column("concept_slugs", sa.JSON(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("required_tier", sa.String(length=40), nullable=False),
            sa.Column("required_feature_key", sa.String(length=80), nullable=False),
            sa.Column("is_free_preview", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
            sa.CheckConstraint("difficulty IN ('easy', 'medium', 'hard', 'bac')", name="ck_exercises_difficulty"),
            sa.CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_exercises_status"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug"),
        )
    exercise_indexes = _indexes("exercises")
    for name, columns in {
        "ix_exercises_subject_id": ["subject_id"],
        "ix_exercises_topic_id": ["topic_id"],
        "ix_exercises_slug": ["slug"],
        "ix_exercises_subject_topic_status": ["subject_id", "topic_id", "status"],
        "ix_exercises_subject_difficulty": ["subject_id", "difficulty"],
        "ix_exercises_status_order": ["status", "order", "id"],
    }.items():
        if name not in exercise_indexes:
            op.create_index(name, "exercises", columns)

    tables = _tables()
    if "exercise_assets" not in tables:
        op.create_table(
            "exercise_assets",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("exercise_id", sa.BigInteger(), nullable=False),
            sa.Column("asset_type", sa.String(length=40), server_default="image", nullable=False),
            sa.Column("url", sa.String(length=500), nullable=False),
            sa.Column("alt_text", sa.String(length=255), nullable=False),
            sa.Column("caption", sa.Text(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "asset_type IN ('image', 'diagram', 'graph', 'attachment')",
                name="ck_exercise_assets_type",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    asset_indexes = _indexes("exercise_assets")
    for name, columns in {
        "ix_exercise_assets_exercise_id": ["exercise_id"],
        "ix_exercise_assets_exercise_order": ["exercise_id", "order", "id"],
    }.items():
        if name not in asset_indexes:
            op.create_index(name, "exercise_assets", columns)

    tables = _tables()
    if "user_exercise_progress" not in tables:
        op.create_table(
            "user_exercise_progress",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("exercise_id", sa.BigInteger(), nullable=False),
            sa.Column("current_self_grade", sa.String(length=30), server_default="not_started", nullable=False),
            sa.Column("reveal_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("first_revealed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_revealed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("self_grade_history_json", sa.JSON(), nullable=False),
            sa.Column("saved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("notes", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "current_self_grade IN ('not_started', 'again', 'partial', 'mastered')",
                name="ck_user_exercise_progress_self_grade",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "exercise_id", name="uq_user_exercise_progress_user_exercise"),
        )
    progress_indexes = _indexes("user_exercise_progress")
    for name, columns in {
        "ix_user_exercise_progress_user_id": ["user_id"],
        "ix_user_exercise_progress_exercise_id": ["exercise_id"],
        "ix_user_exercise_progress_user_grade": ["user_id", "current_self_grade"],
        "ix_user_exercise_progress_exercise": ["exercise_id"],
    }.items():
        if name not in progress_indexes:
            op.create_index(name, "user_exercise_progress", columns)


def downgrade() -> None:
    tables = _tables()
    if "user_exercise_progress" in tables:
        op.drop_table("user_exercise_progress")
    tables = _tables()
    if "exercise_assets" in tables:
        op.drop_table("exercise_assets")
    tables = _tables()
    if "exercises" in tables:
        op.drop_table("exercises")
