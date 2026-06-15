"""Add manual access grant audit records.

Revision ID: 0067
Revises: 0066
Create Date: 2026-06-16 03:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0067"
down_revision: Union[str, None] = "0066"
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
    if "manual_access_grants" not in _tables():
        op.create_table(
            "manual_access_grants",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("subject_id", sa.BigInteger(), nullable=False),
            sa.Column("action", sa.String(length=20), nullable=False),
            sa.Column("status", sa.String(length=40), server_default="completed", nullable=False),
            sa.Column("entitlement_id", sa.Integer(), nullable=True),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reason", sa.String(length=255), server_default="", nullable=False),
            sa.Column("created_by_user_id", sa.BigInteger(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["entitlement_id"], ["user_subject_entitlements.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.CheckConstraint("action IN ('grant', 'revoke')", name="ck_manual_access_grants_action"),
            sa.CheckConstraint("status IN ('completed', 'no_op')", name="ck_manual_access_grants_status"),
        )

    indexes = _indexes("manual_access_grants")
    if "ix_manual_access_grants_user_created" not in indexes:
        op.create_index("ix_manual_access_grants_user_created", "manual_access_grants", ["user_id", "created_at"])
    if "ix_manual_access_grants_subject_created" not in indexes:
        op.create_index("ix_manual_access_grants_subject_created", "manual_access_grants", ["subject_id", "created_at"])
    if "ix_manual_access_grants_actor_created" not in indexes:
        op.create_index("ix_manual_access_grants_actor_created", "manual_access_grants", ["created_by_user_id", "created_at"])


def downgrade() -> None:
    if "manual_access_grants" not in _tables():
        return
    indexes = _indexes("manual_access_grants")
    if "ix_manual_access_grants_actor_created" in indexes:
        op.drop_index("ix_manual_access_grants_actor_created", table_name="manual_access_grants")
    if "ix_manual_access_grants_subject_created" in indexes:
        op.drop_index("ix_manual_access_grants_subject_created", table_name="manual_access_grants")
    if "ix_manual_access_grants_user_created" in indexes:
        op.drop_index("ix_manual_access_grants_user_created", table_name="manual_access_grants")
    op.drop_table("manual_access_grants")
