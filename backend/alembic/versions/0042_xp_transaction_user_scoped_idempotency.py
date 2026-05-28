"""Scope XP transaction idempotency by user

Revision ID: 0042_xp_transaction_user_scoped_idempotency
Revises: 0041_payment_verification_attempts
Create Date: 2026-05-28 09:15:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0042_xp_transaction_user_scoped_idempotency"
down_revision: Union[str, None] = "0041_payment_verification_attempts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "xp_transactions"
OLD_INDEX_NAME = "ix_xp_transactions_idempotency"
NEW_INDEX_NAME = "ix_xp_transactions_user_idempotency"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _table_names():
        return

    existing_indexes = _indexes()
    if OLD_INDEX_NAME in existing_indexes:
        op.drop_index(OLD_INDEX_NAME, table_name=TABLE_NAME)

    if NEW_INDEX_NAME not in existing_indexes:
        op.create_index(NEW_INDEX_NAME, TABLE_NAME, ["user_id", "idempotency_key"], unique=True)


def downgrade() -> None:
    if TABLE_NAME not in _table_names():
        return

    existing_indexes = _indexes()
    if NEW_INDEX_NAME in existing_indexes:
        op.drop_index(NEW_INDEX_NAME, table_name=TABLE_NAME)
    if OLD_INDEX_NAME not in existing_indexes:
        op.create_index(OLD_INDEX_NAME, TABLE_NAME, ["idempotency_key"], unique=True)
