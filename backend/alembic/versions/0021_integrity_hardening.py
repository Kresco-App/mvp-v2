"""harden interaction indexes and professor offering ownership

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


COMMENT_INDEXES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ix_comments_user_id", ("user_id",)),
    ("ix_comments_target_id", ("target_id",)),
)


def _table_names() -> set[str]:
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


def _course_offering_professor_fk() -> dict | None:
    inspector = sa.inspect(op.get_bind())
    if "course_offerings" not in inspector.get_table_names():
        return None
    for fk in inspector.get_foreign_keys("course_offerings"):
        if fk.get("constrained_columns") == ["professor_user_id"] and fk.get("referred_table") == "users":
            return fk
    return None


def _replace_course_offering_professor_fk(*, ondelete: str | None) -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    fk = _course_offering_professor_fk()
    if fk is None or not fk.get("name"):
        return
    op.drop_constraint(fk["name"], "course_offerings", type_="foreignkey")
    op.create_foreign_key(
        "fk_course_offerings_professor_user_id_users",
        "course_offerings",
        "users",
        ["professor_user_id"],
        ["id"],
        ondelete=ondelete,
    )


def upgrade() -> None:
    if "comments" in _table_names():
        table_columns = _columns("comments")
        existing_indexes = _indexes("comments")
        for index_name, columns in COMMENT_INDEXES:
            if index_name not in existing_indexes and set(columns).issubset(table_columns):
                op.create_index(index_name, "comments", list(columns))

    _replace_course_offering_professor_fk(ondelete=None)


def downgrade() -> None:
    _replace_course_offering_professor_fk(ondelete="CASCADE")

    if "comments" in _table_names():
        existing_indexes = _indexes("comments")
        for index_name, _columns_for_index in reversed(COMMENT_INDEXES):
            if index_name in existing_indexes:
                op.drop_index(index_name, table_name="comments")

