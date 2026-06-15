"""Add persistent user badge inventory.

Revision ID: 0072
Revises: 0071
Create Date: 2026-06-17 02:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0072"
down_revision: Union[str, None] = "0071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_NAME = "user_badges"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {
        index["name"]
        for index in inspector.get_indexes(table_name)
        if index.get("name")
    }


def upgrade() -> None:
    if TABLE_NAME not in _tables():
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("badge_slug", sa.String(length=80), nullable=False),
            sa.Column(
                "earned_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("evidence_json", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint(
                "user_id",
                "badge_slug",
                name="uq_user_badges_user_slug",
            ),
        )

    indexes = _indexes(TABLE_NAME)
    if "ix_user_badges_user_earned" not in indexes:
        op.create_index(
            "ix_user_badges_user_earned",
            TABLE_NAME,
            ["user_id", "earned_at"],
        )
    if "ix_user_badges_badge_slug" not in indexes:
        op.create_index("ix_user_badges_badge_slug", TABLE_NAME, ["badge_slug"])


def downgrade() -> None:
    if TABLE_NAME not in _tables():
        return
    indexes = _indexes(TABLE_NAME)
    if "ix_user_badges_badge_slug" in indexes:
        op.drop_index("ix_user_badges_badge_slug", table_name=TABLE_NAME)
    if "ix_user_badges_user_earned" in indexes:
        op.drop_index("ix_user_badges_user_earned", table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)
