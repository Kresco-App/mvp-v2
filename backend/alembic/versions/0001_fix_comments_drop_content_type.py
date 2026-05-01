"""Fix comments table: replace Django ContentType FK with target_type/target_id columns

Revision ID: 0001
Revises:
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new columns with safe defaults
    op.add_column("comments", sa.Column("target_type", sa.String(20), nullable=False, server_default="lesson"))
    op.add_column("comments", sa.Column("target_id", sa.Integer(), nullable=False, server_default="0"))

    # 2. Backfill from django_content_type (only runs if table exists — i.e. on live RDS)
    op.execute("""
        UPDATE comments c
        SET target_type = CASE
            WHEN ct.model = 'lesson'         THEN 'lesson'
            WHEN ct.model = 'chapter'        THEN 'chapter'
            WHEN ct.model = 'chaptersection' THEN 'section'
            ELSE 'lesson'
        END,
        target_id = c.object_id
        FROM django_content_type ct
        WHERE c.content_type_id = ct.id
    """)

    # 3. Drop FK constraint then the column
    # (constraint name may vary; use IF EXISTS pattern via raw SQL)
    op.execute("""
        DO $$
        DECLARE
            cname TEXT;
        BEGIN
            SELECT conname INTO cname
            FROM pg_constraint
            WHERE conrelid = 'comments'::regclass
              AND contype = 'f'
              AND conname ILIKE '%content_type%';
            IF cname IS NOT NULL THEN
                EXECUTE 'ALTER TABLE comments DROP CONSTRAINT ' || quote_ident(cname);
            END IF;
        END $$;
    """)
    op.drop_column("comments", "content_type_id")


def downgrade() -> None:
    op.add_column("comments", sa.Column("content_type_id", sa.Integer(), nullable=True))
    op.drop_column("comments", "target_id")
    op.drop_column("comments", "target_type")
