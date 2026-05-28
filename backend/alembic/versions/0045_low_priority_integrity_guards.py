"""Add low-priority integrity guards.

Revision ID: 0045
Revises: 0044
Create Date: 2026-05-28 10:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0045"
down_revision: Union[str, None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_names() -> set[str]:
    return set(_inspector().get_table_names())


def _check_names(table_name: str) -> set[str]:
    if table_name not in _table_names():
        return set()
    return {
        constraint["name"]
        for constraint in _inspector().get_check_constraints(table_name)
        if constraint.get("name")
    }


def upgrade() -> None:
    tables = _table_names()

    if "questions" in tables:
        with op.batch_alter_table("questions") as batch_op:
            batch_op.alter_column(
                "external_id",
                existing_type=sa.String(length=120),
                nullable=True,
                server_default=None,
            )

    if "professor_chat_conversations" in tables:
        op.execute(
            sa.text(
                "UPDATE professor_chat_conversations "
                "SET unread_for_professor = 0 "
                "WHERE unread_for_professor IS NULL OR unread_for_professor < 0"
            )
        )
        op.execute(
            sa.text(
                "UPDATE professor_chat_conversations "
                "SET unread_for_student = 0 "
                "WHERE unread_for_student IS NULL OR unread_for_student < 0"
            )
        )
        checks = _check_names("professor_chat_conversations")
        with op.batch_alter_table("professor_chat_conversations") as batch_op:
            batch_op.alter_column(
                "unread_for_professor",
                existing_type=sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            )
            batch_op.alter_column(
                "unread_for_student",
                existing_type=sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            )
            if "ck_professor_chat_unread_for_professor_nonnegative" not in checks:
                batch_op.create_check_constraint(
                    "ck_professor_chat_unread_for_professor_nonnegative",
                    "unread_for_professor >= 0",
                )
            if "ck_professor_chat_unread_for_student_nonnegative" not in checks:
                batch_op.create_check_constraint(
                    "ck_professor_chat_unread_for_student_nonnegative",
                    "unread_for_student >= 0",
                )

    if "user_xp" in tables:
        op.execute(sa.text("UPDATE user_xp SET total_xp = 0 WHERE total_xp IS NULL OR total_xp < 0"))
        op.execute(sa.text("UPDATE user_xp SET streak_days = 0 WHERE streak_days IS NULL OR streak_days < 0"))
        checks = _check_names("user_xp")
        with op.batch_alter_table("user_xp") as batch_op:
            batch_op.alter_column(
                "total_xp",
                existing_type=sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            )
            batch_op.alter_column(
                "streak_days",
                existing_type=sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            )
            if "ck_user_xp_total_xp_nonnegative" not in checks:
                batch_op.create_check_constraint("ck_user_xp_total_xp_nonnegative", "total_xp >= 0")
            if "ck_user_xp_streak_days_nonnegative" not in checks:
                batch_op.create_check_constraint("ck_user_xp_streak_days_nonnegative", "streak_days >= 0")

    if "xp_transactions" in tables:
        op.execute(sa.text("UPDATE xp_transactions SET amount = 0 WHERE amount < 0"))
        checks = _check_names("xp_transactions")
        if "ck_xp_transactions_amount_nonnegative" not in checks:
            with op.batch_alter_table("xp_transactions") as batch_op:
                batch_op.create_check_constraint("ck_xp_transactions_amount_nonnegative", "amount >= 0")


def downgrade() -> None:
    tables = _table_names()

    if "xp_transactions" in tables:
        checks = _check_names("xp_transactions")
        if "ck_xp_transactions_amount_nonnegative" in checks:
            with op.batch_alter_table("xp_transactions") as batch_op:
                batch_op.drop_constraint("ck_xp_transactions_amount_nonnegative", type_="check")

    if "user_xp" in tables:
        checks = _check_names("user_xp")
        with op.batch_alter_table("user_xp") as batch_op:
            if "ck_user_xp_streak_days_nonnegative" in checks:
                batch_op.drop_constraint("ck_user_xp_streak_days_nonnegative", type_="check")
            if "ck_user_xp_total_xp_nonnegative" in checks:
                batch_op.drop_constraint("ck_user_xp_total_xp_nonnegative", type_="check")
            batch_op.alter_column("streak_days", existing_type=sa.Integer(), server_default=None, existing_nullable=False)
            batch_op.alter_column("total_xp", existing_type=sa.Integer(), server_default=None, existing_nullable=False)

    if "professor_chat_conversations" in tables:
        checks = _check_names("professor_chat_conversations")
        with op.batch_alter_table("professor_chat_conversations") as batch_op:
            if "ck_professor_chat_unread_for_student_nonnegative" in checks:
                batch_op.drop_constraint("ck_professor_chat_unread_for_student_nonnegative", type_="check")
            if "ck_professor_chat_unread_for_professor_nonnegative" in checks:
                batch_op.drop_constraint("ck_professor_chat_unread_for_professor_nonnegative", type_="check")
            batch_op.alter_column("unread_for_student", existing_type=sa.Integer(), server_default=None, existing_nullable=False)
            batch_op.alter_column("unread_for_professor", existing_type=sa.Integer(), server_default=None, existing_nullable=False)

    if "questions" in tables:
        op.execute(
            sa.text(
                "UPDATE questions "
                "SET external_id = 'legacy-' || CAST(id AS VARCHAR) "
                "WHERE external_id IS NULL"
            )
        )
        with op.batch_alter_table("questions") as batch_op:
            batch_op.alter_column(
                "external_id",
                existing_type=sa.String(length=120),
                nullable=False,
                server_default=None,
            )

