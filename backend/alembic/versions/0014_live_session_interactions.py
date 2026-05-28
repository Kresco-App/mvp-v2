"""add live session interactions

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-22 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if table_name not in _tables() or index_name in _indexes(table_name):
        return
    op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if "live_session_interactions" not in _tables():
        op.create_table(
            "live_session_interactions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("live_session_id", sa.BigInteger(), sa.ForeignKey("live_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("course_offering_id", sa.BigInteger(), sa.ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("professor_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("student_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kind", sa.String(length=30), nullable=False, server_default="question"),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
            sa.Column("answer", sa.Text(), nullable=False, server_default=""),
            sa.Column("answered_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    for index_name, columns in (
        ("ix_live_session_interactions_live_session_id", ["live_session_id"]),
        ("ix_live_session_interactions_course_offering_id", ["course_offering_id"]),
        ("ix_live_session_interactions_professor_user_id", ["professor_user_id"]),
        ("ix_live_session_interactions_student_user_id", ["student_user_id"]),
        ("ix_live_session_interactions_kind", ["kind"]),
        ("ix_live_session_interactions_status", ["status"]),
        ("ix_live_session_interactions_session_created", ["live_session_id", "created_at"]),
        ("ix_live_session_interactions_session_status", ["live_session_id", "status"]),
        ("ix_live_session_interactions_professor_status", ["professor_user_id", "status"]),
    ):
        _create_index_if_missing(index_name, "live_session_interactions", columns)


def downgrade() -> None:
    if "live_session_interactions" in _tables():
        op.drop_table("live_session_interactions")

