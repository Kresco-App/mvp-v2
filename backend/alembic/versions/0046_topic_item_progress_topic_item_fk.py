"""Add topic item progress topic item foreign key

Revision ID: 0046
Revises: fcab131a375a
Create Date: 2026-06-04 13:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0046"
down_revision: Union[str, None] = "fcab131a375a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "topic_item_progress"
CONSTRAINT_NAME = "fk_topic_item_progress_topic_item_id_topic_items"


def _existing_foreign_keys(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {foreign_key["name"] for foreign_key in inspector.get_foreign_keys(table_name)}


def upgrade() -> None:
    if CONSTRAINT_NAME in _existing_foreign_keys(TABLE_NAME):
        return

    op.execute(
        """
        DELETE FROM topic_item_progress
        WHERE NOT EXISTS (
            SELECT 1
            FROM topic_items
            WHERE topic_items.id = topic_item_progress.topic_item_id
        )
        """
    )
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        batch_op.create_foreign_key(
            CONSTRAINT_NAME,
            "topic_items",
            ["topic_item_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    if CONSTRAINT_NAME in _existing_foreign_keys(TABLE_NAME):
        with op.batch_alter_table(TABLE_NAME) as batch_op:
            batch_op.drop_constraint(CONSTRAINT_NAME, type_="foreignkey")
