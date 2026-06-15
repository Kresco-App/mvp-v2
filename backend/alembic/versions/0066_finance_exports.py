"""Add finance export audit records.

Revision ID: 0066
Revises: 0065
Create Date: 2026-06-16 02:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0066"
down_revision: Union[str, None] = "0065"
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
    if "finance_exports" not in _tables():
        op.create_table(
            "finance_exports",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("export_kind", sa.String(length=60), nullable=False),
            sa.Column("status", sa.String(length=40), server_default="completed", nullable=False),
            sa.Column("filters_json", sa.JSON(), nullable=True),
            sa.Column("row_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
            sa.Column("created_by_user_id", sa.BigInteger(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "export_kind IN ('ledger', 'provider_events', 'reconciliation_imports')",
                name="ck_finance_exports_kind",
            ),
            sa.CheckConstraint("status IN ('completed', 'failed')", name="ck_finance_exports_status"),
        )

    indexes = _indexes("finance_exports")
    if "ix_finance_exports_actor_created" not in indexes:
        op.create_index("ix_finance_exports_actor_created", "finance_exports", ["created_by_user_id", "created_at"])
    if "ix_finance_exports_kind_created" not in indexes:
        op.create_index("ix_finance_exports_kind_created", "finance_exports", ["export_kind", "created_at"])


def downgrade() -> None:
    if "finance_exports" not in _tables():
        return
    indexes = _indexes("finance_exports")
    if "ix_finance_exports_kind_created" in indexes:
        op.drop_index("ix_finance_exports_kind_created", table_name="finance_exports")
    if "ix_finance_exports_actor_created" in indexes:
        op.drop_index("ix_finance_exports_actor_created", table_name="finance_exports")
    op.drop_table("finance_exports")
