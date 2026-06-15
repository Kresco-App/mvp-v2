"""Allow signed XP adjustment transactions.

Revision ID: 0070
Revises: 0069
Create Date: 2026-06-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0070"
down_revision: Union[str, None] = "0069"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _check_constraints(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_check_constraints(table_name) if constraint.get("name")}


def upgrade() -> None:
    if "xp_transactions" not in _tables():
        return
    checks = _check_constraints("xp_transactions")
    if "ck_xp_transactions_amount_nonnegative" in checks:
        with op.batch_alter_table("xp_transactions") as batch:
            batch.drop_constraint("ck_xp_transactions_amount_nonnegative", type_="check")


def downgrade() -> None:
    if "xp_transactions" not in _tables():
        return
    negative_count = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM xp_transactions WHERE amount < 0")
    ).scalar()
    if int(negative_count or 0) > 0:
        raise RuntimeError("Cannot downgrade signed XP adjustments while negative XP transactions exist")
    checks = _check_constraints("xp_transactions")
    if "ck_xp_transactions_amount_nonnegative" not in checks:
        with op.batch_alter_table("xp_transactions") as batch:
            batch.create_check_constraint("ck_xp_transactions_amount_nonnegative", "amount >= 0")
