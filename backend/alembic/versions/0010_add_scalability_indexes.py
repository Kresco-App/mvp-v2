"""add scalability indexes

Revision ID: 0010_add_scalability_indexes
Revises: 0009_add_admin_audit_logs
Create Date: 2026-05-11 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_add_scalability_indexes"
down_revision: Union[str, None] = "0009_add_admin_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("ix_comments_target_parent_created", "comments", ("target_type", "target_id", "parent_id", "created_at")),
    ("ix_user_notes_user_topic_updated", "user_notes", ("user_id", "topic_id", "updated_at")),
    ("ix_user_notes_user_item_updated", "user_notes", ("user_id", "topic_item_id", "updated_at")),
    ("ix_user_notes_created_at", "user_notes", ("created_at",)),
    ("ix_saved_items_user_created", "saved_items", ("user_id", "created_at")),
    ("ix_saved_items_user_target", "saved_items", ("user_id", "target_type", "target_id")),
    ("ix_saved_items_created_at", "saved_items", ("created_at",)),
    ("ix_activity_events_created_at", "activity_events", ("created_at",)),
    ("ix_activity_events_user_created", "activity_events", ("user_id", "created_at")),
    ("ix_activity_events_event_type", "activity_events", ("event_type",)),
    ("ix_activity_events_target_type", "activity_events", ("target_type",)),
    ("ix_topic_item_progress_user_item", "topic_item_progress", ("user_id", "topic_item_id")),
    ("ix_topic_item_progress_user_topic_status", "topic_item_progress", ("user_id", "topic_id", "status")),
    ("ix_topic_item_progress_status", "topic_item_progress", ("status",)),
    ("ix_quiz_attempts_user_tab_created", "quiz_attempts", ("user_id", "tab_content_id", "created_at")),
    ("ix_quiz_attempts_passed", "quiz_attempts", ("passed",)),
    ("ix_lesson_progress_user_lesson", "lesson_progress", ("user_id", "lesson_id")),
    ("ix_lesson_progress_user_status", "lesson_progress", ("user_id", "status")),
    ("ix_quiz_results_user_passed", "quiz_results", ("user_id", "passed")),
    ("ix_xp_transactions_user_created", "xp_transactions", ("user_id", "created_at")),
    ("ix_xp_transactions_reason", "xp_transactions", ("reason",)),
    ("ix_daily_quests_user_date", "daily_quests", ("user_id", "date")),
    ("ix_daily_quests_user_type_date_completed", "daily_quests", ("user_id", "quest_type", "date", "completed")),
    ("ix_content_progress_user_item", "content_progress", ("user_id", "item_type", "item_id")),
)


def _table_columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    for index_name, table_name, columns in INDEXES:
        table_columns = _table_columns(table_name)
        if not table_columns or not set(columns).issubset(table_columns):
            continue
        if index_name in _index_names(table_name):
            continue
        op.create_index(index_name, table_name, list(columns))


def downgrade() -> None:
    for index_name, table_name, _columns in reversed(INDEXES):
        if index_name in _index_names(table_name):
            op.drop_index(index_name, table_name=table_name)
