"""Add user hot path indexes

Revision ID: 0033
Revises: 0032
Create Date: 2026-05-28 02:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "users"
INDEX_SPECS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ix_users_stripe_customer_id", ("stripe_customer_id",)),
    ("ix_users_is_active", ("is_active",)),
    ("ix_users_role_niveau_filiere_active", ("role", "niveau", "filiere", "is_active")),
)


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME)}


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _table_names():
        return
    existing_indexes = _indexes()
    existing_columns = _columns()
    for index_name, columns in INDEX_SPECS:
        if index_name not in existing_indexes and set(columns).issubset(existing_columns):
            op.create_index(index_name, TABLE_NAME, list(columns))


def downgrade() -> None:
    existing_indexes = _indexes()
    for index_name, _columns in reversed(INDEX_SPECS):
        if index_name in existing_indexes:
            op.drop_index(index_name, table_name=TABLE_NAME)

