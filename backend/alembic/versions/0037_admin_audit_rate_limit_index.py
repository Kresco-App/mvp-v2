"""Add admin audit rate-limit hot-path index

Revision ID: 0037
Revises: 0036
Create Date: 2026-05-28 03:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "ix_admin_audit_professor_rate_limit"
TABLE_NAME = "admin_audit_logs"
INDEX_COLUMNS = ("note", "request_path", "created_at")


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _existing_indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE_NAME not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(TABLE_NAME)}


def upgrade() -> None:
    if INDEX_NAME in _existing_indexes():
        return
    if op.get_bind().dialect.name == "postgresql":
        columns_sql = ", ".join(_quote_identifier(column) for column in INDEX_COLUMNS)
        with op.get_context().autocommit_block():
            op.execute(sa.text(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {_quote_identifier(INDEX_NAME)} "
                f"ON {_quote_identifier(TABLE_NAME)} ({columns_sql})"
            ))
        return
    op.create_index(INDEX_NAME, TABLE_NAME, list(INDEX_COLUMNS))


def downgrade() -> None:
    if INDEX_NAME not in _existing_indexes():
        return
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(sa.text(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote_identifier(INDEX_NAME)}"))
        return
    op.drop_index(INDEX_NAME, table_name=TABLE_NAME)

