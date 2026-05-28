"""add kresco v1 topic workspace foundation

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-09 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "topics" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "concept_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("tag_type", sa.String(length=40), nullable=False, server_default="concept"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f("ix_concept_tags_slug"), "concept_tags", ["slug"], unique=True)

    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progress_weight_main", sa.Integer(), nullable=False, server_default="75"),
        sa.Column("required_tier", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("required_feature_key", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("is_free_preview", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f("ix_topics_slug"), "topics", ["slug"], unique=True)

    op.create_table(
        "resources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_id", sa.BigInteger(), sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("resource_type", sa.String(length=60), nullable=False),
        sa.Column("provider", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("provider_resource_id", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
        sa.Column("is_free_preview", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("required_tier", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("required_feature_key", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "topic_sections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_id", sa.BigInteger(), sa.ForeignKey("topics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("section_type", sa.String(length=40), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "topic_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_id", sa.BigInteger(), sa.ForeignKey("topics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_id", sa.BigInteger(), sa.ForeignKey("topic_sections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("primary_resource_id", sa.BigInteger(), sa.ForeignKey("resources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("item_type", sa.String(length=60), nullable=False),
        sa.Column("renderer_key", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
        sa.Column("completion_policy", sa.String(length=40), nullable=False, server_default="manual"),
        sa.Column("required_tier", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("required_feature_key", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("is_free_preview", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("concept_slugs", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "tab_contents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_item_id", sa.BigInteger(), sa.ForeignKey("topic_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_id", sa.BigInteger(), sa.ForeignKey("resources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("tab_type", sa.String(length=60), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("config_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("renderer_key", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
        sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("required_tier", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("required_feature_key", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("concept_slugs", sa.JSON(), nullable=False, server_default="[]"),
    )

    op.create_table(
        "exams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("session", sa.String(length=120), nullable=False, server_default="National"),
        sa.Column("statement_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
    )

    op.create_table(
        "exam_problems",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.BigInteger(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_id", sa.BigInteger(), sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("video_resource_id", sa.BigInteger(), sa.ForeignKey("resources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False, server_default=""),
        sa.Column("written_solution", sa.Text(), nullable=False, server_default=""),
        sa.Column("written_solution_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("difficulty", sa.String(length=40), nullable=False, server_default="bac"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
        sa.Column("concept_slugs", sa.JSON(), nullable=False, server_default="[]"),
    )

    op.create_table(
        "user_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("topic_item_id", sa.Integer(), nullable=True),
        sa.Column("tab_content_id", sa.Integer(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "saved_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("topic_item_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "activity_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("topic_item_id", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "topic_item_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.Column("topic_item_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="started"),
        sa.Column("watched_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("best_score", sa.Integer(), nullable=True),
        sa.Column("latest_score", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("topic_item_id", sa.Integer(), nullable=True),
        sa.Column("tab_content_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=40), nullable=False, server_default="tab"),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("answers", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("grading", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    for table in (
        "quiz_attempts",
        "topic_item_progress",
        "activity_events",
        "saved_items",
        "user_notes",
        "exam_problems",
        "exams",
        "tab_contents",
        "topic_items",
        "topic_sections",
        "resources",
        "topics",
        "concept_tags",
    ):
        op.drop_table(table)

