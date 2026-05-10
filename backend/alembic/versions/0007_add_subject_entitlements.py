"""add subject entitlements

Revision ID: 0007_add_subject_entitlements
Revises: 0006_add_user_banner_url
Create Date: 2026-05-10 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_add_subject_entitlements"
down_revision: Union[str, None] = "0006_add_user_banner_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "user_subject_entitlements" in inspector.get_table_names():
        return

    op.create_table(
        "user_subject_entitlements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(length=60), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_subject_entitlements_user_id", "user_subject_entitlements", ["user_id"])
    op.create_index("ix_user_subject_entitlements_subject_id", "user_subject_entitlements", ["subject_id"])
    op.create_index("ix_user_subject_entitlements_status", "user_subject_entitlements", ["status"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "user_subject_entitlements" not in inspector.get_table_names():
        return

    op.drop_index("ix_user_subject_entitlements_status", table_name="user_subject_entitlements")
    op.drop_index("ix_user_subject_entitlements_subject_id", table_name="user_subject_entitlements")
    op.drop_index("ix_user_subject_entitlements_user_id", table_name="user_subject_entitlements")
    op.drop_table("user_subject_entitlements")
