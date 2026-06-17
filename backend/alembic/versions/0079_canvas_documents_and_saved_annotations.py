"""Add canvas documents and saved item annotations.

Revision ID: 0079
Revises: 0078
Create Date: 2026-06-16 23:55:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0079"
down_revision: Union[str, None] = "0078"
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
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def _add_saved_item_annotations() -> None:
    if "saved_items" not in _tables():
        return
    columns = _columns("saved_items")
    with op.batch_alter_table("saved_items") as batch_op:
        if "note" not in columns:
            batch_op.add_column(sa.Column("note", sa.Text(), nullable=False, server_default=""))
        if "tags" not in columns:
            batch_op.add_column(sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"))


def _create_canvas_documents() -> None:
    if "canvas_documents" in _tables():
        return
    op.create_table(
        "canvas_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.BigInteger(), nullable=True),
        sa.Column("topic_id", sa.BigInteger(), nullable=True),
        sa.Column("topic_item_id", sa.Integer(), nullable=True),
        sa.Column("scene_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("scene_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "target_type IN ('topic_item', 'exercise', 'exam_problem')",
            name="ck_canvas_documents_target_type",
        ),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["topic_item_id"], ["topic_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "target_type", "target_id", name="uq_canvas_documents_user_target"),
    )
    op.create_index("ix_canvas_documents_user_id", "canvas_documents", ["user_id"])
    op.create_index("ix_canvas_documents_subject_id", "canvas_documents", ["subject_id"])
    op.create_index("ix_canvas_documents_topic_id", "canvas_documents", ["topic_id"])
    op.create_index("ix_canvas_documents_topic_item_id", "canvas_documents", ["topic_item_id"])
    op.create_index("ix_canvas_documents_user_target", "canvas_documents", ["user_id", "target_type", "target_id"])
    op.create_index("ix_canvas_documents_user_updated", "canvas_documents", ["user_id", "updated_at"])


def upgrade() -> None:
    _add_saved_item_annotations()
    _create_canvas_documents()


def downgrade() -> None:
    if "canvas_documents" in _tables():
        for index_name in (
            "ix_canvas_documents_user_updated",
            "ix_canvas_documents_user_target",
            "ix_canvas_documents_topic_item_id",
            "ix_canvas_documents_topic_id",
            "ix_canvas_documents_subject_id",
            "ix_canvas_documents_user_id",
        ):
            if index_name in _indexes("canvas_documents"):
                op.drop_index(index_name, table_name="canvas_documents")
        op.drop_table("canvas_documents")

    if "saved_items" in _tables():
        columns = _columns("saved_items")
        with op.batch_alter_table("saved_items") as batch_op:
            if "tags" in columns:
                batch_op.drop_column("tags")
            if "note" in columns:
                batch_op.drop_column("note")
