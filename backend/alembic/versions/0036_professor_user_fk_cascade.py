"""restore professor user cascade foreign keys

Revision ID: 0036
Revises: 0035
Create Date: 2026-05-28 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PROFESSOR_USER_FKS: tuple[tuple[str, str], ...] = (
    ("course_offerings", "fk_course_offerings_professor_user_id_users"),
    ("professor_change_requests", "fk_professor_change_requests_professor_user_id_users"),
    ("live_sessions", "fk_live_sessions_professor_user_id_users"),
    ("live_session_checkpoints", "fk_live_session_checkpoints_professor_user_id_users"),
    ("live_session_interactions", "fk_live_session_interactions_professor_user_id_users"),
    ("professor_chat_conversations", "fk_professor_chat_conversations_professor_user_id_users"),
)


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _foreign_keys(table_name: str) -> list[dict]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return []
    return inspector.get_foreign_keys(table_name)


def _find_fk(table_name: str, column_name: str, referred_table: str) -> dict | None:
    for fk in _foreign_keys(table_name):
        if fk.get("constrained_columns") == [column_name] and fk.get("referred_table") == referred_table:
            return fk
    return None


def _fk_ondelete(fk: dict | None) -> str | None:
    if fk is None:
        return None
    return (fk.get("options") or {}).get("ondelete")


def _replace_professor_user_fk(table_name: str, constraint_name: str, *, ondelete: str | None) -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    tables = _table_names()
    if table_name not in tables or "users" not in tables:
        return
    if "professor_user_id" not in _columns(table_name) or "id" not in _columns("users"):
        return

    existing_fk = _find_fk(table_name, "professor_user_id", "users")
    if existing_fk is not None:
        existing_name = existing_fk.get("name")
        if not existing_name:
            return
        if existing_name == constraint_name and _fk_ondelete(existing_fk) == ondelete:
            return
        op.drop_constraint(existing_name, table_name, type_="foreignkey")

    op.create_foreign_key(
        constraint_name,
        table_name,
        "users",
        ["professor_user_id"],
        ["id"],
        ondelete=ondelete,
    )


def upgrade() -> None:
    for table_name, constraint_name in PROFESSOR_USER_FKS:
        _replace_professor_user_fk(table_name, constraint_name, ondelete="CASCADE")


def downgrade() -> None:
    for table_name, constraint_name in reversed(PROFESSOR_USER_FKS):
        _replace_professor_user_fk(table_name, constraint_name, ondelete=None)

