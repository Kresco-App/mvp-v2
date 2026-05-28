"""Add user stats projection

Revision ID: 0040
Revises: 0039
Create Date: 2026-05-28 08:05:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0040"
down_revision: Union[str, None] = "0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "user_stats"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _has_columns(table_name: str, columns: set[str]) -> bool:
    inspector = sa.inspect(op.get_bind())
    table_names = set(inspector.get_table_names())
    if table_name not in table_names:
        return False
    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    return columns.issubset(existing_columns)


def _stats_seed_sql() -> str:
    joins: list[str] = []
    watch_expr = "0"
    completed_expr = "0"
    quizzes_expr = "0"

    if _has_columns("topic_item_progress", {"user_id", "watched_seconds", "status"}):
        watch_expr = "COALESCE(watch_stats.total_watch_seconds, 0)"
        completed_expr = "COALESCE(item_stats.lessons_completed, 0)"
        joins.extend([
            """
            LEFT JOIN (
                SELECT user_id, SUM(watched_seconds) AS total_watch_seconds
                FROM topic_item_progress
                GROUP BY user_id
            ) AS watch_stats ON watch_stats.user_id = users.id
            """,
            """
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS lessons_completed
                FROM topic_item_progress
                WHERE status = 'completed'
                GROUP BY user_id
            ) AS item_stats ON item_stats.user_id = users.id
            """,
        ])
    elif _has_columns("lesson_progress", {"user_id", "watched_seconds", "status"}):
        watch_expr = "COALESCE(watch_stats.total_watch_seconds, 0)"
        completed_expr = "COALESCE(lesson_stats.lessons_completed, 0)"
        joins.extend([
            """
            LEFT JOIN (
                SELECT user_id, SUM(watched_seconds) AS total_watch_seconds
                FROM lesson_progress
                GROUP BY user_id
            ) AS watch_stats ON watch_stats.user_id = users.id
            """,
            """
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS lessons_completed
                FROM lesson_progress
                WHERE status = 'completed'
                GROUP BY user_id
            ) AS lesson_stats ON lesson_stats.user_id = users.id
            """,
        ])

    if _has_columns("quiz_attempts", {"user_id", "passed"}):
        quizzes_expr = "COALESCE(quiz_stats.quizzes_passed, 0)"
        joins.append(
            """
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS quizzes_passed
                FROM quiz_attempts
                WHERE passed IS TRUE
                GROUP BY user_id
            ) AS quiz_stats ON quiz_stats.user_id = users.id
            """
        )
    elif _has_columns("quiz_results", {"user_id", "passed"}):
        quizzes_expr = "COALESCE(quiz_stats.quizzes_passed, 0)"
        joins.append(
            """
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS quizzes_passed
                FROM quiz_results
                WHERE passed IS TRUE
                GROUP BY user_id
            ) AS quiz_stats ON quiz_stats.user_id = users.id
            """
        )

    joined_sql = "\n".join(joins)
    return f"""
        INSERT INTO user_stats (
            user_id,
            total_watch_seconds,
            lessons_completed,
            quizzes_passed,
            updated_at
        )
        SELECT
            users.id,
            {watch_expr},
            {completed_expr},
            {quizzes_expr},
            CURRENT_TIMESTAMP
        FROM users
        {joined_sql}
        WHERE NOT EXISTS (
            SELECT 1 FROM user_stats WHERE user_stats.user_id = users.id
        )
        """


def upgrade() -> None:
    if TABLE_NAME not in _table_names():
        op.create_table(
            TABLE_NAME,
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("total_watch_seconds", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("lessons_completed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("quizzes_passed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint(
                "total_watch_seconds >= 0",
                name="ck_user_stats_total_watch_seconds_nonnegative",
            ),
            sa.CheckConstraint(
                "lessons_completed >= 0",
                name="ck_user_stats_lessons_completed_nonnegative",
            ),
            sa.CheckConstraint(
                "quizzes_passed >= 0",
                name="ck_user_stats_quizzes_passed_nonnegative",
            ),
        )

    op.execute(sa.text(_stats_seed_sql()))


def downgrade() -> None:
    if TABLE_NAME in _table_names():
        op.drop_table(TABLE_NAME)

