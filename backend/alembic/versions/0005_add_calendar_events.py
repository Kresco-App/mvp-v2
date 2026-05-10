"""add calendar events

Revision ID: 0005_add_calendar_events
Revises: 0004_kresco_v1_foundation
Create Date: 2026-05-10 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_add_calendar_events"
down_revision: Union[str, None] = "0004_kresco_v1_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "calendar_events" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(length=30), nullable=False, server_default="live_session"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("subtitle", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("teacher_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("topic_id", sa.BigInteger(), sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("preparation_href", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("join_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="scheduled"),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#5b60f9"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f("ix_calendar_events_starts_at"), "calendar_events", ["starts_at"], unique=False)
    op.create_index(op.f("ix_calendar_events_ends_at"), "calendar_events", ["ends_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_calendar_events_ends_at"), table_name="calendar_events")
    op.drop_index(op.f("ix_calendar_events_starts_at"), table_name="calendar_events")
    op.drop_table("calendar_events")
