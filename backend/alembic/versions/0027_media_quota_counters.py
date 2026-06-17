"""Add media quota counters

Revision ID: 0027
Revises: e34496201734
Create Date: 2026-05-27 20:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027"
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
    with op.batch_alter_table("users") as batch_op:
        if "avatar_media_size" not in existing_columns:
            batch_op.add_column(sa.Column("avatar_media_size", sa.Integer(), nullable=False, server_default="0"))
        if "banner_media_size" not in existing_columns:
            batch_op.add_column(sa.Column("banner_media_size", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    existing_columns = _columns("users")
    if "banner_media_size" in existing_columns:
        op.drop_column("users", "banner_media_size")
    if "avatar_media_size" in existing_columns:
        op.drop_column("users", "avatar_media_size")

