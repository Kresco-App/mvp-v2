"""Add mistake notebook entries.

Revision ID: 0063
Revises: 0062
Create Date: 2026-06-15 23:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0063"
down_revision: Union[str, None] = "0062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "mistake_notebook_entries"


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
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("question_id", sa.BigInteger(), nullable=False),
            sa.Column("question_set_id", sa.BigInteger(), nullable=True),
            sa.Column("subject_id", sa.BigInteger(), nullable=True),
            sa.Column("topic_id", sa.BigInteger(), nullable=True),
            sa.Column("topic_section_id", sa.BigInteger(), nullable=True),
            sa.Column("topic_item_id", sa.BigInteger(), nullable=True),
            sa.Column("tab_content_id", sa.BigInteger(), nullable=True),
            sa.Column("first_quiz_attempt_id", sa.BigInteger(), nullable=True),
            sa.Column("last_quiz_attempt_id", sa.BigInteger(), nullable=True),
            sa.Column("first_question_attempt_id", sa.BigInteger(), nullable=True),
            sa.Column("last_question_attempt_id", sa.BigInteger(), nullable=True),
            sa.Column("status", sa.String(length=30), server_default="open", nullable=False),
            sa.Column("mistake_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("corrected_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("last_answer_json", sa.JSON(), nullable=True),
            sa.Column("last_correct_answer_json", sa.JSON(), nullable=True),
            sa.Column("last_grading_json", sa.JSON(), nullable=True),
            sa.Column("last_mistake_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_correct_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["question_set_id"], ["question_sets.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["topic_section_id"], ["topic_sections.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["topic_item_id"], ["topic_items.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["tab_content_id"], ["tab_contents.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["first_quiz_attempt_id"], ["quiz_attempts.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["last_quiz_attempt_id"], ["quiz_attempts.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["first_question_attempt_id"], ["question_attempts.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["last_question_attempt_id"], ["question_attempts.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("user_id", "question_id", name="uq_mistake_notebook_entries_user_question"),
            sa.CheckConstraint("status IN ('open', 'corrected')", name="ck_mistake_notebook_entries_status"),
            sa.CheckConstraint("mistake_count >= 0", name="ck_mistake_notebook_entries_mistake_count_nonnegative"),
            sa.CheckConstraint("corrected_count >= 0", name="ck_mistake_notebook_entries_corrected_count_nonnegative"),
        )

    indexes = _indexes(TABLE_NAME)
    for name, columns in {
        "ix_mistake_notebook_entries_user_id": ["user_id"],
        "ix_mistake_notebook_entries_question": ["question_id"],
        "ix_mistake_notebook_entries_question_set_id": ["question_set_id"],
        "ix_mistake_notebook_entries_subject_id": ["subject_id"],
        "ix_mistake_notebook_entries_topic_id": ["topic_id"],
        "ix_mistake_notebook_entries_topic_section_id": ["topic_section_id"],
        "ix_mistake_notebook_entries_topic_item_id": ["topic_item_id"],
        "ix_mistake_notebook_entries_tab_content_id": ["tab_content_id"],
        "ix_mistake_notebook_entries_first_quiz_attempt_id": ["first_quiz_attempt_id"],
        "ix_mistake_notebook_entries_last_quiz_attempt_id": ["last_quiz_attempt_id"],
        "ix_mistake_notebook_entries_first_question_attempt_id": ["first_question_attempt_id"],
        "ix_mistake_notebook_entries_last_question_attempt_id": ["last_question_attempt_id"],
        "ix_mistake_notebook_entries_user_status_updated": ["user_id", "status", "updated_at"],
        "ix_mistake_notebook_entries_user_subject_status": ["user_id", "subject_id", "status"],
        "ix_mistake_notebook_entries_user_topic_status": ["user_id", "topic_id", "status"],
    }.items():
        if name not in indexes:
            op.create_index(name, TABLE_NAME, columns)


def downgrade() -> None:
    if TABLE_NAME in _tables():
        op.drop_table(TABLE_NAME)
