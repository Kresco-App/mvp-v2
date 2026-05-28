"""Add Stripe webhook event dedupe table

Revision ID: 0031_stripe_webhook_events
Revises: 0030_saved_items_unique_constraint
Create Date: 2026-05-28 01:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0031_stripe_webhook_events"
down_revision: Union[str, None] = "0030_saved_items_unique_constraint"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "stripe_webhook_events"


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
            sa.Column("event_id", sa.String(length=255), nullable=False),
            sa.Column("event_type", sa.String(length=120), nullable=False),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = _indexes()
    if "ix_stripe_webhook_events_event_id" not in existing_indexes:
        op.create_index("ix_stripe_webhook_events_event_id", TABLE_NAME, ["event_id"], unique=True)
    if "ix_stripe_webhook_events_event_type" not in existing_indexes:
        op.create_index("ix_stripe_webhook_events_event_type", TABLE_NAME, ["event_type"])


def downgrade() -> None:
    existing_indexes = _indexes()
    if "ix_stripe_webhook_events_event_type" in existing_indexes:
        op.drop_index("ix_stripe_webhook_events_event_type", table_name=TABLE_NAME)
    if "ix_stripe_webhook_events_event_id" in existing_indexes:
        op.drop_index("ix_stripe_webhook_events_event_id", table_name=TABLE_NAME)
    if TABLE_NAME in _table_names():
        op.drop_table(TABLE_NAME)
