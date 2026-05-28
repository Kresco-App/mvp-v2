"""add professor platform

Revision ID: 0012_professor_platform
Revises: 0011_normalized_topic_quiz_tracking
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_professor_platform"
down_revision: Union[str, None] = "0011_normalized_topic_quiz_tracking"
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
    if table_name in _tables() and column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if table_name not in _tables() or index_name in _indexes(table_name):
        return
    if not set(columns).issubset(_columns(table_name)):
        return
    op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    tables = _tables()

    _add_column_if_missing("users", sa.Column("tier", sa.String(length=30), nullable=False, server_default="basic"))

    if "program_tracks" not in tables:
        op.create_table(
            "program_tracks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("niveau", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("filiere", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("title", sa.String(length=180), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("niveau", "filiere", name="uq_program_tracks_niveau_filiere"),
        )

    if "course_offerings" not in _tables():
        op.create_table(
            "course_offerings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("track_id", sa.BigInteger(), sa.ForeignKey("program_tracks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("professor_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("subject_id", "track_id", name="uq_course_offerings_subject_track"),
        )

    _add_column_if_missing("topics", sa.Column("course_offering_id", sa.BigInteger(), nullable=True))

    if "professor_change_requests" not in _tables():
        op.create_table(
            "professor_change_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("course_offering_id", sa.BigInteger(), sa.ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("professor_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("target_type", sa.String(length=40), nullable=False),
            sa.Column("target_id", sa.Integer(), nullable=False),
            sa.Column("change_type", sa.String(length=60), nullable=False, server_default="update_fields"),
            sa.Column("proposed_patch_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("current_snapshot_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
            sa.Column("admin_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("admin_note", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if "live_sessions" not in _tables():
        op.create_table(
            "live_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("course_offering_id", sa.BigInteger(), sa.ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("professor_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("calendar_event_id", sa.BigInteger(), sa.ForeignKey("calendar_events.id", ondelete="SET NULL"), nullable=True),
            sa.Column("vdocipher_live_id", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="scheduled"),
            sa.Column("join_url", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("notification_status", sa.String(length=30), nullable=False, server_default="not_sent"),
            sa.Column("recording_resource_id", sa.BigInteger(), sa.ForeignKey("resources.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if "professor_chat_conversations" not in _tables():
        op.create_table(
            "professor_chat_conversations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("course_offering_id", sa.BigInteger(), sa.ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("professor_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("student_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
            sa.Column("last_message_preview", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("unread_for_professor", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("unread_for_student", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_pinned_by_professor", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("last_message_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("course_offering_id", "student_user_id", name="uq_professor_chat_offering_student"),
        )

    if "professor_chat_messages" not in _tables():
        op.create_table(
            "professor_chat_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("conversation_id", sa.BigInteger(), sa.ForeignKey("professor_chat_conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("sender_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="sent"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        )

    for index_name, table_name, columns, unique in (
        ("ix_users_tier", "users", ["tier"], False),
        ("ix_program_tracks_niveau", "program_tracks", ["niveau"], False),
        ("ix_program_tracks_filiere", "program_tracks", ["filiere"], False),
        ("ix_program_tracks_status", "program_tracks", ["status"], False),
        ("ix_course_offerings_subject_id", "course_offerings", ["subject_id"], False),
        ("ix_course_offerings_track_id", "course_offerings", ["track_id"], False),
        ("ix_course_offerings_professor_user_id", "course_offerings", ["professor_user_id"], False),
        ("ix_course_offerings_status", "course_offerings", ["status"], False),
        ("ix_course_offerings_professor_status", "course_offerings", ["professor_user_id", "status"], False),
        ("ix_topics_course_offering_id", "topics", ["course_offering_id"], False),
        ("ix_professor_change_requests_course_offering_id", "professor_change_requests", ["course_offering_id"], False),
        ("ix_professor_change_requests_professor_user_id", "professor_change_requests", ["professor_user_id"], False),
        ("ix_professor_change_requests_status", "professor_change_requests", ["status"], False),
        ("ix_professor_change_requests_offering_status", "professor_change_requests", ["course_offering_id", "status"], False),
        ("ix_professor_change_requests_professor_created", "professor_change_requests", ["professor_user_id", "created_at"], False),
        ("ix_live_sessions_course_offering_id", "live_sessions", ["course_offering_id"], False),
        ("ix_live_sessions_professor_user_id", "live_sessions", ["professor_user_id"], False),
        ("ix_live_sessions_starts_at", "live_sessions", ["starts_at"], False),
        ("ix_live_sessions_ends_at", "live_sessions", ["ends_at"], False),
        ("ix_live_sessions_status", "live_sessions", ["status"], False),
        ("ix_live_sessions_offering_status_starts", "live_sessions", ["course_offering_id", "status", "starts_at"], False),
        ("ix_live_sessions_professor_starts", "live_sessions", ["professor_user_id", "starts_at"], False),
        ("ix_professor_chat_conversations_course_offering_id", "professor_chat_conversations", ["course_offering_id"], False),
        ("ix_professor_chat_conversations_professor_user_id", "professor_chat_conversations", ["professor_user_id"], False),
        ("ix_professor_chat_conversations_student_user_id", "professor_chat_conversations", ["student_user_id"], False),
        ("ix_professor_chat_conversations_status", "professor_chat_conversations", ["status"], False),
        ("ix_professor_chat_conversations_last_message_at", "professor_chat_conversations", ["last_message_at"], False),
        ("ix_professor_chat_professor_updated", "professor_chat_conversations", ["professor_user_id", "updated_at"], False),
        ("ix_professor_chat_student_updated", "professor_chat_conversations", ["student_user_id", "updated_at"], False),
        ("ix_professor_chat_messages_conversation_id", "professor_chat_messages", ["conversation_id"], False),
        ("ix_professor_chat_messages_sender_user_id", "professor_chat_messages", ["sender_user_id"], False),
        ("ix_professor_chat_messages_conversation_created", "professor_chat_messages", ["conversation_id", "created_at"], False),
    ):
        _create_index_if_missing(index_name, table_name, columns, unique=unique)


def downgrade() -> None:
    for table_name in (
        "professor_chat_messages",
        "professor_chat_conversations",
        "live_sessions",
        "professor_change_requests",
        "course_offerings",
        "program_tracks",
    ):
        if table_name in _tables():
            op.drop_table(table_name)
