"""Add payment verification idempotency attempts

Revision ID: 0041
Revises: 0040
Create Date: 2026-05-28 08:25:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0041"
down_revision: Union[str, None] = "0040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "payment_verification_attempts"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _table_names():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("session_id", sa.String(length=255), nullable=False),
            sa.Column("idempotency_key", sa.String(length=160), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint(
                "user_id",
                "session_id",
                "idempotency_key",
                name="uq_payment_verification_attempts_user_session_key",
            ),
        )

    existing_indexes = _indexes()
    if "ix_payment_verification_attempts_user_id" not in existing_indexes:
        op.create_index("ix_payment_verification_attempts_user_id", TABLE_NAME, ["user_id"])
    if "ix_payment_verification_attempts_user_created" not in existing_indexes:
        op.create_index("ix_payment_verification_attempts_user_created", TABLE_NAME, ["user_id", "created_at"])


def downgrade() -> None:
    if TABLE_NAME not in _table_names():
        return

    existing_indexes = _indexes()
    if "ix_payment_verification_attempts_user_created" in existing_indexes:
        op.drop_index("ix_payment_verification_attempts_user_created", table_name=TABLE_NAME)
    if "ix_payment_verification_attempts_user_id" in existing_indexes:
        op.drop_index("ix_payment_verification_attempts_user_id", table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)

