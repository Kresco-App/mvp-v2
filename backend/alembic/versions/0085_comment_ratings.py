"""Add optional ratings to comments.

Revision ID: 0085
Revises: 0084
Create Date: 2026-06-20 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0085"
down_revision: Union[str, None] = "0084"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "comments"
CONSTRAINT_NAME = "ck_comments_rating_range"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE_NAME)}


def _checks() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_check_constraints(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    existing_columns = _columns()
    existing_checks = _checks()
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        if "rating" not in existing_columns:
            batch_op.add_column(sa.Column("rating", sa.Integer(), nullable=True))
        if CONSTRAINT_NAME not in existing_checks:
            batch_op.create_check_constraint(CONSTRAINT_NAME, "rating IS NULL OR (rating >= 1 AND rating <= 5)")


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    existing_columns = _columns()
    existing_checks = _checks()
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        if CONSTRAINT_NAME in existing_checks:
            batch_op.drop_constraint(CONSTRAINT_NAME, type_="check")
        if "rating" in existing_columns:
            batch_op.drop_column("rating")
