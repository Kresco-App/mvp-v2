"""legacy hierarchy purge bridge

Revision ID: 4557e0cfcf21
Revises: 0045_low_priority_integrity_guards
Create Date: 2026-05-28 13:45:00.000000

"""
from typing import Sequence, Union


revision: str = "4557e0cfcf21"
down_revision: Union[str, None] = "0045_low_priority_integrity_guards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
