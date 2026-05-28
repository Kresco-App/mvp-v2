"""Add user stats projection

Revision ID: 0040_user_stats_projection
Revises: 0039_hot_filter_indexes
Create Date: 2026-05-28 08:05:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0040_user_stats_projection"
down_revision: Union[str, None] = "0039_hot_filter_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "user_stats"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


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

    op.execute(
        sa.text(
            """
            INSERT INTO user_stats (
                user_id,
                total_watch_seconds,
                lessons_completed,
                quizzes_passed,
                updated_at
            )
            SELECT
                users.id,
                COALESCE(watch_stats.total_watch_seconds, 0),
                COALESCE(lesson_stats.lessons_completed, 0),
                COALESCE(quiz_stats.quizzes_passed, 0),
                CURRENT_TIMESTAMP
            FROM users
            LEFT JOIN (
                SELECT user_id, SUM(watched_seconds) AS total_watch_seconds
                FROM lesson_progress
                GROUP BY user_id
            ) AS watch_stats ON watch_stats.user_id = users.id
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS lessons_completed
                FROM lesson_progress
                WHERE status = 'completed'
                GROUP BY user_id
            ) AS lesson_stats ON lesson_stats.user_id = users.id
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS quizzes_passed
                FROM quiz_results
                WHERE passed IS TRUE
                GROUP BY user_id
            ) AS quiz_stats ON quiz_stats.user_id = users.id
            WHERE NOT EXISTS (
                SELECT 1 FROM user_stats WHERE user_stats.user_id = users.id
            )
            """
        )
    )


def downgrade() -> None:
    if TABLE_NAME in _table_names():
        op.drop_table(TABLE_NAME)
