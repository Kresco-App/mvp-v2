"""harden professor and context foreign keys

Revision ID: 0023_context_and_professor_fks
Revises: 0022_topic_item_primary_tabs_and_comments
Create Date: 2026-05-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023_context_and_professor_fks"
down_revision: Union[str, None] = "0022_topic_item_primary_tabs_and_comments"
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

CONTEXT_FKS: tuple[tuple[str, str, str, str, str, bool], ...] = (
    ("xp_transactions", "subject_id", "subjects", "id", "SET NULL", True),
    ("xp_transactions", "topic_id", "topics", "id", "SET NULL", True),
    ("activity_events", "topic_id", "topics", "id", "SET NULL", True),
    ("topic_item_progress", "topic_id", "topics", "id", "CASCADE", False),
    ("quiz_attempts", "subject_id", "subjects", "id", "SET NULL", True),
    ("quiz_attempts", "topic_id", "topics", "id", "SET NULL", True),
    ("question_attempts", "subject_id", "subjects", "id", "SET NULL", True),
    ("question_attempts", "topic_id", "topics", "id", "SET NULL", True),
    ("user_notes", "subject_id", "subjects", "id", "SET NULL", True),
    ("user_notes", "topic_id", "topics", "id", "SET NULL", True),
    ("saved_items", "subject_id", "subjects", "id", "SET NULL", True),
    ("saved_items", "topic_id", "topics", "id", "SET NULL", True),
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


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _clean_invalid_refs(
    table_name: str,
    column_name: str,
    referred_table: str,
    referred_column: str,
    *,
    nullable: bool,
) -> None:
    tables = _table_names()
    if table_name not in tables or referred_table not in tables:
        return
    if column_name not in _columns(table_name) or referred_column not in _columns(referred_table):
        return

    table = _quote_identifier(table_name)
    column = _quote_identifier(column_name)
    ref_table = _quote_identifier(referred_table)
    ref_column = _quote_identifier(referred_column)
    predicate = (
        f"{column} IS NOT NULL AND NOT EXISTS ("
        f"SELECT 1 FROM {ref_table} WHERE {ref_table}.{ref_column} = {table}.{column}"
        ")"
    )
    if nullable:
        op.execute(sa.text(f"UPDATE {table} SET {column} = NULL WHERE {predicate}"))
    else:
        op.execute(sa.text(f"DELETE FROM {table} WHERE {predicate}"))


def _replace_fk(
    *,
    constraint_name: str,
    table_name: str,
    column_name: str,
    referred_table: str,
    referred_column: str,
    ondelete: str | None,
) -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    tables = _table_names()
    if table_name not in tables or referred_table not in tables:
        return
    if column_name not in _columns(table_name) or referred_column not in _columns(referred_table):
        return

    existing_fk = _find_fk(table_name, column_name, referred_table)
    if existing_fk is not None:
        existing_name = existing_fk.get("name")
        if not existing_name:
            return
        op.drop_constraint(existing_name, table_name, type_="foreignkey")

    op.create_foreign_key(
        constraint_name,
        table_name,
        referred_table,
        [column_name],
        [referred_column],
        ondelete=ondelete,
    )


def _create_context_fk_if_missing(
    table_name: str,
    column_name: str,
    referred_table: str,
    referred_column: str,
    ondelete: str,
) -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    if _find_fk(table_name, column_name, referred_table) is not None:
        return
    _replace_fk(
        constraint_name=f"fk_{table_name}_{column_name}_{referred_table}",
        table_name=table_name,
        column_name=column_name,
        referred_table=referred_table,
        referred_column=referred_column,
        ondelete=ondelete,
    )


def _drop_fk_by_name(table_name: str, constraint_name: str) -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    if table_name not in _table_names():
        return
    if constraint_name in {fk.get("name") for fk in _foreign_keys(table_name)}:
        op.drop_constraint(constraint_name, table_name, type_="foreignkey")


def upgrade() -> None:
    for table_name, constraint_name in PROFESSOR_USER_FKS:
        _replace_fk(
            constraint_name=constraint_name,
            table_name=table_name,
            column_name="professor_user_id",
            referred_table="users",
            referred_column="id",
            ondelete=None,
        )

    for table_name, column_name, referred_table, referred_column, ondelete, nullable in CONTEXT_FKS:
        _clean_invalid_refs(
            table_name,
            column_name,
            referred_table,
            referred_column,
            nullable=nullable,
        )
        _create_context_fk_if_missing(table_name, column_name, referred_table, referred_column, ondelete)


def downgrade() -> None:
    for table_name, column_name, referred_table, _referred_column, _ondelete, _nullable in reversed(CONTEXT_FKS):
        _drop_fk_by_name(table_name, f"fk_{table_name}_{column_name}_{referred_table}")

    for table_name, constraint_name in reversed(PROFESSOR_USER_FKS):
        _replace_fk(
            constraint_name=constraint_name,
            table_name=table_name,
            column_name="professor_user_id",
            referred_table="users",
            referred_column="id",
            ondelete="CASCADE",
        )
