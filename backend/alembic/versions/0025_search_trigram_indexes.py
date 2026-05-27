"""add trigram indexes for substring search

Revision ID: 0025_search_trigram_indexes
Revises: 0024_tab_quiz_submission_idempotency
Create Date: 2026-05-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025_search_trigram_indexes"
down_revision: Union[str, None] = "0024_tab_quiz_submission_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TRGM_INDEXES = (
    ("ix_users_full_name_trgm", "users", "full_name"),
    ("ix_users_email_trgm", "users", "email"),
    ("ix_topics_title_trgm", "topics", "title"),
    ("ix_topics_description_trgm", "topics", "description"),
    ("ix_topics_slug_trgm", "topics", "slug"),
    ("ix_professor_chat_conversations_last_preview_trgm", "professor_chat_conversations", "last_message_preview"),
)


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def upgrade() -> None:
    if not _is_postgresql():
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    with op.get_context().autocommit_block():
        for index_name, table_name, column_name in TRGM_INDEXES:
            op.execute(sa.text(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
                f"{_quote_identifier(index_name)} ON {_quote_identifier(table_name)} "
                f"USING gin ({_quote_identifier(column_name)} gin_trgm_ops)"
            ))


def downgrade() -> None:
    if not _is_postgresql():
        return

    with op.get_context().autocommit_block():
        for index_name, _, _ in reversed(TRGM_INDEXES):
            op.execute(sa.text(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote_identifier(index_name)}"))
