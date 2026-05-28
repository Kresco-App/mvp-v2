"""Add leaderboard rank projection

Revision ID: 0034_leaderboard_rank_projection
Revises: 0033_user_hot_path_indexes
Create Date: 2026-05-28 02:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0034_leaderboard_rank_projection"
down_revision: Union[str, None] = "0033_user_hot_path_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "leaderboard_ranks"


def _table_names() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME)}


def upgrade() -> None:
    if TABLE_NAME not in _table_names():
        op.create_table(
            TABLE_NAME,
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("total_xp", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("global_rank", sa.Integer(), nullable=False),
            sa.Column("refreshed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    existing_indexes = _indexes()
    if "ix_leaderboard_ranks_global_rank_user" not in existing_indexes:
        op.create_index("ix_leaderboard_ranks_global_rank_user", TABLE_NAME, ["global_rank", "user_id"])
    if "ix_leaderboard_ranks_total_xp_user" not in existing_indexes:
        op.create_index("ix_leaderboard_ranks_total_xp_user", TABLE_NAME, ["total_xp", "user_id"])


def downgrade() -> None:
    if TABLE_NAME not in _table_names():
        return
    existing_indexes = _indexes()
    if "ix_leaderboard_ranks_total_xp_user" in existing_indexes:
        op.drop_index("ix_leaderboard_ranks_total_xp_user", table_name=TABLE_NAME)
    if "ix_leaderboard_ranks_global_rank_user" in existing_indexes:
        op.drop_index("ix_leaderboard_ranks_global_rank_user", table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)
