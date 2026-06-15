"""Add user concept mastery projection.

Revision ID: 0073
Revises: 0072
Create Date: 2026-06-17 03:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0073"
down_revision: Union[str, None] = "0072"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_NAME = "user_concept_mastery"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {
        index["name"]
        for index in inspector.get_indexes(table_name)
        if index.get("name")
    }


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("subject_id", sa.BigInteger(), nullable=True),
            sa.Column("topic_id", sa.BigInteger(), nullable=True),
            sa.Column("context_key", sa.String(length=100), server_default="global", nullable=False),
            sa.Column("concept_slug", sa.String(length=120), nullable=False),
            sa.Column("attempts_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("correct_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("incorrect_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("mastery_score", sa.Integer(), server_default="0", nullable=False),
            sa.Column("confidence", sa.Integer(), server_default="0", nullable=False),
            sa.Column("status", sa.String(length=20), server_default="weak", nullable=False),
            sa.Column("last_result", sa.String(length=20), server_default="unknown", nullable=False),
            sa.Column("last_source", sa.String(length=40), server_default="quiz", nullable=False),
            sa.Column("last_question_attempt_id", sa.BigInteger(), nullable=True),
            sa.Column("last_quiz_attempt_id", sa.BigInteger(), nullable=True),
            sa.Column("last_practiced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_correct_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_incorrect_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.CheckConstraint("attempts_count >= 0", name="ck_user_concept_mastery_attempts_nonnegative"),
            sa.CheckConstraint("correct_count >= 0", name="ck_user_concept_mastery_correct_nonnegative"),
            sa.CheckConstraint("incorrect_count >= 0", name="ck_user_concept_mastery_incorrect_nonnegative"),
            sa.CheckConstraint("mastery_score >= 0 AND mastery_score <= 100", name="ck_user_concept_mastery_score_range"),
            sa.CheckConstraint("confidence >= 0 AND confidence <= 100", name="ck_user_concept_mastery_confidence_range"),
            sa.CheckConstraint(
                "last_result IN ('unknown', 'correct', 'incorrect', 'mixed')",
                name="ck_user_concept_mastery_last_result",
            ),
            sa.CheckConstraint(
                "status IN ('weak', 'developing', 'mastered')",
                name="ck_user_concept_mastery_status",
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["last_question_attempt_id"], ["question_attempts.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["last_quiz_attempt_id"], ["quiz_attempts.id"], ondelete="SET NULL"),
            sa.UniqueConstraint(
                "user_id",
                "context_key",
                "concept_slug",
                name="uq_user_concept_mastery_user_context_concept",
            ),
        )

    indexes = _indexes(TABLE_NAME)
    if "ix_user_concept_mastery_user_id" not in indexes:
        op.create_index("ix_user_concept_mastery_user_id", TABLE_NAME, ["user_id"])
    if "ix_user_concept_mastery_subject_id" not in indexes:
        op.create_index("ix_user_concept_mastery_subject_id", TABLE_NAME, ["subject_id"])
    if "ix_user_concept_mastery_topic_id" not in indexes:
        op.create_index("ix_user_concept_mastery_topic_id", TABLE_NAME, ["topic_id"])
    if "ix_user_concept_mastery_user_status_score" not in indexes:
        op.create_index(
            "ix_user_concept_mastery_user_status_score",
            TABLE_NAME,
            ["user_id", "status", "mastery_score"],
        )
    if "ix_user_concept_mastery_user_subject_status" not in indexes:
        op.create_index(
            "ix_user_concept_mastery_user_subject_status",
            TABLE_NAME,
            ["user_id", "subject_id", "status"],
        )
    if "ix_user_concept_mastery_user_topic_status" not in indexes:
        op.create_index(
            "ix_user_concept_mastery_user_topic_status",
            TABLE_NAME,
            ["user_id", "topic_id", "status"],
        )
    if "ix_user_concept_mastery_user_updated" not in indexes:
        op.create_index(
            "ix_user_concept_mastery_user_updated",
            TABLE_NAME,
            ["user_id", "updated_at"],
        )
    if "ix_user_concept_mastery_concept" not in indexes:
        op.create_index("ix_user_concept_mastery_concept", TABLE_NAME, ["concept_slug"])


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    indexes = _indexes(TABLE_NAME)
    for index_name in (
        "ix_user_concept_mastery_concept",
        "ix_user_concept_mastery_user_updated",
        "ix_user_concept_mastery_user_topic_status",
        "ix_user_concept_mastery_user_subject_status",
        "ix_user_concept_mastery_user_status_score",
        "ix_user_concept_mastery_topic_id",
        "ix_user_concept_mastery_subject_id",
        "ix_user_concept_mastery_user_id",
    ):
        if index_name in indexes:
            op.drop_index(index_name, table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)
