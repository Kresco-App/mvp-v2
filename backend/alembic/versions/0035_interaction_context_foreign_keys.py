"""Add interaction context foreign keys

Revision ID: 0035_interaction_context_foreign_keys
Revises: 0034_leaderboard_rank_projection
Create Date: 2026-05-28 02:25:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0035_interaction_context_foreign_keys"
down_revision: Union[str, None] = "0034_leaderboard_rank_projection"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FK_SPECS = (
    ("fk_user_notes_topic_item_id_topic_items", "user_notes", "topic_item_id", "topic_items"),
    ("fk_user_notes_tab_content_id_tab_contents", "user_notes", "tab_content_id", "tab_contents"),
    ("fk_saved_items_topic_item_id_topic_items", "saved_items", "topic_item_id", "topic_items"),
)

INDEX_SPECS = (
    ("ix_user_notes_topic_item_id", "user_notes", ("topic_item_id",)),
    ("ix_user_notes_tab_content_id", "user_notes", ("tab_content_id",)),
    ("ix_saved_items_topic_item_id", "saved_items", ("topic_item_id",)),
)


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _foreign_keys(table_name: str) -> set[str]:
    return {fk["name"] for fk in sa.inspect(op.get_bind()).get_foreign_keys(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    tables = _tables()
    if not {"user_notes", "saved_items", "topic_items", "tab_contents"}.issubset(tables):
        return

    op.execute(
        """
        UPDATE user_notes
        SET topic_item_id = NULL
        WHERE topic_item_id IS NOT NULL
          AND topic_item_id NOT IN (SELECT id FROM topic_items)
        """
    )
    op.execute(
        """
        UPDATE user_notes
        SET tab_content_id = NULL
        WHERE tab_content_id IS NOT NULL
          AND tab_content_id NOT IN (SELECT id FROM tab_contents)
        """
    )
    op.execute(
        """
        UPDATE saved_items
        SET topic_item_id = NULL
        WHERE topic_item_id IS NOT NULL
          AND topic_item_id NOT IN (SELECT id FROM topic_items)
        """
    )

    for index_name, table_name, columns in INDEX_SPECS:
        if index_name not in _indexes(table_name):
            op.create_index(index_name, table_name, list(columns))

    for fk_name, table_name, column_name, referred_table in FK_SPECS:
        if fk_name in _foreign_keys(table_name):
            continue
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.create_foreign_key(
                fk_name,
                referred_table,
                [column_name],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    tables = _tables()
    for fk_name, table_name, _column_name, _referred_table in reversed(FK_SPECS):
        if table_name not in tables or fk_name not in _foreign_keys(table_name):
            continue
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.drop_constraint(fk_name, type_="foreignkey")

    for index_name, table_name, _columns in reversed(INDEX_SPECS):
        if table_name in tables and index_name in _indexes(table_name):
            op.drop_index(index_name, table_name=table_name)
