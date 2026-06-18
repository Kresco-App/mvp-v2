"""Remove legacy app-owned auth email dispatch table.

Revision ID: 0083
Revises: 0082
Create Date: 2026-06-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0083"
down_revision: Union[str, None] = "0082"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "email_dispatch_throttles"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if TABLE_NAME in _tables():
        op.drop_table(TABLE_NAME)


def downgrade() -> None:
    if TABLE_NAME in _tables():
        return
    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("purpose", sa.String(length=60), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", "purpose", name="uq_email_dispatch_throttles_email_purpose"),
    )
    existing_indexes = _indexes(TABLE_NAME)
    if "ix_email_dispatch_throttles_email" not in existing_indexes:
        op.create_index("ix_email_dispatch_throttles_email", TABLE_NAME, ["email"])
    if "ix_email_dispatch_throttles_purpose" not in existing_indexes:
        op.create_index("ix_email_dispatch_throttles_purpose", TABLE_NAME, ["purpose"])
    if "ix_email_dispatch_throttles_purpose_updated" not in existing_indexes:
        op.create_index("ix_email_dispatch_throttles_purpose_updated", TABLE_NAME, ["purpose", "updated_at"])
