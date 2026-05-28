"""Add durable realtime outbox.

Revision ID: 0026
Revises: 0025
Create Date: 2026-05-27
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_SPECS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ix_realtime_outbox_channel", ("channel",)),
    ("ix_realtime_outbox_channel_created", ("channel", "created_at")),
    ("ix_realtime_outbox_event_name", ("event_name",)),
    ("ix_realtime_outbox_status", ("status",)),
    ("ix_realtime_outbox_available_at", ("available_at",)),
    ("ix_realtime_outbox_status_available", ("status", "available_at", "id")),
)


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "realtime_outbox" not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes("realtime_outbox")}


def upgrade() -> None:
    if "realtime_outbox" not in _tables():
        op.create_table(
            "realtime_outbox",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("channel", sa.String(length=255), nullable=False),
            sa.Column("event_name", sa.String(length=120), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_error", sa.Text(), nullable=False, server_default=""),
            sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = _indexes()
    for index_name, columns in INDEX_SPECS:
        if index_name not in existing_indexes:
            op.create_index(index_name, "realtime_outbox", list(columns), unique=False)


def downgrade() -> None:
    existing_indexes = _indexes()
    for index_name, _ in reversed(INDEX_SPECS):
        if index_name in existing_indexes:
            op.drop_index(index_name, table_name="realtime_outbox")
    if "realtime_outbox" in _tables():
        op.drop_table("realtime_outbox")

