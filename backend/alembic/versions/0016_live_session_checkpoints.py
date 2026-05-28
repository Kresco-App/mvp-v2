"""add live session checkpoints

Revision ID: 0016_live_session_checkpoints
Revises: 0015_live_session_provider_payload
Create Date: 2026-05-23 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_live_session_checkpoints"
down_revision: Union[str, None] = "0015_live_session_provider_payload"
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
    if table_name in _tables() and index_name not in _indexes(table_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if "live_session_checkpoints" not in _tables():
        op.create_table(
            "live_session_checkpoints",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("live_session_id", sa.BigInteger(), sa.ForeignKey("live_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("course_offering_id", sa.BigInteger(), sa.ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("professor_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("prompt", sa.Text(), nullable=False, server_default=""),
            sa.Column("checkpoint_type", sa.String(length=30), nullable=False, server_default="prompt"),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        )

    for index_name, columns in (
        ("ix_live_session_checkpoints_live_session_id", ["live_session_id"]),
        ("ix_live_session_checkpoints_course_offering_id", ["course_offering_id"]),
        ("ix_live_session_checkpoints_professor_user_id", ["professor_user_id"]),
        ("ix_live_session_checkpoints_checkpoint_type", ["checkpoint_type"]),
        ("ix_live_session_checkpoints_status", ["status"]),
        ("ix_live_session_checkpoints_session_created", ["live_session_id", "created_at"]),
        ("ix_live_session_checkpoints_session_status", ["live_session_id", "status"]),
        ("ix_live_session_checkpoints_professor_status", ["professor_user_id", "status"]),
    ):
        _create_index_if_missing(index_name, "live_session_checkpoints", columns)


def downgrade() -> None:
    if "live_session_checkpoints" in _tables():
        op.drop_table("live_session_checkpoints")
