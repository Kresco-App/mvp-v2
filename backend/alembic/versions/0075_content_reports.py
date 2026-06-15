"""Add content reports queue.

Revision ID: 0075
Revises: 0074
Create Date: 2026-06-18 04:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0075"
down_revision: Union[str, None] = "0074"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_NAME = "content_reports"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {
        index["name"]
        for index in inspector.get_indexes(TABLE_NAME)
        if index.get("name")
    }


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("reporter_user_id", sa.BigInteger(), nullable=False),
            sa.Column("target_type", sa.String(length=40), nullable=False),
            sa.Column("target_id", sa.String(length=120), server_default="", nullable=False),
            sa.Column("subject_id", sa.BigInteger(), nullable=True),
            sa.Column("topic_id", sa.BigInteger(), nullable=True),
            sa.Column("topic_item_id", sa.BigInteger(), nullable=True),
            sa.Column("reason", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=30), server_default="open", nullable=False),
            sa.Column("priority", sa.String(length=20), server_default="normal", nullable=False),
            sa.Column("title", sa.String(length=160), server_default="", nullable=False),
            sa.Column("description", sa.Text(), server_default="", nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("idempotency_key", sa.String(length=180), nullable=False),
            sa.Column("assigned_to_user_id", sa.BigInteger(), nullable=True),
            sa.Column("reviewed_by_user_id", sa.BigInteger(), nullable=True),
            sa.Column("resolution_note", sa.Text(), server_default="", nullable=False),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.CheckConstraint(
                "target_type IN ('access', 'ai_answer', 'app', 'comment', 'exam', 'exam_problem', "
                "'exam_problem_part', 'exercise', 'live_message', 'live_session', 'payment', 'question', "
                "'question_set', 'quiz_attempt', 'resource', 'tab_content', 'topic', 'topic_item')",
                name="ck_content_reports_target_type",
            ),
            sa.CheckConstraint(
                "reason IN ('broken_content', 'bug', 'inappropriate', 'missing_answer', 'other', "
                "'payment_access', 'spam', 'wrong_answer')",
                name="ck_content_reports_reason",
            ),
            sa.CheckConstraint("status IN ('open', 'in_review', 'resolved', 'dismissed')", name="ck_content_reports_status"),
            sa.CheckConstraint("priority IN ('low', 'normal', 'high', 'urgent')", name="ck_content_reports_priority"),
            sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["reporter_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("reporter_user_id", "idempotency_key", name="uq_content_reports_reporter_idempotency"),
        )

    indexes = _indexes()
    index_specs = [
        ("ix_content_reports_assignee_status", ["assigned_to_user_id", "status"]),
        ("ix_content_reports_reporter_created", ["reporter_user_id", "created_at"]),
        ("ix_content_reports_status_created", ["status", "created_at"]),
        ("ix_content_reports_subject_id", ["subject_id"]),
        ("ix_content_reports_target", ["target_type", "target_id"]),
        ("ix_content_reports_topic_id", ["topic_id"]),
        ("ix_content_reports_topic_item_id", ["topic_item_id"]),
    ]
    for index_name, columns in index_specs:
        if index_name not in indexes:
            op.create_index(index_name, TABLE_NAME, columns)


def downgrade() -> None:
    if TABLE_NAME in _tables():
        op.drop_table(TABLE_NAME)
