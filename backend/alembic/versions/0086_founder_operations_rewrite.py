"""Add founder operations analytics, finance expenses, and staff redemption codes.

Revision ID: 0086
Revises: 0085
Create Date: 2026-06-24 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0086"
down_revision: Union[str, None] = "0085"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()

    if "analytics_events" not in tables:
        op.create_table(
            "analytics_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("event_name", sa.String(length=80), nullable=False),
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("anonymous_id", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("session_id", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("subject_id", sa.BigInteger(), sa.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True),
            sa.Column("topic_id", sa.BigInteger(), sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
            sa.Column("topic_item_id", sa.Integer(), sa.ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True),
            sa.Column("resource_id", sa.BigInteger(), sa.ForeignKey("resources.id", ondelete="SET NULL"), nullable=True),
            sa.Column("live_session_id", sa.BigInteger(), sa.ForeignKey("live_sessions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("professor_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("value_int", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("properties_json", sa.JSON(), nullable=False),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_analytics_events_name_occurred", "analytics_events", ["event_name", "occurred_at"])
        op.create_index("ix_analytics_events_user_occurred", "analytics_events", ["user_id", "occurred_at"])
        op.create_index("ix_analytics_events_subject_occurred", "analytics_events", ["subject_id", "occurred_at"])
        op.create_index("ix_analytics_events_topic_occurred", "analytics_events", ["topic_id", "occurred_at"])
        op.create_index("ix_analytics_events_topic_item_occurred", "analytics_events", ["topic_item_id", "occurred_at"])
        op.create_index("ix_analytics_events_session_occurred", "analytics_events", ["session_id", "occurred_at"])
        op.create_index("ix_analytics_events_video_occurred", "analytics_events", ["resource_id", "occurred_at"])
        op.create_index("ix_analytics_events_live_occurred", "analytics_events", ["live_session_id", "occurred_at"])
        op.create_index("ix_analytics_events_professor_occurred", "analytics_events", ["professor_user_id", "occurred_at"])

    if "analytics_daily_rollups" not in tables:
        op.create_table(
            "analytics_daily_rollups",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("rollup_date", sa.Date(), nullable=False),
            sa.Column("metric_key", sa.String(length=80), nullable=False),
            sa.Column("dimension_key", sa.String(length=80), nullable=False, server_default="all"),
            sa.Column("dimension_value", sa.String(length=160), nullable=False, server_default="all"),
            sa.Column("value_int", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("rollup_date", "metric_key", "dimension_key", "dimension_value", name="uq_analytics_daily_rollups_metric_dimension"),
        )
        op.create_index("ix_analytics_daily_rollups_metric_date", "analytics_daily_rollups", ["metric_key", "rollup_date"])

    if "finance_expenses" not in tables:
        op.create_table(
            "finance_expenses",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("expense_month", sa.Date(), nullable=False),
            sa.Column("expense_date", sa.Date(), nullable=False),
            sa.Column("category", sa.String(length=60), nullable=False),
            sa.Column("vendor", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("description", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="MAD"),
            sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="paid"),
            sa.Column("created_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("currency = 'MAD'", name="ck_finance_expenses_currency"),
            sa.CheckConstraint("amount_centimes >= 0", name="ck_finance_expenses_amount_nonnegative"),
            sa.CheckConstraint("status IN ('planned', 'paid', 'cancelled')", name="ck_finance_expenses_status"),
            sa.CheckConstraint("source IN ('manual', 'vendor', 'estimate')", name="ck_finance_expenses_source"),
        )
        op.create_index("ix_finance_expenses_month_category", "finance_expenses", ["expense_month", "category"])
        op.create_index("ix_finance_expenses_created_by", "finance_expenses", ["created_by_user_id", "created_at"])

    if "staff_payment_profiles" not in tables:
        op.create_table(
            "staff_payment_profiles",
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("display_name", sa.String(length=160), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("monthly_code_limit", sa.Integer(), nullable=False, server_default="50"),
            sa.Column("monthly_amount_limit_centimes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("allowed_template_ids_json", sa.JSON(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("status IN ('active', 'paused')", name="ck_staff_payment_profiles_status"),
            sa.CheckConstraint("monthly_code_limit >= 0", name="ck_staff_payment_profiles_monthly_code_limit"),
            sa.CheckConstraint("monthly_amount_limit_centimes >= 0", name="ck_staff_payment_profiles_monthly_amount_limit"),
        )

    if "redemption_code_templates" not in tables:
        op.create_table(
            "redemption_code_templates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("plan", sa.String(length=60), nullable=False, server_default="pro"),
            sa.Column("tier", sa.String(length=30), nullable=False, server_default="pro"),
            sa.Column("subject_scope", sa.String(length=20), nullable=False, server_default="all"),
            sa.Column("subject_ids_json", sa.JSON(), nullable=False),
            sa.Column("duration_days", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="MAD"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("created_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("amount_centimes >= 0", name="ck_redemption_code_templates_amount_nonnegative"),
            sa.CheckConstraint("currency = 'MAD'", name="ck_redemption_code_templates_currency"),
            sa.CheckConstraint("duration_days >= 0", name="ck_redemption_code_templates_duration_nonnegative"),
            sa.CheckConstraint("subject_scope IN ('all', 'selected')", name="ck_redemption_code_templates_subject_scope"),
            sa.CheckConstraint("status IN ('active', 'archived')", name="ck_redemption_code_templates_status"),
        )
        op.create_index("ix_redemption_code_templates_status", "redemption_code_templates", ["status"])
        op.create_index("ix_redemption_code_templates_created_by", "redemption_code_templates", ["created_by_user_id", "created_at"])

    if "redemption_codes" not in tables:
        op.create_table(
            "redemption_codes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(length=40), nullable=False),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("redemption_code_templates.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("generated_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("redeemed_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("plan", sa.String(length=60), nullable=False, server_default="pro"),
            sa.Column("tier", sa.String(length=30), nullable=False, server_default="pro"),
            sa.Column("subject_ids_json", sa.JSON(), nullable=False),
            sa.Column("duration_days", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="MAD"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="generated"),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("code", name="uq_redemption_codes_code"),
            sa.CheckConstraint("amount_centimes >= 0", name="ck_redemption_codes_amount_nonnegative"),
            sa.CheckConstraint("currency = 'MAD'", name="ck_redemption_codes_currency"),
            sa.CheckConstraint("duration_days >= 0", name="ck_redemption_codes_duration_nonnegative"),
            sa.CheckConstraint("status IN ('generated', 'redeemed', 'revoked', 'expired')", name="ck_redemption_codes_status"),
        )
        op.create_index("ix_redemption_codes_template_status", "redemption_codes", ["template_id", "status"])
        op.create_index("ix_redemption_codes_generator_created", "redemption_codes", ["generated_by_user_id", "created_at"])
        op.create_index("ix_redemption_codes_redeemed_by", "redemption_codes", ["redeemed_by_user_id", "redeemed_at"])

    if "staff_payment_requests" not in tables:
        op.create_table(
            "staff_payment_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("staff_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("redemption_code_templates.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("redemption_code_id", sa.Integer(), sa.ForeignKey("redemption_codes.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("payment_method", sa.String(length=40), nullable=False),
            sa.Column("provider_reference", sa.String(length=160), nullable=False),
            sa.Column("amount_centimes", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="MAD"),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="code_generated"),
            sa.Column("student_name", sa.String(length=160), nullable=False, server_default=""),
            sa.Column("student_phone", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("student_email", sa.String(length=254), nullable=False, server_default=""),
            sa.Column("proof_url", sa.String(length=2000), nullable=False, server_default=""),
            sa.Column("notes", sa.Text(), nullable=False, server_default=""),
            sa.Column("requires_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("payment_method", "provider_reference", name="uq_staff_payment_requests_method_reference"),
            sa.CheckConstraint("amount_centimes >= 0", name="ck_staff_payment_requests_amount_nonnegative"),
            sa.CheckConstraint("currency = 'MAD'", name="ck_staff_payment_requests_currency"),
            sa.CheckConstraint("status IN ('code_generated', 'redeemed', 'revoked', 'needs_review')", name="ck_staff_payment_requests_status"),
        )
        op.create_index("ix_staff_payment_requests_staff_created", "staff_payment_requests", ["staff_user_id", "created_at"])
        op.create_index("ix_staff_payment_requests_template_created", "staff_payment_requests", ["template_id", "created_at"])
        op.create_index("ix_staff_payment_requests_status_created", "staff_payment_requests", ["status", "created_at"])
        op.create_index("ix_staff_payment_requests_code", "staff_payment_requests", ["redemption_code_id"])


def downgrade() -> None:
    for table_name in (
        "staff_payment_requests",
        "redemption_codes",
        "redemption_code_templates",
        "staff_payment_profiles",
        "finance_expenses",
        "analytics_daily_rollups",
        "analytics_events",
    ):
        if table_name in _tables():
            op.drop_table(table_name)
