"""Add is_email_verified to users table

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "is_email_verified" in {col["name"] for col in inspector.get_columns("users")}:
        return
    op.add_column(
        "users",
        sa.Column("is_email_verified", sa.Boolean(), nullable=False, server_default="false"),
    )
    # Users created via Google SSO are pre-verified
    op.execute("UPDATE users SET is_email_verified = true WHERE google_id IS NOT NULL AND google_id != ''")


def downgrade() -> None:
    op.drop_column("users", "is_email_verified")
