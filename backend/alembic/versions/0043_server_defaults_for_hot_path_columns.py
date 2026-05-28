"""Add server defaults for hot path boolean/int/status columns.

Revision ID: 0043_server_defaults_for_hot_path_columns
Revises: 0042_xp_transaction_user_scoped_idempotency
Create Date: 2026-05-28 08:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0043_server_defaults_for_hot_path_columns"
down_revision: Union[str, None] = "0042_xp_transaction_user_scoped_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _table_names()
    if "users" in tables:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column("is_active", existing_type=sa.Boolean(), server_default=sa.text("true"), existing_nullable=False)
            batch_op.alter_column("is_staff", existing_type=sa.Boolean(), server_default=sa.text("false"), existing_nullable=False)
            batch_op.alter_column("auth_token_version", existing_type=sa.Integer(), server_default=sa.text("0"), existing_nullable=False)

    if "notifications" in tables:
        with op.batch_alter_table("notifications") as batch_op:
            batch_op.alter_column("is_read", existing_type=sa.Boolean(), server_default=sa.text("false"), existing_nullable=False)

    if "user_xp" in tables:
        with op.batch_alter_table("user_xp") as batch_op:
            batch_op.alter_column("total_xp", existing_type=sa.Integer(), server_default=sa.text("0"), existing_nullable=False)

    if "daily_quests" in tables:
        with op.batch_alter_table("daily_quests") as batch_op:
            batch_op.alter_column("completed", existing_type=sa.Boolean(), server_default=sa.text("false"), existing_nullable=False)

    if "realtime_outbox" in tables:
        with op.batch_alter_table("realtime_outbox") as batch_op:
            batch_op.alter_column("status", existing_type=sa.String(length=30), server_default=sa.text("'pending'"), existing_nullable=False)
            batch_op.alter_column("attempts", existing_type=sa.Integer(), server_default=sa.text("0"), existing_nullable=False)


def downgrade() -> None:
    tables = _table_names()
    if "users" in tables:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column("auth_token_version", existing_type=sa.Integer(), server_default=None, existing_nullable=False)
            batch_op.alter_column("is_staff", existing_type=sa.Boolean(), server_default=None, existing_nullable=False)
            batch_op.alter_column("is_active", existing_type=sa.Boolean(), server_default=None, existing_nullable=False)

    if "notifications" in tables:
        with op.batch_alter_table("notifications") as batch_op:
            batch_op.alter_column("is_read", existing_type=sa.Boolean(), server_default=None, existing_nullable=False)

    if "user_xp" in tables:
        with op.batch_alter_table("user_xp") as batch_op:
            batch_op.alter_column("total_xp", existing_type=sa.Integer(), server_default=None, existing_nullable=False)

    if "daily_quests" in tables:
        with op.batch_alter_table("daily_quests") as batch_op:
            batch_op.alter_column("completed", existing_type=sa.Boolean(), server_default=None, existing_nullable=False)

    if "realtime_outbox" in tables:
        with op.batch_alter_table("realtime_outbox") as batch_op:
            batch_op.alter_column("attempts", existing_type=sa.Integer(), server_default=None, existing_nullable=False)
            batch_op.alter_column("status", existing_type=sa.String(length=30), server_default=None, existing_nullable=False)
