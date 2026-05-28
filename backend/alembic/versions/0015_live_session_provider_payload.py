"""add live session provider payload

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-23 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column_if_missing("live_sessions", sa.Column("stream_ingest_url", sa.String(length=500), nullable=False, server_default=""))
    _add_column_if_missing("live_sessions", sa.Column("stream_key", sa.String(length=500), nullable=False, server_default=""))
    _add_column_if_missing("live_sessions", sa.Column("provider_payload_json", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    columns = _columns("live_sessions")
    for name in ("provider_payload_json", "stream_key", "stream_ingest_url"):
        if name in columns:
            op.drop_column("live_sessions", name)

