"""Key payment verification attempts by session.

Revision ID: 0053
Revises: 0052
Create Date: 2026-06-05 00:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0053"
down_revision: Union[str, None] = "0052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "payment_verification_attempts"
OLD_CONSTRAINT = "uq_payment_verification_attempts_user_session_key"
NEW_CONSTRAINT = "uq_payment_verification_attempts_user_session"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def _unique_constraints() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {
        constraint["name"]
        for constraint in inspector.get_unique_constraints(TABLE_NAME)
        if constraint.get("name")
    }


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        return

    columns = _columns()
    if "idempotency_key" in columns:
        op.execute(
            sa.text(
                """
                DELETE FROM payment_verification_attempts
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM payment_verification_attempts
                    GROUP BY user_id, session_id
                )
                """
            )
        )

    constraints = _unique_constraints()
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        if OLD_CONSTRAINT in constraints:
            batch_op.drop_constraint(OLD_CONSTRAINT, type_="unique")
        if NEW_CONSTRAINT not in constraints:
            batch_op.create_unique_constraint(NEW_CONSTRAINT, ["user_id", "session_id"])
        if "idempotency_key" in columns:
            batch_op.drop_column("idempotency_key")


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return

    columns = _columns()
    constraints = _unique_constraints()
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        if "idempotency_key" not in columns:
            batch_op.add_column(
                sa.Column("idempotency_key", sa.String(length=160), nullable=False, server_default="")
            )
        if NEW_CONSTRAINT in constraints:
            batch_op.drop_constraint(NEW_CONSTRAINT, type_="unique")
        if OLD_CONSTRAINT not in constraints:
            batch_op.create_unique_constraint(
                OLD_CONSTRAINT,
                ["user_id", "session_id", "idempotency_key"],
            )
