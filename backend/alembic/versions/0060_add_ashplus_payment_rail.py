"""Add AshPlus manual payment rail.

Revision ID: 0060
Revises: 0059
Create Date: 2026-06-15 21:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0060"
down_revision: Union[str, None] = "0059"
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
    tables = _tables()
    if "payment_transactions" in tables:
        constraints = _check_constraints("payment_transactions")
        with op.batch_alter_table("payment_transactions") as batch_op:
            if "ck_payment_transactions_provider" in constraints:
                batch_op.drop_constraint("ck_payment_transactions_provider", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_transactions_provider",
                "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus', 'ashplus')",
            )
            if "ck_payment_transactions_rail" in constraints:
                batch_op.drop_constraint("ck_payment_transactions_rail", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_transactions_rail",
                "rail IN ('cmi', 'bank_transfer', 'cashplus', 'ashplus')",
            )
    if "payment_provider_events" in tables:
        constraints = _check_constraints("payment_provider_events")
        with op.batch_alter_table("payment_provider_events") as batch_op:
            if "ck_payment_provider_events_provider" in constraints:
                batch_op.drop_constraint("ck_payment_provider_events_provider", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_provider_events_provider",
                "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus', 'ashplus')",
            )
    if "payment_transaction_proofs" in tables:
        constraints = _check_constraints("payment_transaction_proofs")
        with op.batch_alter_table("payment_transaction_proofs") as batch_op:
            if "ck_payment_transaction_proofs_rail" in constraints:
                batch_op.drop_constraint("ck_payment_transaction_proofs_rail", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_transaction_proofs_rail",
                "rail IN ('bank_transfer', 'cashplus', 'ashplus')",
            )


def downgrade() -> None:
    tables = _tables()
    if "payment_transaction_proofs" in tables:
        constraints = _check_constraints("payment_transaction_proofs")
        with op.batch_alter_table("payment_transaction_proofs") as batch_op:
            if "ck_payment_transaction_proofs_rail" in constraints:
                batch_op.drop_constraint("ck_payment_transaction_proofs_rail", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_transaction_proofs_rail",
                "rail IN ('bank_transfer', 'cashplus')",
            )
    if "payment_provider_events" in tables:
        constraints = _check_constraints("payment_provider_events")
        with op.batch_alter_table("payment_provider_events") as batch_op:
            if "ck_payment_provider_events_provider" in constraints:
                batch_op.drop_constraint("ck_payment_provider_events_provider", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_provider_events_provider",
                "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus')",
            )
    if "payment_transactions" in tables:
        constraints = _check_constraints("payment_transactions")
        with op.batch_alter_table("payment_transactions") as batch_op:
            if "ck_payment_transactions_rail" in constraints:
                batch_op.drop_constraint("ck_payment_transactions_rail", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_transactions_rail",
                "rail IN ('cmi', 'bank_transfer', 'cashplus')",
            )
            if "ck_payment_transactions_provider" in constraints:
                batch_op.drop_constraint("ck_payment_transactions_provider", type_="check")
            batch_op.create_check_constraint(
                "ck_payment_transactions_provider",
                "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus')",
            )
