"""add normalized topic quiz tracking

Revision ID: 0011_normalized_topic_quiz_tracking
Revises: 0010_add_scalability_indexes
Create Date: 2026-05-13 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_normalized_topic_quiz_tracking"
down_revision: Union[str, None] = "0010_add_scalability_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if table_name not in _tables():
        return
    if index_name in _indexes(table_name):
        return
    if not set(columns).issubset(_columns(table_name)):
        return
    op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    tables = _tables()

    if "question_sets" not in tables:
        op.create_table(
            "question_sets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True),
            sa.Column("topic_id", sa.BigInteger(), sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
            sa.Column("topic_section_id", sa.BigInteger(), sa.ForeignKey("topic_sections.id", ondelete="SET NULL"), nullable=True),
            sa.Column("topic_item_id", sa.BigInteger(), sa.ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True),
            sa.Column("tab_content_id", sa.BigInteger(), sa.ForeignKey("tab_contents.id", ondelete="SET NULL"), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("source_type", sa.String(length=40), nullable=False, server_default="tab"),
            sa.Column("pass_score", sa.Integer(), nullable=False, server_default="70"),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
            sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("concept_slugs", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if "questions" not in tables:
        op.create_table(
            "questions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("question_set_id", sa.BigInteger(), sa.ForeignKey("question_sets.id", ondelete="CASCADE"), nullable=False),
            sa.Column("external_id", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("type", sa.String(length=60), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("prompt", sa.Text(), nullable=False),
            sa.Column("explanation", sa.Text(), nullable=False, server_default=""),
            sa.Column("difficulty", sa.String(length=60), nullable=False, server_default=""),
            sa.Column("concept_slugs", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("config_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("answer_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="published"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("question_set_id", "external_id", name="uq_questions_set_external_id"),
        )

    if "quiz_attempts" in _tables():
        _add_column_if_missing("quiz_attempts", sa.Column("question_set_id", sa.BigInteger(), nullable=True))
        _add_column_if_missing("quiz_attempts", sa.Column("subject_id", sa.Integer(), nullable=True))
        _add_column_if_missing("quiz_attempts", sa.Column("topic_section_id", sa.Integer(), nullable=True))
        _add_column_if_missing("quiz_attempts", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
        _add_column_if_missing("quiz_attempts", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))

    if "question_attempts" not in _tables():
        op.create_table(
            "question_attempts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("quiz_attempt_id", sa.BigInteger(), sa.ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("question_id", sa.BigInteger(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=True),
            sa.Column("topic_id", sa.Integer(), nullable=True),
            sa.Column("topic_section_id", sa.Integer(), nullable=True),
            sa.Column("topic_item_id", sa.Integer(), nullable=True),
            sa.Column("tab_content_id", sa.Integer(), nullable=True),
            sa.Column("selected_answer_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("correct_answer_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("score_awarded", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_score", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("time_seconds", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("grading_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if "xp_transactions" in _tables():
        for column in (
            sa.Column("subject_id", sa.Integer(), nullable=True),
            sa.Column("topic_id", sa.Integer(), nullable=True),
            sa.Column("topic_section_id", sa.Integer(), nullable=True),
            sa.Column("topic_item_id", sa.Integer(), nullable=True),
            sa.Column("question_set_id", sa.Integer(), nullable=True),
            sa.Column("question_id", sa.Integer(), nullable=True),
            sa.Column("quiz_attempt_id", sa.Integer(), nullable=True),
            sa.Column("question_attempt_id", sa.Integer(), nullable=True),
            sa.Column("idempotency_key", sa.String(length=160), nullable=True),
        ):
            _add_column_if_missing("xp_transactions", column)

    for index_name, table_name, columns, unique in (
        ("ix_question_sets_subject_topic", "question_sets", ["subject_id", "topic_id"], False),
        ("ix_question_sets_tab_content", "question_sets", ["tab_content_id"], False),
        ("ix_question_sets_status", "question_sets", ["status"], False),
        ("ix_questions_set_order", "questions", ["question_set_id", "order"], False),
        ("ix_questions_type", "questions", ["type"], False),
        ("ix_questions_difficulty", "questions", ["difficulty"], False),
        ("ix_quiz_attempts_user_set_created", "quiz_attempts", ["user_id", "question_set_id", "created_at"], False),
        ("ix_quiz_attempts_subject_topic", "quiz_attempts", ["subject_id", "topic_id"], False),
        ("ix_question_attempts_user_question_created", "question_attempts", ["user_id", "question_id", "created_at"], False),
        ("ix_question_attempts_quiz_attempt", "question_attempts", ["quiz_attempt_id"], False),
        ("ix_question_attempts_user_correct", "question_attempts", ["user_id", "is_correct"], False),
        ("ix_question_attempts_context", "question_attempts", ["subject_id", "topic_id", "topic_section_id"], False),
        ("ix_xp_transactions_idempotency", "xp_transactions", ["idempotency_key"], True),
        ("ix_xp_transactions_context", "xp_transactions", ["subject_id", "topic_id", "topic_section_id"], False),
    ):
        _create_index_if_missing(index_name, table_name, columns, unique=unique)


def downgrade() -> None:
    for index_name, table_name in (
        ("ix_xp_transactions_context", "xp_transactions"),
        ("ix_xp_transactions_idempotency", "xp_transactions"),
        ("ix_question_attempts_context", "question_attempts"),
        ("ix_question_attempts_user_correct", "question_attempts"),
        ("ix_question_attempts_quiz_attempt", "question_attempts"),
        ("ix_question_attempts_user_question_created", "question_attempts"),
        ("ix_quiz_attempts_subject_topic", "quiz_attempts"),
        ("ix_quiz_attempts_user_set_created", "quiz_attempts"),
        ("ix_questions_difficulty", "questions"),
        ("ix_questions_type", "questions"),
        ("ix_questions_set_order", "questions"),
        ("ix_question_sets_status", "question_sets"),
        ("ix_question_sets_tab_content", "question_sets"),
        ("ix_question_sets_subject_topic", "question_sets"),
    ):
        if table_name in _tables() and index_name in _indexes(table_name):
            op.drop_index(index_name, table_name=table_name)

    if "question_attempts" in _tables():
        op.drop_table("question_attempts")
    if "questions" in _tables():
        op.drop_table("questions")
    if "question_sets" in _tables():
        op.drop_table("question_sets")
