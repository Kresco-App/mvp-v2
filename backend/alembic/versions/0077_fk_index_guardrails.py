"""Add indexes for FK audit guardrails.

Revision ID: 0077
Revises: 0076
Create Date: 2026-06-16 05:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0077"
down_revision: Union[str, None] = "0076"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("content_reports", "ix_content_reports_reviewed_by_user_id", ("reviewed_by_user_id",)),
    ("user_permissions", "ix_user_permissions_user_id", ("user_id",)),
    ("manual_access_grants", "ix_manual_access_grants_entitlement_id", ("entitlement_id",)),
    ("refund_requests", "ix_refund_requests_requested_by_user_id", ("requested_by_user_id",)),
    ("refund_requests", "ix_refund_requests_reviewed_by_user_id", ("reviewed_by_user_id",)),
    ("comments", "ix_comments_moderated_by_user_id", ("moderated_by_user_id",)),
    ("user_concept_mastery", "ix_user_concept_mastery_last_question_attempt_id", ("last_question_attempt_id",)),
    ("user_concept_mastery", "ix_user_concept_mastery_last_quiz_attempt_id", ("last_quiz_attempt_id",)),
)


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


def upgrade() -> None:
    existing_tables = _tables()
    for table_name, index_name, columns in INDEXES:
        if table_name not in existing_tables:
            continue
        existing_columns = _columns(table_name)
        if any(column not in existing_columns for column in columns):
            continue
        if index_name in _indexes(table_name):
            continue
        op.create_index(index_name, table_name, list(columns))


def downgrade() -> None:
    existing_tables = _tables()
    for table_name, index_name, _columns_tuple in reversed(INDEXES):
        if table_name not in existing_tables:
            continue
        if index_name not in _indexes(table_name):
            continue
        op.drop_index(index_name, table_name=table_name)
