"""add user banner url

Revision ID: 0006_add_user_banner_url
Revises: 0005_add_calendar_events
Create Date: 2026-05-10 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_add_user_banner_url"
down_revision: Union[str, None] = "0005_add_calendar_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "banner_url" not in columns:
        op.add_column(
            "users",
            sa.Column("banner_url", sa.String(length=500), nullable=False, server_default=""),
        )


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "banner_url" in columns:
        op.drop_column("users", "banner_url")
