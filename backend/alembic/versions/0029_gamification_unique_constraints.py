"""Add gamification state uniqueness constraints

Revision ID: 0029
Revises: 0028
Create Date: 2026-05-28 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UNIQUE_CONSTRAINTS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("uq_lesson_progress_user_lesson", "lesson_progress", ("user_id", "lesson_id")),
    ("uq_content_progress_user_item", "content_progress", ("user_id", "item_type", "item_id")),
    ("uq_quiz_results_user_quiz", "quiz_results", ("user_id", "quiz_id")),
    ("uq_daily_quests_user_type_date", "daily_quests", ("user_id", "quest_type", "date")),
    ("uq_topic_item_progress_user_item", "topic_item_progress", ("user_id", "topic_item_id")),
)


DEDUP_SQL: tuple[str, ...] = (
    """
    DELETE FROM lesson_progress
    WHERE id IN (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id, lesson_id
                    ORDER BY
                        CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
                        watched_seconds DESC,
                        updated_at DESC,
                        id ASC
                ) AS rn
            FROM lesson_progress
        ) ranked
        WHERE rn > 1
    )
    """,
    """
    DELETE FROM content_progress
    WHERE id IN (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id, item_type, item_id
                    ORDER BY id ASC
                ) AS rn
            FROM content_progress
        ) ranked
        WHERE rn > 1
    )
    """,
    """
    DELETE FROM quiz_results
    WHERE id IN (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id, quiz_id
                    ORDER BY
                        CASE WHEN passed THEN 0 ELSE 1 END,
                        score DESC,
                        id ASC
                ) AS rn
            FROM quiz_results
        ) ranked
        WHERE rn > 1
    )
    """,
    """
    DELETE FROM daily_quests
    WHERE id IN (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id, quest_type, date
                    ORDER BY
                        CASE WHEN completed THEN 0 ELSE 1 END,
                        progress DESC,
                        id ASC
                ) AS rn
            FROM daily_quests
        ) ranked
        WHERE rn > 1
    )
    """,
    """
    DELETE FROM topic_item_progress
    WHERE id IN (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id, topic_item_id
                    ORDER BY
                        CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
                        COALESCE(best_score, -1) DESC,
                        COALESCE(latest_score, -1) DESC,
                        watched_seconds DESC,
                        id ASC
                ) AS rn
            FROM topic_item_progress
        ) ranked
        WHERE rn > 1
    )
    """,
)


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _unique_constraints(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_unique_constraints(table_name)}


def _create_unique_constraint(name: str, table_name: str, columns: tuple[str, ...]) -> None:
    if table_name not in _table_names() or name in _unique_constraints(table_name):
        return
    with op.batch_alter_table(table_name) as batch_op:
        batch_op.create_unique_constraint(name, list(columns))


def _drop_unique_constraint(name: str, table_name: str) -> None:
    if table_name not in _table_names() or name not in _unique_constraints(table_name):
        return
    with op.batch_alter_table(table_name) as batch_op:
        batch_op.drop_constraint(name, type_="unique")


def upgrade() -> None:
    existing_tables = _table_names()
    for statement in DEDUP_SQL:
        table_name = statement.split()[2]
        if table_name in existing_tables:
            op.execute(sa.text(statement))

    for name, table_name, columns in UNIQUE_CONSTRAINTS:
        _create_unique_constraint(name, table_name, columns)


def downgrade() -> None:
    for name, table_name, _columns in reversed(UNIQUE_CONSTRAINTS):
        _drop_unique_constraint(name, table_name)

