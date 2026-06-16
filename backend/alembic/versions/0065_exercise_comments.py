"""Add Exercise Bank comments.

Revision ID: 0065
Revises: 0064
Create Date: 2026-06-16 01:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0065"
down_revision: Union[str, None] = "0064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> dict[str, dict]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return {}
    return {column["name"]: column for column in inspector.get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}


def _check_constraints(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {
        constraint["name"]
        for constraint in inspector.get_check_constraints(table_name)
        if constraint.get("name")
    }


def upgrade() -> None:
    if "comments" not in _tables():
        return

    columns = _columns("comments")
    check_constraints = _check_constraints("comments")
    with op.batch_alter_table("comments") as batch_op:
        if "topic_item_id" in columns and columns["topic_item_id"].get("nullable") is False:
            batch_op.alter_column("topic_item_id", existing_type=sa.BigInteger(), nullable=True)
        if "exercise_id" not in columns:
            batch_op.add_column(sa.Column("exercise_id", sa.BigInteger(), nullable=True))
            batch_op.create_foreign_key(
                "fk_comments_exercise_id_exercises",
                "exercises",
                ["exercise_id"],
                ["id"],
                ondelete="CASCADE",
            )
        if "ck_comments_exactly_one_target" not in check_constraints:
            batch_op.create_check_constraint(
                "ck_comments_exactly_one_target",
                "(topic_item_id IS NOT NULL AND exercise_id IS NULL) OR "
                "(topic_item_id IS NULL AND exercise_id IS NOT NULL)",
            )

    if "exercise_id" in _columns("comments") and "ix_comments_exercise_created" not in _indexes("comments"):
        op.create_index("ix_comments_exercise_created", "comments", ["exercise_id", "created_at"])


def downgrade() -> None:
    if "comments" not in _tables():
        return

    if "ix_comments_exercise_created" in _indexes("comments"):
        op.drop_index("ix_comments_exercise_created", table_name="comments")

    columns = _columns("comments")
    if "exercise_id" in columns:
        op.execute("DELETE FROM comments WHERE topic_item_id IS NULL")
        check_constraints = _check_constraints("comments")
        with op.batch_alter_table("comments") as batch_op:
            if "ck_comments_exactly_one_target" in check_constraints:
                batch_op.drop_constraint("ck_comments_exactly_one_target", type_="check")
            batch_op.drop_column("exercise_id")
            if "topic_item_id" in columns:
                batch_op.alter_column("topic_item_id", existing_type=sa.BigInteger(), nullable=False)
