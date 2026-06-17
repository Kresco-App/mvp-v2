"""Professor studio: batched change operations + request summary.

Revision ID: 0079
Revises: 0078
Create Date: 2026-06-17 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0079"
down_revision: Union[str, None] = "0078"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    # 1. Add the batch summary column to the change-request header.
    if "professor_change_requests" in _tables() and "summary" not in _columns("professor_change_requests"):
        with op.batch_alter_table("professor_change_requests") as batch_op:
            batch_op.add_column(sa.Column("summary", sa.Text(), nullable=False, server_default=""))

    # 2. Create the per-operation child table.
    if "professor_change_operations" not in _tables():
        op.create_table(
            "professor_change_operations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("change_request_id", sa.BigInteger(), nullable=False),
            sa.Column("seq", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("op_type", sa.String(length=30), nullable=False),
            sa.Column("entity_type", sa.String(length=30), nullable=False),
            sa.Column("target_id", sa.Integer(), nullable=True),
            sa.Column("client_ref", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("parent_ref", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("payload_json", sa.JSON(), nullable=True),
            sa.Column("snapshot_json", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("applied_target_id", sa.Integer(), nullable=True),
            sa.Column("error_detail", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["change_request_id"], ["professor_change_requests.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_professor_change_operations_change_request_id",
            "professor_change_operations",
            ["change_request_id"],
        )
        op.create_index(
            "ix_professor_change_operations_request_seq",
            "professor_change_operations",
            ["change_request_id", "seq"],
        )
        op.create_index(
            "ix_professor_change_operations_status",
            "professor_change_operations",
            ["status"],
        )


def downgrade() -> None:
    if "professor_change_operations" in _tables():
        op.drop_table("professor_change_operations")
    if "professor_change_requests" in _tables() and "summary" in _columns("professor_change_requests"):
        with op.batch_alter_table("professor_change_requests") as batch_op:
            batch_op.drop_column("summary")
