"""local baseline schema

Revision ID: 0000
Revises:
Create Date: 2026-05-09
"""
from typing import Sequence, Union

from alembic import op

from app.models import courses, gamification, interactions, notifications, quizzes, users  # noqa: F401
from app.models.base import Base

revision: str = "0000"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    # Refuse instead of drop_all(): downgrading the baseline would drop every
    # table and destroy all data. Restore from a database snapshot instead.
    raise RuntimeError(
        "Refusing to downgrade the baseline migration: this would drop every table "
        "and irreversibly destroy all data. Restore from a database snapshot instead."
    )
