"""normalize topic item primary tabs and comments

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_keys(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {fk["name"] for fk in inspector.get_foreign_keys(table_name) if fk.get("name")}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if table_name not in _tables():
        return
    if index_name in _indexes(table_name):
        return
    if not set(columns).issubset(_columns(table_name)):
        return
    op.create_index(index_name, table_name, columns)


def _drop_index_if_present(index_name: str, table_name: str) -> None:
    if table_name in _tables() and index_name in _indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def _create_fk_if_missing(
    name: str,
    source_table: str,
    referent_table: str,
    local_cols: list[str],
    remote_cols: list[str],
    *,
    ondelete: str | None = None,
) -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    if source_table not in _tables() or referent_table not in _tables():
        return
    if name in _foreign_keys(source_table):
        return
    op.create_foreign_key(name, source_table, referent_table, local_cols, remote_cols, ondelete=ondelete)


def _drop_fk_if_present(name: str, table_name: str) -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    if table_name in _tables() and name in _foreign_keys(table_name):
        op.drop_constraint(name, table_name, type_="foreignkey")


def _backfill_primary_tab_content_id() -> None:
    if not {"topic_items", "tab_contents"}.issubset(_tables()):
        return
    if "primary_tab_content_id" not in _columns("topic_items"):
        return

    tab_columns = _columns("tab_contents")
    if "is_recommended" in tab_columns:
        op.execute(sa.text("""
            UPDATE topic_items
            SET primary_tab_content_id = (
                SELECT tab_contents.id
                FROM tab_contents
                WHERE tab_contents.topic_item_id = topic_items.id
                  AND tab_contents.status = 'published'
                  AND tab_contents.is_recommended = true
                ORDER BY tab_contents."order", tab_contents.id
                LIMIT 1
            )
            WHERE primary_tab_content_id IS NULL
        """))

    op.execute(sa.text("""
        UPDATE topic_items
        SET primary_tab_content_id = (
            SELECT tab_contents.id
            FROM tab_contents
            WHERE tab_contents.topic_item_id = topic_items.id
              AND tab_contents.status = 'published'
              AND tab_contents.resource_id = topic_items.primary_resource_id
            ORDER BY tab_contents."order", tab_contents.id
            LIMIT 1
        )
        WHERE primary_tab_content_id IS NULL
          AND primary_resource_id IS NOT NULL
    """))
    op.execute(sa.text("""
        UPDATE topic_items
        SET primary_tab_content_id = (
            SELECT tab_contents.id
            FROM tab_contents
            WHERE tab_contents.topic_item_id = topic_items.id
              AND tab_contents.status = 'published'
              AND lower(tab_contents.tab_type) NOT IN ('comments', 'discussion')
            ORDER BY tab_contents."order", tab_contents.id
            LIMIT 1
        )
        WHERE primary_tab_content_id IS NULL
    """))


def _backfill_topic_item_comments() -> None:
    if "comments" not in _tables() or "topic_item_id" not in _columns("comments"):
        return

    comment_columns = _columns("comments")
    if {"target_type", "target_id"}.issubset(comment_columns) and "topic_items" in _tables():
        op.execute(sa.text("""
            UPDATE comments
            SET topic_item_id = target_id
            WHERE topic_item_id IS NULL
              AND target_type = 'topic_item'
              AND EXISTS (
                  SELECT 1 FROM topic_items WHERE topic_items.id = comments.target_id
              )
        """))

    if "topic_items" in _tables():
        op.execute(sa.text("""
            DELETE FROM comments
            WHERE topic_item_id IS NULL
               OR NOT EXISTS (
                   SELECT 1 FROM topic_items WHERE topic_items.id = comments.topic_item_id
               )
        """))
    else:
        op.execute(sa.text("DELETE FROM comments WHERE topic_item_id IS NULL"))


def upgrade() -> None:
    _add_column_if_missing("topic_items", sa.Column("primary_tab_content_id", sa.BigInteger(), nullable=True))
    _backfill_primary_tab_content_id()
    _create_index_if_missing("ix_topic_items_primary_tab_content_id", "topic_items", ["primary_tab_content_id"])
    _create_fk_if_missing(
        "fk_topic_items_primary_tab_content_id_tab_contents",
        "topic_items",
        "tab_contents",
        ["primary_tab_content_id"],
        ["id"],
        ondelete="SET NULL",
    )

    _add_column_if_missing("comments", sa.Column("topic_item_id", sa.BigInteger(), nullable=True))
    _backfill_topic_item_comments()
    _drop_index_if_present("ix_comments_target_id", "comments")
    _drop_index_if_present("ix_comments_target_parent_created", "comments")
    _create_index_if_missing("ix_comments_topic_item_created", "comments", ["topic_item_id", "created_at"])
    _create_fk_if_missing(
        "fk_comments_topic_item_id_topic_items",
        "comments",
        "topic_items",
        ["topic_item_id"],
        ["id"],
        ondelete="CASCADE",
    )

    if "comments" in _tables():
        comment_columns = _columns("comments")
        with op.batch_alter_table("comments") as batch_op:
            if "topic_item_id" in comment_columns:
                batch_op.alter_column("topic_item_id", existing_type=sa.BigInteger(), nullable=False)
            if "target_type" in comment_columns:
                batch_op.drop_column("target_type")
            if "target_id" in comment_columns:
                batch_op.drop_column("target_id")

    if "tab_contents" in _tables() and "is_recommended" in _columns("tab_contents"):
        with op.batch_alter_table("tab_contents") as batch_op:
            batch_op.drop_column("is_recommended")


def downgrade() -> None:
    if "tab_contents" in _tables() and "is_recommended" not in _columns("tab_contents"):
        op.add_column("tab_contents", sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "primary_tab_content_id" in _columns("topic_items"):
            op.execute(sa.text("""
                UPDATE tab_contents
                SET is_recommended = true
                WHERE EXISTS (
                    SELECT 1
                    FROM topic_items
                    WHERE topic_items.primary_tab_content_id = tab_contents.id
                )
            """))

    _drop_fk_if_present("fk_comments_topic_item_id_topic_items", "comments")
    _drop_index_if_present("ix_comments_topic_item_created", "comments")
    if "comments" in _tables():
        comment_columns = _columns("comments")
        with op.batch_alter_table("comments") as batch_op:
            if "target_type" not in comment_columns:
                batch_op.add_column(sa.Column("target_type", sa.String(length=20), nullable=False, server_default="topic_item"))
            if "target_id" not in comment_columns:
                batch_op.add_column(sa.Column("target_id", sa.Integer(), nullable=False, server_default="0"))
        if "topic_item_id" in _columns("comments"):
            op.execute(sa.text("UPDATE comments SET target_type = 'topic_item', target_id = topic_item_id"))
            with op.batch_alter_table("comments") as batch_op:
                batch_op.drop_column("topic_item_id")
        _create_index_if_missing("ix_comments_target_id", "comments", ["target_id"])
        _create_index_if_missing(
            "ix_comments_target_parent_created",
            "comments",
            ["target_type", "target_id", "parent_id", "created_at"],
        )

    _drop_fk_if_present("fk_topic_items_primary_tab_content_id_tab_contents", "topic_items")
    _drop_index_if_present("ix_topic_items_primary_tab_content_id", "topic_items")
    if "topic_items" in _tables() and "primary_tab_content_id" in _columns("topic_items"):
        with op.batch_alter_table("topic_items") as batch_op:
            batch_op.drop_column("primary_tab_content_id")

