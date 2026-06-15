"""Add refund request audit records.

Revision ID: 0069
Revises: 0068
Create Date: 2026-06-16 05:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0069"
down_revision: Union[str, None] = "0068"
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
    if "refund_requests" not in _tables():
        op.create_table(
            "refund_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("transaction_id", sa.Integer(), nullable=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("rail", sa.String(length=40), nullable=False),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), server_default="MAD", nullable=False),
            sa.Column("status", sa.String(length=40), server_default="requested", nullable=False),
            sa.Column("reason", sa.String(length=255), nullable=False),
            sa.Column("requested_by_user_id", sa.BigInteger(), nullable=False),
            sa.Column("reviewed_by_user_id", sa.BigInteger(), nullable=True),
            sa.Column("review_reason", sa.String(length=255), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["transaction_id"], ["payment_transactions.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.CheckConstraint(
                "status IN ('requested', 'approved_pending_execution', 'rejected', 'cancelled')",
                name="ck_refund_requests_status",
            ),
            sa.CheckConstraint("currency = 'MAD'", name="ck_refund_requests_currency"),
        )

    indexes = _indexes("refund_requests")
    if "ix_refund_requests_status_created" not in indexes:
        op.create_index("ix_refund_requests_status_created", "refund_requests", ["status", "created_at"])
    if "ix_refund_requests_transaction_created" not in indexes:
        op.create_index("ix_refund_requests_transaction_created", "refund_requests", ["transaction_id", "created_at"])
    if "ix_refund_requests_user_created" not in indexes:
        op.create_index("ix_refund_requests_user_created", "refund_requests", ["user_id", "created_at"])
    if "ux_refund_requests_open_transaction" not in indexes:
        op.create_index(
            "ux_refund_requests_open_transaction",
            "refund_requests",
            ["transaction_id"],
            unique=True,
            postgresql_where=sa.text("status IN ('requested', 'approved_pending_execution')"),
            sqlite_where=sa.text("status IN ('requested', 'approved_pending_execution')"),
        )


def downgrade() -> None:
    if "refund_requests" not in _tables():
        return
    indexes = _indexes("refund_requests")
    if "ux_refund_requests_open_transaction" in indexes:
        op.drop_index("ux_refund_requests_open_transaction", table_name="refund_requests")
    if "ix_refund_requests_user_created" in indexes:
        op.drop_index("ix_refund_requests_user_created", table_name="refund_requests")
    if "ix_refund_requests_transaction_created" in indexes:
        op.drop_index("ix_refund_requests_transaction_created", table_name="refund_requests")
    if "ix_refund_requests_status_created" in indexes:
        op.drop_index("ix_refund_requests_status_created", table_name="refund_requests")
    op.drop_table("refund_requests")
