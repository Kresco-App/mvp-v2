"""Add explicit user permission grants.

Revision ID: 0068
Revises: 0067
Create Date: 2026-06-16 04:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0068"
down_revision: Union[str, None] = "0067"
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
    if "user_permissions" not in _tables():
        op.create_table(
            "user_permissions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("permission", sa.String(length=80), nullable=False),
            sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
            sa.Column("reason", sa.String(length=255), server_default="", nullable=False),
            sa.Column("granted_by_user_id", sa.BigInteger(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["granted_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("user_id", "permission", name="uq_user_permissions_user_permission"),
            sa.CheckConstraint("status IN ('active', 'revoked')", name="ck_user_permissions_status"),
        )

    indexes = _indexes("user_permissions")
    if "ix_user_permissions_permission_status" not in indexes:
        op.create_index(
            "ix_user_permissions_permission_status",
            "user_permissions",
            ["permission", "status"],
        )
    if "ix_user_permissions_granted_by_created" not in indexes:
        op.create_index(
            "ix_user_permissions_granted_by_created",
            "user_permissions",
            ["granted_by_user_id", "created_at"],
        )


def downgrade() -> None:
    if "user_permissions" not in _tables():
        return
    indexes = _indexes("user_permissions")
    if "ix_user_permissions_granted_by_created" in indexes:
        op.drop_index("ix_user_permissions_granted_by_created", table_name="user_permissions")
    if "ix_user_permissions_permission_status" in indexes:
        op.drop_index("ix_user_permissions_permission_status", table_name="user_permissions")
    op.drop_table("user_permissions")
