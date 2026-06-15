"""Add XP daily cap audit fields.

Revision ID: 0058
Revises: 0057
Create Date: 2026-06-15 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0058"
down_revision: Union[str, None] = "0057"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TRANSACTIONS_TABLE = "xp_transactions"
USAGE_TABLE = "xp_daily_cap_usage"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def upgrade() -> None:
    tables = _tables()
    if TRANSACTIONS_TABLE in tables:
        columns = _columns(TRANSACTIONS_TABLE)
        if "requested_amount" not in columns:
            op.add_column(
                TRANSACTIONS_TABLE,
                sa.Column("requested_amount", sa.Integer(), server_default="0", nullable=False),
            )
            op.execute(
                sa.text(
                    "UPDATE xp_transactions "
                    "SET requested_amount = amount "
                    "WHERE requested_amount = 0 AND amount > 0"
                )
            )
        if "daily_cap_category" not in columns:
            op.add_column(TRANSACTIONS_TABLE, sa.Column("daily_cap_category", sa.String(length=60), nullable=True))
        if "daily_cap_date" not in columns:
            op.add_column(TRANSACTIONS_TABLE, sa.Column("daily_cap_date", sa.Date(), nullable=True))
        if "cap_applied" not in columns:
            op.add_column(
                TRANSACTIONS_TABLE,
                sa.Column("cap_applied", sa.Boolean(), server_default=sa.false(), nullable=False),
            )

        indexes = _indexes(TRANSACTIONS_TABLE)
        for name, column in {
            "ix_xp_transactions_daily_cap_category": "daily_cap_category",
            "ix_xp_transactions_daily_cap_date": "daily_cap_date",
        }.items():
            if name not in indexes:
                op.create_index(name, TRANSACTIONS_TABLE, [column])

    if USAGE_TABLE not in tables:
        op.create_table(
            USAGE_TABLE,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("award_date", sa.Date(), nullable=False),
            sa.Column("category", sa.String(length=60), nullable=False),
            sa.Column("amount_awarded", sa.Integer(), server_default="0", nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.CheckConstraint("amount_awarded >= 0", name="ck_xp_daily_cap_usage_amount_nonnegative"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "award_date", "category", name="uq_xp_daily_cap_usage_user_date_category"),
        )
    indexes = _indexes(USAGE_TABLE)
    for name, columns in {
        "ix_xp_daily_cap_usage_user_id": ["user_id"],
        "ix_xp_daily_cap_usage_award_date": ["award_date"],
        "ix_xp_daily_cap_usage_category": ["category"],
        "ix_xp_daily_cap_usage_user_date": ["user_id", "award_date"],
    }.items():
        if name not in indexes:
            op.create_index(name, USAGE_TABLE, columns)


def downgrade() -> None:
    if USAGE_TABLE in _tables():
        op.drop_table(USAGE_TABLE)

    if TRANSACTIONS_TABLE not in _tables():
        return
    indexes = _indexes(TRANSACTIONS_TABLE)
    for name in ("ix_xp_transactions_daily_cap_date", "ix_xp_transactions_daily_cap_category"):
        if name in indexes:
            op.drop_index(name, table_name=TRANSACTIONS_TABLE)
    columns = _columns(TRANSACTIONS_TABLE)
    for column_name in ("cap_applied", "daily_cap_date", "daily_cap_category", "requested_amount"):
        if column_name in columns:
            op.drop_column(TRANSACTIONS_TABLE, column_name)
