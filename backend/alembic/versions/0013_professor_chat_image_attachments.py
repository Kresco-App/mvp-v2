"""add professor chat image attachments

Revision ID: 0013_professor_chat_image_attachments
Revises: 0012_professor_platform
Create Date: 2026-05-22 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_professor_chat_image_attachments"
down_revision: Union[str, None] = "0012_professor_platform"
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
    _add_column_if_missing("professor_chat_messages", sa.Column("attachment_url", sa.String(length=500), nullable=False, server_default=""))
    _add_column_if_missing("professor_chat_messages", sa.Column("attachment_mime_type", sa.String(length=120), nullable=False, server_default=""))
    _add_column_if_missing("professor_chat_messages", sa.Column("attachment_name", sa.String(length=255), nullable=False, server_default=""))
    _add_column_if_missing("professor_chat_messages", sa.Column("attachment_size", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    columns = _columns("professor_chat_messages")
    for name in ("attachment_size", "attachment_name", "attachment_mime_type", "attachment_url"):
        if name in columns:
            op.drop_column("professor_chat_messages", name)
