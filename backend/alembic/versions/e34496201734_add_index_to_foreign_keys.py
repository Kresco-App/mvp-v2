"""Add missing foreign key indexes.

Revision ID: e34496201734
Revises: 0026_realtime_outbox
Create Date: 2026-05-27 19:21:30.143781
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e34496201734"
down_revision: Union[str, None] = "0026_realtime_outbox"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_SPECS: tuple[tuple[str, str, tuple[str, ...], bool], ...] = (
    ("ix_activities_lesson_id", "activities", ("lesson_id",), False),
    ("ix_activity_events_topic_id", "activity_events", ("topic_id",), False),
    ("ix_activity_events_user_id", "activity_events", ("user_id",), False),
    ("ix_calendar_events_subject_id", "calendar_events", ("subject_id",), False),
    ("ix_calendar_events_topic_id", "calendar_events", ("topic_id",), False),
    ("ix_chapter_blocks_chapter_id", "chapter_blocks", ("chapter_id",), False),
    ("ix_chapter_sections_chapter_id", "chapter_sections", ("chapter_id",), False),
    ("ix_chapters_subject_id", "chapters", ("subject_id",), False),
    ("ix_comments_parent_id", "comments", ("parent_id",), False),
    ("ix_comments_topic_item_id", "comments", ("topic_item_id",), False),
    ("ix_content_progress_user_id", "content_progress", ("user_id",), False),
    ("ix_course_pdfs_lesson_id", "course_pdfs", ("lesson_id",), False),
    ("ix_daily_quests_user_id", "daily_quests", ("user_id",), False),
    ("ix_exam_problems_exam_id", "exam_problems", ("exam_id",), False),
    ("ix_exam_problems_topic_id", "exam_problems", ("topic_id",), False),
    ("ix_exam_problems_video_resource_id", "exam_problems", ("video_resource_id",), False),
    ("ix_exams_subject_id", "exams", ("subject_id",), False),
    ("ix_lesson_progress_lesson_id", "lesson_progress", ("lesson_id",), False),
    ("ix_lesson_progress_user_id", "lesson_progress", ("user_id",), False),
    ("ix_lessons_chapter_id", "lessons", ("chapter_id",), False),
    ("ix_live_session_interactions_answered_by_user_id", "live_session_interactions", ("answered_by_user_id",), False),
    ("ix_live_sessions_calendar_event_id", "live_sessions", ("calendar_event_id",), False),
    ("ix_live_sessions_recording_resource_id", "live_sessions", ("recording_resource_id",), False),
    ("ix_professor_change_requests_admin_user_id", "professor_change_requests", ("admin_user_id",), False),
    ("ix_question_attempts_question_id", "question_attempts", ("question_id",), False),
    ("ix_question_attempts_quiz_attempt_id", "question_attempts", ("quiz_attempt_id",), False),
    ("ix_question_attempts_subject_id", "question_attempts", ("subject_id",), False),
    ("ix_question_attempts_topic_id", "question_attempts", ("topic_id",), False),
    ("ix_question_attempts_user_id", "question_attempts", ("user_id",), False),
    ("ix_question_sets_subject_id", "question_sets", ("subject_id",), False),
    ("ix_question_sets_tab_content_id", "question_sets", ("tab_content_id",), False),
    ("ix_question_sets_topic_id", "question_sets", ("topic_id",), False),
    ("ix_question_sets_topic_item_id", "question_sets", ("topic_item_id",), False),
    ("ix_question_sets_topic_section_id", "question_sets", ("topic_section_id",), False),
    ("ix_questions_question_set_id", "questions", ("question_set_id",), False),
    ("ix_quiz_attempts_question_set_id", "quiz_attempts", ("question_set_id",), False),
    ("ix_quiz_attempts_subject_id", "quiz_attempts", ("subject_id",), False),
    ("ix_quiz_attempts_topic_id", "quiz_attempts", ("topic_id",), False),
    ("ix_quiz_attempts_user_id", "quiz_attempts", ("user_id",), False),
    ("ix_quiz_options_question_id", "quiz_options", ("question_id",), False),
    ("ix_quiz_questions_quiz_id", "quiz_questions", ("quiz_id",), False),
    ("ix_quiz_results_quiz_id", "quiz_results", ("quiz_id",), False),
    ("ix_quiz_results_user_id", "quiz_results", ("user_id",), False),
    ("ix_quizzes_lesson_id", "quizzes", ("lesson_id",), True),
    ("ix_resources_topic_id", "resources", ("topic_id",), False),
    ("ix_saved_items_subject_id", "saved_items", ("subject_id",), False),
    ("ix_saved_items_topic_id", "saved_items", ("topic_id",), False),
    ("ix_saved_items_user_id", "saved_items", ("user_id",), False),
    ("ix_tab_contents_resource_id", "tab_contents", ("resource_id",), False),
    ("ix_tab_contents_topic_item_id", "tab_contents", ("topic_item_id",), False),
    ("ix_topic_item_progress_topic_id", "topic_item_progress", ("topic_id",), False),
    ("ix_topic_item_progress_user_id", "topic_item_progress", ("user_id",), False),
    ("ix_topic_items_primary_resource_id", "topic_items", ("primary_resource_id",), False),
    ("ix_topic_items_section_id", "topic_items", ("section_id",), False),
    ("ix_topic_items_topic_id", "topic_items", ("topic_id",), False),
    ("ix_topic_sections_topic_id", "topic_sections", ("topic_id",), False),
    ("ix_topics_subject_id", "topics", ("subject_id",), False),
    ("ix_user_notes_subject_id", "user_notes", ("subject_id",), False),
    ("ix_user_notes_topic_id", "user_notes", ("topic_id",), False),
    ("ix_user_notes_user_id", "user_notes", ("user_id",), False),
    ("ix_user_xp_user_id", "user_xp", ("user_id",), True),
    ("ix_video_quiz_triggers_lesson_id", "video_quiz_triggers", ("lesson_id",), False),
    ("ix_video_quiz_triggers_quiz_id", "video_quiz_triggers", ("quiz_id",), False),
    ("ix_xp_transactions_subject_id", "xp_transactions", ("subject_id",), False),
    ("ix_xp_transactions_topic_id", "xp_transactions", ("topic_id",), False),
    ("ix_xp_transactions_user_id", "xp_transactions", ("user_id",), False),
)


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _postgres_index_sql(index_name: str, table_name: str, columns: tuple[str, ...], unique: bool) -> str:
    unique_sql = "UNIQUE " if unique else ""
    columns_sql = ", ".join(_quote_identifier(column) for column in columns)
    return (
        f"CREATE {unique_sql}INDEX CONCURRENTLY IF NOT EXISTS {_quote_identifier(index_name)} "
        f"ON {_quote_identifier(table_name)} ({columns_sql})"
    )


def _existing_indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _create_index(index_name: str, table_name: str, columns: tuple[str, ...], unique: bool) -> None:
    if index_name in _existing_indexes(table_name):
        return
    op.create_index(index_name, table_name, list(columns), unique=unique)


def _drop_index(index_name: str, table_name: str) -> None:
    if index_name in _existing_indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            for index_name, table_name, columns, unique in INDEX_SPECS:
                op.execute(sa.text(_postgres_index_sql(index_name, table_name, columns, unique)))
        return

    for index_name, table_name, columns, unique in INDEX_SPECS:
        _create_index(index_name, table_name, columns, unique)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            for index_name, _, _, _ in reversed(INDEX_SPECS):
                op.execute(sa.text(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote_identifier(index_name)}"))
        return

    for index_name, table_name, _, _ in reversed(INDEX_SPECS):
        _drop_index(index_name, table_name)
