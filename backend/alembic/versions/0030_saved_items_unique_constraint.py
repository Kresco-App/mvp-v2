"""Add saved item uniqueness constraint

Revision ID: 0030_saved_items_unique_constraint
Revises: 0029_gamification_unique_constraints
Create Date: 2026-05-28 00:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0030_saved_items_unique_constraint"
down_revision: Union[str, None] = "0029_gamification_unique_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONSTRAINT_NAME = "uq_saved_items_user_target"
INDEX_NAME = "ix_saved_items_user_target"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _unique_constraints(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_unique_constraints(table_name)}


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if "saved_items" not in _table_names():
        return

    op.execute(sa.text("""
        DELETE FROM saved_items
        WHERE id IN (
            SELECT id
            FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id, target_type, target_id
                        ORDER BY created_at DESC, id DESC
                    ) AS rn
                FROM saved_items
            ) ranked
            WHERE rn > 1
        )
    """))

    if INDEX_NAME not in _indexes("saved_items"):
        op.create_index(INDEX_NAME, "saved_items", ["user_id", "target_type", "target_id"])

    if CONSTRAINT_NAME not in _unique_constraints("saved_items"):
        with op.batch_alter_table("saved_items") as batch_op:
            batch_op.create_unique_constraint(CONSTRAINT_NAME, ["user_id", "target_type", "target_id"])


def downgrade() -> None:
    if "saved_items" not in _table_names():
        return

    if CONSTRAINT_NAME in _unique_constraints("saved_items"):
        with op.batch_alter_table("saved_items") as batch_op:
            batch_op.drop_constraint(CONSTRAINT_NAME, type_="unique")
    if INDEX_NAME in _indexes("saved_items"):
        op.drop_index(INDEX_NAME, table_name="saved_items")
