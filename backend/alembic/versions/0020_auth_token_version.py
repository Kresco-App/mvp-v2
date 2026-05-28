"""Add auth token version for password reset invalidation."""

from alembic import op
import sqlalchemy as sa


revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("users")
    if "auth_token_version" not in columns:
        op.add_column(
            "users",
            sa.Column("auth_token_version", sa.Integer(), nullable=False, server_default="0"),
        )
    if "password_changed_at" not in columns:
        op.add_column(
            "users",
            sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    columns = _columns("users")
    with op.batch_alter_table("users") as batch_op:
        if "password_changed_at" in columns:
            batch_op.drop_column("password_changed_at")
        if "auth_token_version" in columns:
            batch_op.drop_column("auth_token_version")

