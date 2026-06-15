"""Track payment verification idempotency results.

Revision ID: 0051
Revises: 0050
Create Date: 2026-06-04 23:05:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0051"
down_revision: Union[str, None] = "0050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "payment_verification_attempts"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        return

    existing_columns = _columns()
    if "status" not in existing_columns:
        op.add_column(TABLE_NAME, sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"))
    if "is_pro_result" not in existing_columns:
        op.add_column(TABLE_NAME, sa.Column("is_pro_result", sa.Boolean(), nullable=True))
    if "response_status_code" not in existing_columns:
        op.add_column(TABLE_NAME, sa.Column("response_status_code", sa.Integer(), nullable=True))
    if "response_detail" not in existing_columns:
        op.add_column(TABLE_NAME, sa.Column("response_detail", sa.String(length=255), nullable=True))
    if "completed_at" not in existing_columns:
        op.add_column(TABLE_NAME, sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE payment_verification_attempts
            SET
                status = 'completed',
                is_pro_result = COALESCE(
                    (SELECT users.is_pro FROM users WHERE users.id = payment_verification_attempts.user_id),
                    false
                ),
                completed_at = COALESCE(completed_at, created_at)
            WHERE status = 'pending'
              AND is_pro_result IS NULL
              AND response_status_code IS NULL
              AND response_detail IS NULL
            """
        )
    )


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return

    existing_columns = _columns()
    for column_name in (
        "completed_at",
        "response_detail",
        "response_status_code",
        "is_pro_result",
        "status",
    ):
        if column_name in existing_columns:
            op.drop_column(TABLE_NAME, column_name)
