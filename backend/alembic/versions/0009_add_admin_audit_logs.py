"""add admin audit logs

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-11 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "admin_audit_logs" in _table_names():
        return
    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=False),
        sa.Column("object_pk", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("object_repr", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("changed_data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("request_path", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("client_host", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_audit_logs_action", "admin_audit_logs", ["action"])
    op.create_index("ix_admin_audit_logs_model_name", "admin_audit_logs", ["model_name"])
    op.create_index("ix_admin_audit_logs_object_pk", "admin_audit_logs", ["object_pk"])


def downgrade() -> None:
    if "admin_audit_logs" not in _table_names():
        return
    op.drop_index("ix_admin_audit_logs_object_pk", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_model_name", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_action", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")

