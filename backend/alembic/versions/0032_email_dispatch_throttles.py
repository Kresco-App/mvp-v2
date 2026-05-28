"""Add email dispatch throttles

Revision ID: 0032
Revises: 0031
Create Date: 2026-05-28 01:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "email_dispatch_throttles"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _table_names():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("email", sa.String(length=254), nullable=False),
            sa.Column("purpose", sa.String(length=60), nullable=False),
            sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email", "purpose", name="uq_email_dispatch_throttles_email_purpose"),
        )

    existing_indexes = _indexes()
    if "ix_email_dispatch_throttles_email" not in existing_indexes:
        op.create_index("ix_email_dispatch_throttles_email", TABLE_NAME, ["email"])
    if "ix_email_dispatch_throttles_purpose" not in existing_indexes:
        op.create_index("ix_email_dispatch_throttles_purpose", TABLE_NAME, ["purpose"])
    if "ix_email_dispatch_throttles_purpose_updated" not in existing_indexes:
        op.create_index("ix_email_dispatch_throttles_purpose_updated", TABLE_NAME, ["purpose", "updated_at"])


def downgrade() -> None:
    existing_indexes = _indexes()
    for index_name in (
        "ix_email_dispatch_throttles_purpose_updated",
        "ix_email_dispatch_throttles_purpose",
        "ix_email_dispatch_throttles_email",
    ):
        if index_name in existing_indexes:
            op.drop_index(index_name, table_name=TABLE_NAME)
    if TABLE_NAME in _table_names():
        op.drop_table(TABLE_NAME)

