"""Add manual payment proof evidence table.

Revision ID: 0059
Revises: 0058
Create Date: 2026-06-15 20:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0059"
down_revision: Union[str, None] = "0058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "payment_transaction_proofs"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "transaction_id",
                sa.Integer(),
                sa.ForeignKey("payment_transactions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("rail", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=40), server_default="submitted", nullable=False),
            sa.Column("proof_kind", sa.String(length=40), nullable=False),
            sa.Column("proof_digest", sa.String(length=64), nullable=False),
            sa.Column("provider_reference", sa.String(length=160), nullable=True),
            sa.Column("proof_url", sa.String(length=2000), nullable=True),
            sa.Column("payer_name", sa.String(length=160), nullable=True),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("notes", sa.String(length=500), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint(
                "transaction_id",
                "proof_digest",
                name="uq_payment_transaction_proofs_transaction_digest",
            ),
            sa.CheckConstraint("rail IN ('bank_transfer', 'cashplus')", name="ck_payment_transaction_proofs_rail"),
            sa.CheckConstraint(
                "status IN ('submitted', 'reviewed', 'rejected')",
                name="ck_payment_transaction_proofs_status",
            ),
        )
    indexes = _indexes(TABLE_NAME)
    if "ix_payment_transaction_proofs_transaction" not in indexes:
        op.create_index("ix_payment_transaction_proofs_transaction", TABLE_NAME, ["transaction_id"])
    if "ix_payment_transaction_proofs_user_created" not in indexes:
        op.create_index("ix_payment_transaction_proofs_user_created", TABLE_NAME, ["user_id", "created_at"])
    if "ix_payment_transaction_proofs_rail_status" not in indexes:
        op.create_index("ix_payment_transaction_proofs_rail_status", TABLE_NAME, ["rail", "status"])


def downgrade() -> None:
    if TABLE_NAME in _tables():
        op.drop_table(TABLE_NAME)
