"""Remove legacy Stripe payment surface.

Revision ID: 0078
Revises: 0077
Create Date: 2026-06-16 06:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0078"
down_revision: Union[str, None] = "0077"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURRENT_PROVIDER_CHECK = "provider IN ('cmi', 'bank_transfer', 'cashplus', 'ashplus')"
LEGACY_PROVIDER_CHECK = "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus', 'ashplus')"


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
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def _check_constraints(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_check_constraints(table_name) if constraint.get("name")}


def _replace_check_constraint(table_name: str, constraint_name: str, expression: str) -> None:
    if table_name not in _tables():
        return
    constraints = _check_constraints(table_name)
    with op.batch_alter_table(table_name) as batch_op:
        if constraint_name in constraints:
            batch_op.drop_constraint(constraint_name, type_="check")
        batch_op.create_check_constraint(constraint_name, expression)


def upgrade() -> None:
    tables = _tables()
    if "payment_verification_attempts" in tables:
        op.drop_table("payment_verification_attempts")
    if "stripe_webhook_events" in tables:
        op.drop_table("stripe_webhook_events")

    if "users" in tables and "stripe_customer_id" in _columns("users"):
        if "ix_users_stripe_customer_id" in _indexes("users"):
            op.drop_index("ix_users_stripe_customer_id", table_name="users")
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("stripe_customer_id")

    _replace_check_constraint("payment_transactions", "ck_payment_transactions_provider", CURRENT_PROVIDER_CHECK)
    _replace_check_constraint("payment_provider_events", "ck_payment_provider_events_provider", CURRENT_PROVIDER_CHECK)


def downgrade() -> None:
    tables = _tables()
    if "users" in tables and "stripe_customer_id" not in _columns("users"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("stripe_customer_id", sa.String(length=255), server_default="", nullable=False))
        if "ix_users_stripe_customer_id" not in _indexes("users"):
            op.create_index("ix_users_stripe_customer_id", "users", ["stripe_customer_id"])

    if "stripe_webhook_events" not in _tables():
        op.create_table(
            "stripe_webhook_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("event_id", sa.String(length=255), nullable=False),
            sa.Column("event_type", sa.String(length=120), nullable=False),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_stripe_webhook_events_event_id", "stripe_webhook_events", ["event_id"], unique=True)
        op.create_index("ix_stripe_webhook_events_event_type", "stripe_webhook_events", ["event_type"])

    if "payment_verification_attempts" not in _tables():
        op.create_table(
            "payment_verification_attempts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("session_id", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=40), server_default="pending", nullable=False),
            sa.Column("is_pro_result", sa.Boolean(), nullable=True),
            sa.Column("response_status_code", sa.Integer(), nullable=True),
            sa.Column("response_detail", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "session_id", name="uq_payment_verification_attempts_user_session"),
        )
        op.create_index("ix_payment_verification_attempts_user_id", "payment_verification_attempts", ["user_id"])
        op.create_index(
            "ix_payment_verification_attempts_user_created",
            "payment_verification_attempts",
            ["user_id", "created_at"],
        )

    _replace_check_constraint("payment_provider_events", "ck_payment_provider_events_provider", LEGACY_PROVIDER_CHECK)
    _replace_check_constraint("payment_transactions", "ck_payment_transactions_provider", LEGACY_PROVIDER_CHECK)
