"""Add provider-neutral payment tables.

Revision ID: 0054
Revises: 0053
Create Date: 2026-06-15 05:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0054"
down_revision: Union[str, None] = "0053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def upgrade() -> None:
    tables = _tables()
    if "payment_transactions" not in tables:
        op.create_table(
            "payment_transactions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("rail", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=40), server_default="draft", nullable=False),
            sa.Column("plan", sa.String(length=60), server_default="pro", nullable=False),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), server_default="MAD", nullable=False),
            sa.Column("reference_code", sa.String(length=80), nullable=False),
            sa.Column("open_request_key", sa.String(length=160), nullable=True),
            sa.Column("provider_reference", sa.String(length=160), nullable=True),
            sa.Column("instructions_json", sa.JSON(), nullable=True),
            sa.Column("provider_payload_json", sa.JSON(), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus')",
                name="ck_payment_transactions_provider",
            ),
            sa.CheckConstraint(
                "rail IN ('cmi', 'bank_transfer', 'cashplus')",
                name="ck_payment_transactions_rail",
            ),
            sa.CheckConstraint(
                "status IN ('draft', 'pending_provider', 'pending_manual_review', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'mismatch')",
                name="ck_payment_transactions_status",
            ),
            sa.CheckConstraint("currency = 'MAD'", name="ck_payment_transactions_currency"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("reference_code", name="uq_payment_transactions_reference_code"),
            sa.UniqueConstraint("open_request_key", name="uq_payment_transactions_open_request_key"),
        )
    transaction_indexes = _indexes("payment_transactions")
    if "ix_payment_transactions_user_id" not in transaction_indexes:
        op.create_index("ix_payment_transactions_user_id", "payment_transactions", ["user_id"])
    if "ix_payment_transactions_provider" not in transaction_indexes:
        op.create_index("ix_payment_transactions_provider", "payment_transactions", ["provider"])
    if "ix_payment_transactions_rail" not in transaction_indexes:
        op.create_index("ix_payment_transactions_rail", "payment_transactions", ["rail"])
    if "ix_payment_transactions_status" not in transaction_indexes:
        op.create_index("ix_payment_transactions_status", "payment_transactions", ["status"])
    if "ix_payment_transactions_user_status" not in transaction_indexes:
        op.create_index("ix_payment_transactions_user_status", "payment_transactions", ["user_id", "status"])
    if "ix_payment_transactions_provider_status" not in transaction_indexes:
        op.create_index("ix_payment_transactions_provider_status", "payment_transactions", ["provider", "status"])
    if "ix_payment_transactions_rail_status" not in transaction_indexes:
        op.create_index("ix_payment_transactions_rail_status", "payment_transactions", ["rail", "status"])

    tables = _tables()
    if "payment_provider_events" not in tables:
        op.create_table(
            "payment_provider_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("transaction_id", sa.Integer(), nullable=True),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("event_id", sa.String(length=180), nullable=False),
            sa.Column("event_type", sa.String(length=120), nullable=False),
            sa.Column("status", sa.String(length=40), server_default="received", nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=True),
            sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["transaction_id"], ["payment_transactions.id"], ondelete="SET NULL"),
            sa.CheckConstraint(
                "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus')",
                name="ck_payment_provider_events_provider",
            ),
            sa.CheckConstraint(
                "status IN ('received', 'processed', 'failed', 'ignored')",
                name="ck_payment_provider_events_status",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("provider", "event_id", name="uq_payment_provider_events_provider_event"),
        )
    provider_event_indexes = _indexes("payment_provider_events")
    if "ix_payment_provider_events_transaction" not in provider_event_indexes:
        op.create_index("ix_payment_provider_events_transaction", "payment_provider_events", ["transaction_id"])
    if "ix_payment_provider_events_provider_type" not in provider_event_indexes:
        op.create_index("ix_payment_provider_events_provider_type", "payment_provider_events", ["provider", "event_type"])

    tables = _tables()
    if "finance_ledger_entries" not in tables:
        op.create_table(
            "finance_ledger_entries",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("transaction_id", sa.Integer(), nullable=True),
            sa.Column("user_id", sa.BigInteger(), nullable=True),
            sa.Column("entry_type", sa.String(length=60), nullable=False),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), server_default="MAD", nullable=False),
            sa.Column("reason", sa.String(length=255), server_default="", nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["transaction_id"], ["payment_transactions.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.CheckConstraint("currency = 'MAD'", name="ck_finance_ledger_entries_currency"),
            sa.PrimaryKeyConstraint("id"),
        )
    ledger_indexes = _indexes("finance_ledger_entries")
    if "ix_finance_ledger_entries_transaction" not in ledger_indexes:
        op.create_index("ix_finance_ledger_entries_transaction", "finance_ledger_entries", ["transaction_id"])
    if "ix_finance_ledger_entries_user_created" not in ledger_indexes:
        op.create_index("ix_finance_ledger_entries_user_created", "finance_ledger_entries", ["user_id", "created_at"])


def downgrade() -> None:
    tables = _tables()
    if "finance_ledger_entries" in tables:
        op.drop_table("finance_ledger_entries")
    if "payment_provider_events" in tables:
        op.drop_table("payment_provider_events")
    if "payment_transactions" in tables:
        op.drop_table("payment_transactions")
