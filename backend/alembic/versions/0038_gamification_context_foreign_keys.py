"""Add gamification context foreign keys and indexes

Revision ID: 0038
Revises: 0037
Create Date: 2026-05-28 03:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FK_SPECS: tuple[tuple[str, str, str, str], ...] = (
    ("fk_xp_transactions_topic_section_id_topic_sections", "xp_transactions", "topic_section_id", "topic_sections"),
    ("fk_xp_transactions_topic_item_id_topic_items", "xp_transactions", "topic_item_id", "topic_items"),
    ("fk_xp_transactions_question_set_id_question_sets", "xp_transactions", "question_set_id", "question_sets"),
    ("fk_xp_transactions_question_id_questions", "xp_transactions", "question_id", "questions"),
    ("fk_xp_transactions_quiz_attempt_id_quiz_attempts", "xp_transactions", "quiz_attempt_id", "quiz_attempts"),
    ("fk_xp_transactions_question_attempt_id_question_attempts", "xp_transactions", "question_attempt_id", "question_attempts"),
    ("fk_quiz_attempts_topic_section_id_topic_sections", "quiz_attempts", "topic_section_id", "topic_sections"),
    ("fk_quiz_attempts_topic_item_id_topic_items", "quiz_attempts", "topic_item_id", "topic_items"),
    ("fk_quiz_attempts_tab_content_id_tab_contents", "quiz_attempts", "tab_content_id", "tab_contents"),
    ("fk_question_attempts_topic_section_id_topic_sections", "question_attempts", "topic_section_id", "topic_sections"),
    ("fk_question_attempts_topic_item_id_topic_items", "question_attempts", "topic_item_id", "topic_items"),
    ("fk_question_attempts_tab_content_id_tab_contents", "question_attempts", "tab_content_id", "tab_contents"),
)

INDEX_SPECS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("ix_xp_transactions_topic_section_id", "xp_transactions", ("topic_section_id",)),
    ("ix_xp_transactions_topic_item_id", "xp_transactions", ("topic_item_id",)),
    ("ix_xp_transactions_question_set_id", "xp_transactions", ("question_set_id",)),
    ("ix_xp_transactions_question_id", "xp_transactions", ("question_id",)),
    ("ix_xp_transactions_quiz_attempt_id", "xp_transactions", ("quiz_attempt_id",)),
    ("ix_xp_transactions_question_attempt_id", "xp_transactions", ("question_attempt_id",)),
    ("ix_quiz_attempts_topic_section_id", "quiz_attempts", ("topic_section_id",)),
    ("ix_quiz_attempts_topic_item_id", "quiz_attempts", ("topic_item_id",)),
    ("ix_quiz_attempts_tab_content_id", "quiz_attempts", ("tab_content_id",)),
    ("ix_question_attempts_topic_section_id", "question_attempts", ("topic_section_id",)),
    ("ix_question_attempts_topic_item_id", "question_attempts", ("topic_item_id",)),
    ("ix_question_attempts_tab_content_id", "question_attempts", ("tab_content_id",)),
)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _tables() -> set[str]:
    return set(_inspector().get_table_names())


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _foreign_keys(table_name: str) -> set[str]:
    return {fk["name"] for fk in _inspector().get_foreign_keys(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _null_orphaned_references(table_name: str, column_name: str, referred_table: str) -> None:
    op.execute(sa.text(
        f"""
        UPDATE {table_name}
        SET {column_name} = NULL
        WHERE {column_name} IS NOT NULL
          AND {column_name} NOT IN (SELECT id FROM {referred_table})
        """
    ))


def upgrade() -> None:
    tables = _tables()
    for index_name, table_name, columns in INDEX_SPECS:
        if table_name in tables and set(columns).issubset(_columns(table_name)) and index_name not in _indexes(table_name):
            op.create_index(index_name, table_name, list(columns))

    for fk_name, table_name, column_name, referred_table in FK_SPECS:
        if table_name not in tables or referred_table not in tables or column_name not in _columns(table_name):
            continue
        _null_orphaned_references(table_name, column_name, referred_table)
        if fk_name in _foreign_keys(table_name):
            continue
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.create_foreign_key(
                fk_name,
                referred_table,
                [column_name],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    tables = _tables()
    for fk_name, table_name, _column_name, _referred_table in reversed(FK_SPECS):
        if table_name not in tables or fk_name not in _foreign_keys(table_name):
            continue
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.drop_constraint(fk_name, type_="foreignkey")

    for index_name, table_name, _columns in reversed(INDEX_SPECS):
        if table_name in tables and index_name in _indexes(table_name):
            op.drop_index(index_name, table_name=table_name)

