from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    __table_args__ = (
        Index("ix_analytics_events_name_occurred", "event_name", "occurred_at"),
        Index("ix_analytics_events_user_occurred", "user_id", "occurred_at"),
        Index("ix_analytics_events_subject_occurred", "subject_id", "occurred_at"),
        Index("ix_analytics_events_topic_occurred", "topic_id", "occurred_at"),
        Index("ix_analytics_events_topic_item_occurred", "topic_item_id", "occurred_at"),
        Index("ix_analytics_events_session_occurred", "session_id", "occurred_at"),
        Index("ix_analytics_events_video_occurred", "resource_id", "occurred_at"),
        Index("ix_analytics_events_live_occurred", "live_session_id", "occurred_at"),
        Index("ix_analytics_events_professor_occurred", "professor_user_id", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_name: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    anonymous_id: Mapped[str] = mapped_column(String(120), default="", server_default="")
    session_id: Mapped[str] = mapped_column(String(120), default="", server_default="")
    subject_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    topic_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True)
    topic_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("topic_items.id", ondelete="SET NULL"), nullable=True)
    resource_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("resources.id", ondelete="SET NULL"), nullable=True)
    live_session_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("live_sessions.id", ondelete="SET NULL"), nullable=True)
    professor_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    value_int: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    properties_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}", nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AnalyticsDailyRollup(Base):
    __tablename__ = "analytics_daily_rollups"
    __table_args__ = (
        UniqueConstraint("rollup_date", "metric_key", "dimension_key", "dimension_value", name="uq_analytics_daily_rollups_metric_dimension"),
        Index("ix_analytics_daily_rollups_metric_date", "metric_key", "rollup_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rollup_date: Mapped[date] = mapped_column(Date, nullable=False)
    metric_key: Mapped[str] = mapped_column(String(80), nullable=False)
    dimension_key: Mapped[str] = mapped_column(String(80), default="all", server_default="all", nullable=False)
    dimension_value: Mapped[str] = mapped_column(String(160), default="all", server_default="all", nullable=False)
    value_int: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class FinanceExpense(Base):
    __tablename__ = "finance_expenses"
    __table_args__ = (
        CheckConstraint("currency = 'MAD'", name="ck_finance_expenses_currency"),
        CheckConstraint("amount_centimes >= 0", name="ck_finance_expenses_amount_nonnegative"),
        CheckConstraint("status IN ('planned', 'paid', 'cancelled')", name="ck_finance_expenses_status"),
        CheckConstraint("source IN ('manual', 'vendor', 'estimate')", name="ck_finance_expenses_source"),
        Index("ix_finance_expenses_month_category", "expense_month", "category"),
        Index("ix_finance_expenses_created_by", "created_by_user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    expense_month: Mapped[date] = mapped_column(Date, nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    vendor: Mapped[str] = mapped_column(String(120), default="", server_default="", nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="", server_default="", nullable=False)
    amount_centimes: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MAD", server_default="MAD", nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="manual", server_default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="paid", server_default="paid", nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class StaffPaymentProfile(Base):
    __tablename__ = "staff_payment_profiles"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'paused')", name="ck_staff_payment_profiles_status"),
        CheckConstraint("monthly_code_limit >= 0", name="ck_staff_payment_profiles_monthly_code_limit"),
        CheckConstraint("monthly_amount_limit_centimes >= 0", name="ck_staff_payment_profiles_monthly_amount_limit"),
    )

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(160), default="", server_default="", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active", nullable=False)
    monthly_code_limit: Mapped[int] = mapped_column(Integer, default=50, server_default="50", nullable=False)
    monthly_amount_limit_centimes: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    allowed_template_ids_json: Mapped[list[int]] = mapped_column(JSON, default=list, server_default="[]", nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class RedemptionCodeTemplate(Base):
    __tablename__ = "redemption_code_templates"
    __table_args__ = (
        CheckConstraint("amount_centimes >= 0", name="ck_redemption_code_templates_amount_nonnegative"),
        CheckConstraint("currency = 'MAD'", name="ck_redemption_code_templates_currency"),
        CheckConstraint("duration_days >= 0", name="ck_redemption_code_templates_duration_nonnegative"),
        CheckConstraint("subject_scope IN ('all', 'selected')", name="ck_redemption_code_templates_subject_scope"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_redemption_code_templates_status"),
        Index("ix_redemption_code_templates_status", "status"),
        Index("ix_redemption_code_templates_created_by", "created_by_user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    plan: Mapped[str] = mapped_column(String(60), default="pro", server_default="pro", nullable=False)
    tier: Mapped[str] = mapped_column(String(30), default="pro", server_default="pro", nullable=False)
    subject_scope: Mapped[str] = mapped_column(String(20), default="all", server_default="all", nullable=False)
    subject_ids_json: Mapped[list[int]] = mapped_column(JSON, default=list, server_default="[]", nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, default=30, server_default="30", nullable=False)
    amount_centimes: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MAD", server_default="MAD", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active", nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class RedemptionCode(Base):
    __tablename__ = "redemption_codes"
    __table_args__ = (
        UniqueConstraint("code", name="uq_redemption_codes_code"),
        CheckConstraint("amount_centimes >= 0", name="ck_redemption_codes_amount_nonnegative"),
        CheckConstraint("currency = 'MAD'", name="ck_redemption_codes_currency"),
        CheckConstraint("duration_days >= 0", name="ck_redemption_codes_duration_nonnegative"),
        CheckConstraint("status IN ('generated', 'redeemed', 'revoked', 'expired')", name="ck_redemption_codes_status"),
        Index("ix_redemption_codes_template_status", "template_id", "status"),
        Index("ix_redemption_codes_generator_created", "generated_by_user_id", "created_at"),
        Index("ix_redemption_codes_redeemed_by", "redeemed_by_user_id", "redeemed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    template_id: Mapped[int] = mapped_column(Integer, ForeignKey("redemption_code_templates.id", ondelete="RESTRICT"), nullable=False)
    generated_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    redeemed_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    plan: Mapped[str] = mapped_column(String(60), default="pro", server_default="pro", nullable=False)
    tier: Mapped[str] = mapped_column(String(30), default="pro", server_default="pro", nullable=False)
    subject_ids_json: Mapped[list[int]] = mapped_column(JSON, default=list, server_default="[]", nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, default=30, server_default="30", nullable=False)
    amount_centimes: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MAD", server_default="MAD", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="generated", server_default="generated", nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    redeemed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class StaffPaymentRequest(Base):
    __tablename__ = "staff_payment_requests"
    __table_args__ = (
        UniqueConstraint("payment_method", "provider_reference", name="uq_staff_payment_requests_method_reference"),
        CheckConstraint("amount_centimes >= 0", name="ck_staff_payment_requests_amount_nonnegative"),
        CheckConstraint("currency = 'MAD'", name="ck_staff_payment_requests_currency"),
        CheckConstraint("status IN ('code_generated', 'redeemed', 'revoked', 'needs_review')", name="ck_staff_payment_requests_status"),
        Index("ix_staff_payment_requests_staff_created", "staff_user_id", "created_at"),
        Index("ix_staff_payment_requests_template_created", "template_id", "created_at"),
        Index("ix_staff_payment_requests_status_created", "status", "created_at"),
        Index("ix_staff_payment_requests_code", "redemption_code_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    staff_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[int] = mapped_column(Integer, ForeignKey("redemption_code_templates.id", ondelete="RESTRICT"), nullable=False)
    redemption_code_id: Mapped[int] = mapped_column(Integer, ForeignKey("redemption_codes.id", ondelete="RESTRICT"), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(160), nullable=False)
    amount_centimes: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MAD", server_default="MAD", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="code_generated", server_default="code_generated", nullable=False)
    student_name: Mapped[str] = mapped_column(String(160), default="", server_default="", nullable=False)
    student_phone: Mapped[str] = mapped_column(String(80), default="", server_default="", nullable=False)
    student_email: Mapped[str] = mapped_column(String(254), default="", server_default="", nullable=False)
    proof_url: Mapped[str] = mapped_column(String(2000), default="", server_default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    requires_review: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
