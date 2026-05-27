"""add live interaction scalability index

Revision ID: 0017_live_interaction_scalability_index
Revises: 0016_live_session_checkpoints
Create Date: 2026-05-26 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_live_interaction_scalability_index"
down_revision: Union[str, None] = "0016_live_session_checkpoints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "ix_live_session_interactions_student_session_created"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if "live_session_interactions" in _tables() and INDEX_NAME not in _indexes("live_session_interactions"):
        op.create_index(
            INDEX_NAME,
            "live_session_interactions",
            ["student_user_id", "live_session_id", "created_at"],
        )


def downgrade() -> None:
    if "live_session_interactions" in _tables() and INDEX_NAME in _indexes("live_session_interactions"):
        op.drop_index(INDEX_NAME, table_name="live_session_interactions")
