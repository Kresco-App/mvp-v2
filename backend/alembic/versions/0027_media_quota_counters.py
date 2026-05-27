"""Add media quota counters

Revision ID: 0027_media_quota_counters
Revises: e34496201734
Create Date: 2026-05-27 20:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027_media_quota_counters"
down_revision: Union[str, None] = "e34496201734"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing_columns = _columns("users")
    if "avatar_media_size" not in existing_columns:
        op.add_column("users", sa.Column("avatar_media_size", sa.Integer(), nullable=False, server_default="0"))
        op.alter_column("users", "avatar_media_size", server_default=None)
    if "banner_media_size" not in existing_columns:
        op.add_column("users", sa.Column("banner_media_size", sa.Integer(), nullable=False, server_default="0"))
        op.alter_column("users", "banner_media_size", server_default=None)


def downgrade() -> None:
    existing_columns = _columns("users")
    if "banner_media_size" in existing_columns:
        op.drop_column("users", "banner_media_size")
    if "avatar_media_size" in existing_columns:
        op.drop_column("users", "avatar_media_size")
