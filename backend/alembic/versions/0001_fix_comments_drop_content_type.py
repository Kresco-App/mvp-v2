"""Fix comments table: replace Django ContentType FK with target_type/target_id columns

Revision ID: 0001
Revises: 0000
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = "0000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "comments" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("comments")}

    if "target_type" not in columns:
        op.add_column("comments", sa.Column("target_type", sa.String(20), nullable=False, server_default="lesson"))
    if "target_id" not in columns:
        op.add_column("comments", sa.Column("target_id", sa.Integer(), nullable=False, server_default="0"))

    if bind.dialect.name == "postgresql" and "django_content_type" in inspector.get_table_names() and "content_type_id" in columns:
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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "comments" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("comments")}
    if "content_type_id" not in columns:
        op.add_column("comments", sa.Column("content_type_id", sa.Integer(), nullable=True))
    if "target_id" in columns:
        op.drop_column("comments", "target_id")
    if "target_type" in columns:
        op.drop_column("comments", "target_type")
