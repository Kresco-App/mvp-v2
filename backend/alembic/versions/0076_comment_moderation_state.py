"""Add comment moderation state.

Revision ID: 0076
Revises: 0075
Create Date: 2026-06-18 05:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0076"
down_revision: Union[str, None] = "0075"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COMMENTS_TABLE = "comments"
REPORTS_TABLE = "content_reports"


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


def _constraints(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_check_constraints(table_name) if constraint.get("name")}


def _foreign_keys(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {constraint["name"] for constraint in inspector.get_foreign_keys(table_name) if constraint.get("name")}


def upgrade() -> None:
    if COMMENTS_TABLE in _tables():
        columns = _columns(COMMENTS_TABLE)
        indexes = _indexes(COMMENTS_TABLE)
        constraints = _constraints(COMMENTS_TABLE)
        foreign_keys = _foreign_keys(COMMENTS_TABLE)
        with op.batch_alter_table(COMMENTS_TABLE) as batch_op:
            if "status" not in columns:
                batch_op.add_column(sa.Column("status", sa.String(length=20), server_default="visible", nullable=False))
            if "moderated_by_user_id" not in columns:
                batch_op.add_column(sa.Column("moderated_by_user_id", sa.BigInteger(), nullable=True))
            if "moderated_at" not in columns:
                batch_op.add_column(sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True))
            if "moderation_reason" not in columns:
                batch_op.add_column(sa.Column("moderation_reason", sa.Text(), server_default="", nullable=False))
            if "ix_comments_status_created" not in indexes:
                batch_op.create_index("ix_comments_status_created", ["status", "created_at"])
            if "ck_comments_status" not in constraints:
                batch_op.create_check_constraint("ck_comments_status", "status IN ('visible', 'hidden', 'deleted')")
            if "fk_comments_moderated_by_user_id_users" not in foreign_keys:
                batch_op.create_foreign_key(
                    "fk_comments_moderated_by_user_id_users",
                    "users",
                    ["moderated_by_user_id"],
                    ["id"],
                    ondelete="SET NULL",
                )

    if REPORTS_TABLE in _tables() and "resolution_action" not in _columns(REPORTS_TABLE):
        with op.batch_alter_table(REPORTS_TABLE) as batch_op:
            batch_op.add_column(sa.Column("resolution_action", sa.String(length=40), server_default="", nullable=False))


def downgrade() -> None:
    if REPORTS_TABLE in _tables() and "resolution_action" in _columns(REPORTS_TABLE):
        with op.batch_alter_table(REPORTS_TABLE) as batch_op:
            batch_op.drop_column("resolution_action")

    if COMMENTS_TABLE in _tables():
        columns = _columns(COMMENTS_TABLE)
        indexes = _indexes(COMMENTS_TABLE)
        constraints = _constraints(COMMENTS_TABLE)
        foreign_keys = _foreign_keys(COMMENTS_TABLE)
        with op.batch_alter_table(COMMENTS_TABLE) as batch_op:
            if "fk_comments_moderated_by_user_id_users" in foreign_keys:
                batch_op.drop_constraint("fk_comments_moderated_by_user_id_users", type_="foreignkey")
            if "ck_comments_status" in constraints:
                batch_op.drop_constraint("ck_comments_status", type_="check")
            if "ix_comments_status_created" in indexes:
                batch_op.drop_index("ix_comments_status_created")
            if "moderation_reason" in columns:
                batch_op.drop_column("moderation_reason")
            if "moderated_at" in columns:
                batch_op.drop_column("moderated_at")
            if "moderated_by_user_id" in columns:
                batch_op.drop_column("moderated_by_user_id")
            if "status" in columns:
                batch_op.drop_column("status")
