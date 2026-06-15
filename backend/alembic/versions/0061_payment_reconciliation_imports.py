"""Add payment reconciliation import audit tables.

Revision ID: 0061
Revises: 0060
Create Date: 2026-06-15 22:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0061"
down_revision: Union[str, None] = "0060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


IMPORTS_TABLE = "payment_reconciliation_imports"
ROWS_TABLE = "payment_reconciliation_rows"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def upgrade() -> None:
    tables = _tables()
    if IMPORTS_TABLE not in tables:
        op.create_table(
            IMPORTS_TABLE,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("rail", sa.String(length=40), nullable=False),
            sa.Column("source_name", sa.String(length=160), nullable=True),
            sa.Column("status", sa.String(length=40), server_default="processed", nullable=False),
            sa.Column("row_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("matched_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("mismatch_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("unmatched_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("duplicate_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("error_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_by_user_id", sa.BigInteger(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "provider IN ('bank_transfer', 'cashplus', 'ashplus')",
                name="ck_payment_reconciliation_imports_provider",
            ),
            sa.CheckConstraint(
                "rail IN ('bank_transfer', 'cashplus', 'ashplus')",
                name="ck_payment_reconciliation_imports_rail",
            ),
            sa.CheckConstraint(
                "status IN ('processed', 'failed')",
                name="ck_payment_reconciliation_imports_status",
            ),
        )
    import_indexes = _indexes(IMPORTS_TABLE)
    if "ix_payment_reconciliation_imports_provider_created" not in import_indexes:
        op.create_index(
            "ix_payment_reconciliation_imports_provider_created",
            IMPORTS_TABLE,
            ["provider", "created_at"],
        )
    if "ix_payment_reconciliation_imports_actor_created" not in import_indexes:
        op.create_index(
            "ix_payment_reconciliation_imports_actor_created",
            IMPORTS_TABLE,
            ["created_by_user_id", "created_at"],
        )

    tables = _tables()
    if ROWS_TABLE not in tables:
        op.create_table(
            ROWS_TABLE,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("import_id", sa.Integer(), nullable=False),
            sa.Column("row_number", sa.Integer(), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("rail", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=40), nullable=False),
            sa.Column("reference_code", sa.String(length=80), nullable=False),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), server_default="MAD", nullable=False),
            sa.Column("provider_reference", sa.String(length=160), nullable=False),
            sa.Column("row_digest", sa.String(length=64), nullable=False),
            sa.Column("matched_transaction_id", sa.Integer(), nullable=True),
            sa.Column("failure_reason", sa.String(length=255), nullable=True),
            sa.Column("raw_row_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["import_id"], [f"{IMPORTS_TABLE}.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["matched_transaction_id"], ["payment_transactions.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("import_id", "row_number", name="uq_payment_reconciliation_rows_import_row"),
            sa.CheckConstraint(
                "provider IN ('bank_transfer', 'cashplus', 'ashplus')",
                name="ck_payment_reconciliation_rows_provider",
            ),
            sa.CheckConstraint(
                "rail IN ('bank_transfer', 'cashplus', 'ashplus')",
                name="ck_payment_reconciliation_rows_rail",
            ),
            sa.CheckConstraint(
                "status IN ('matched', 'mismatch', 'unmatched', 'duplicate', 'error')",
                name="ck_payment_reconciliation_rows_status",
            ),
        )
    row_indexes = _indexes(ROWS_TABLE)
    if "ix_payment_reconciliation_rows_import" not in row_indexes:
        op.create_index("ix_payment_reconciliation_rows_import", ROWS_TABLE, ["import_id"])
    if "ix_payment_reconciliation_rows_provider_reference" not in row_indexes:
        op.create_index(
            "ix_payment_reconciliation_rows_provider_reference",
            ROWS_TABLE,
            ["provider", "provider_reference"],
        )
    if "ix_payment_reconciliation_rows_status" not in row_indexes:
        op.create_index("ix_payment_reconciliation_rows_status", ROWS_TABLE, ["status"])
    if "ix_payment_reconciliation_rows_transaction" not in row_indexes:
        op.create_index("ix_payment_reconciliation_rows_transaction", ROWS_TABLE, ["matched_transaction_id"])


def downgrade() -> None:
    tables = _tables()
    if ROWS_TABLE in tables:
        op.drop_table(ROWS_TABLE)
    if IMPORTS_TABLE in tables:
        op.drop_table(IMPORTS_TABLE)
