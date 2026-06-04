"""Add quiz attempt numbering and question set uniqueness guards

Revision ID: 0047
Revises: 0046
Create Date: 2026-06-04 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0047"
down_revision: Union[str, None] = "0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


QUESTION_SET_UNIQUE = "uq_question_sets_tab_content"
QUIZ_ATTEMPT_UNIQUE = "uq_quiz_attempts_user_set_attempt_number"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _unique_constraints(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_unique_constraints(table_name)}


def _dedupe_question_sets() -> None:
    tables = _table_names()
    if "question_sets" not in tables:
        return

    if "questions" in tables:
        op.execute(sa.text("""
            DELETE FROM questions
            WHERE question_set_id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY tab_content_id
                            ORDER BY id ASC
                        ) AS rn
                    FROM question_sets
                    WHERE tab_content_id IS NOT NULL
                ) ranked
                WHERE rn > 1
            )
        """))
    op.execute(sa.text("""
        DELETE FROM question_sets
        WHERE id IN (
            SELECT id
            FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY tab_content_id
                        ORDER BY id ASC
                    ) AS rn
                FROM question_sets
                WHERE tab_content_id IS NOT NULL
            ) ranked
            WHERE rn > 1
        )
    """))


def _dedupe_quiz_attempts() -> None:
    if "quiz_attempts" not in _table_names():
        return

    op.execute(sa.text("""
        DELETE FROM quiz_attempts
        WHERE id IN (
            SELECT id
            FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id, question_set_id, attempt_number
                        ORDER BY
                            COALESCE(created_at, CURRENT_TIMESTAMP) ASC,
                            id ASC
                    ) AS rn
                FROM quiz_attempts
                WHERE question_set_id IS NOT NULL
            ) ranked
            WHERE rn > 1
        )
    """))


def upgrade() -> None:
    _dedupe_question_sets()
    _dedupe_quiz_attempts()

    if "question_sets" in _table_names() and QUESTION_SET_UNIQUE not in _unique_constraints("question_sets"):
        with op.batch_alter_table("question_sets") as batch_op:
            batch_op.create_unique_constraint(QUESTION_SET_UNIQUE, ["tab_content_id"])

    if "quiz_attempts" in _table_names() and QUIZ_ATTEMPT_UNIQUE not in _unique_constraints("quiz_attempts"):
        with op.batch_alter_table("quiz_attempts") as batch_op:
            batch_op.create_unique_constraint(QUIZ_ATTEMPT_UNIQUE, ["user_id", "question_set_id", "attempt_number"])


def downgrade() -> None:
    if "quiz_attempts" in _table_names() and QUIZ_ATTEMPT_UNIQUE in _unique_constraints("quiz_attempts"):
        with op.batch_alter_table("quiz_attempts") as batch_op:
            batch_op.drop_constraint(QUIZ_ATTEMPT_UNIQUE, type_="unique")

    if "question_sets" in _table_names() and QUESTION_SET_UNIQUE in _unique_constraints("question_sets"):
        with op.batch_alter_table("question_sets") as batch_op:
            batch_op.drop_constraint(QUESTION_SET_UNIQUE, type_="unique")
