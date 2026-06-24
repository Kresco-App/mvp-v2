from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.payments import MANUAL_PAYMENT_RAILS


class AnalyticsEventIn(BaseModel):
    event_name: str = Field(min_length=2, max_length=80)
    anonymous_id: str | None = Field(default=None, max_length=120)
    session_id: str | None = Field(default=None, max_length=120)
    subject_id: int | None = Field(default=None, ge=1)
    topic_id: int | None = Field(default=None, ge=1)
    topic_item_id: int | None = Field(default=None, ge=1)
    resource_id: int | None = Field(default=None, ge=1)
    live_session_id: int | None = Field(default=None, ge=1)
    professor_user_id: int | None = Field(default=None, ge=1)
    value_int: int = Field(default=1, ge=0, le=1_000_000)
    duration_seconds: int = Field(default=0, ge=0, le=24 * 60 * 60)
    properties: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime | None = None

    @field_validator("event_name", "anonymous_id", "session_id")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AnalyticsEventOut(BaseModel):
    id: int
    event_name: str
    user_id: int | None = None
    occurred_at: datetime
    received_at: datetime


class FinanceExpenseIn(BaseModel):
    expense_month: date | None = None
    expense_date: date
    category: str = Field(min_length=2, max_length=60)
    vendor: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=255)
    amount_centimes: int = Field(ge=0)
    source: str = Field(default="manual", min_length=2, max_length=20)
    status: str = Field(default="paid", min_length=2, max_length=20)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("category", "vendor", "description", "source", "status")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower() if value.strip().lower() in {"manual", "vendor", "estimate", "planned", "paid", "cancelled"} else value.strip()

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        if value not in {"manual", "vendor", "estimate"}:
            raise ValueError("source must be manual, vendor, or estimate")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in {"planned", "paid", "cancelled"}:
            raise ValueError("status must be planned, paid, or cancelled")
        return value


class FinanceExpenseOut(BaseModel):
    id: int
    expense_month: date
    expense_date: date
    category: str
    vendor: str
    description: str
    amount_centimes: int
    currency: str
    source: str
    status: str
    created_by_user_id: int
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class RedemptionCodeTemplateIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    plan: str = Field(default="pro", min_length=1, max_length=60)
    tier: str = Field(default="pro", min_length=1, max_length=30)
    subject_scope: str = Field(default="all", min_length=2, max_length=20)
    subject_ids: list[int] = Field(default_factory=list, max_length=50)
    duration_days: int = Field(default=30, ge=0, le=3700)
    amount_centimes: int = Field(ge=0)
    status: str = Field(default="active", min_length=2, max_length=20)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name", "plan", "tier", "subject_scope", "status")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("subject_scope")
    @classmethod
    def validate_subject_scope(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"all", "selected"}:
            raise ValueError("subject_scope must be all or selected")
        return normalized

    @field_validator("status")
    @classmethod
    def validate_template_status(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"active", "archived"}:
            raise ValueError("status must be active or archived")
        return normalized


class RedemptionCodeTemplateOut(BaseModel):
    id: int
    name: str
    plan: str
    tier: str
    subject_scope: str
    subject_ids: list[int]
    duration_days: int
    amount_centimes: int
    currency: str
    status: str
    created_by_user_id: int
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class StaffPaymentProfileOut(BaseModel):
    user_id: int
    display_name: str
    status: str
    monthly_code_limit: int
    monthly_amount_limit_centimes: int
    allowed_template_ids: list[int]
    used_codes_this_month: int
    remaining_codes_this_month: int
    used_amount_this_month_centimes: int
    remaining_amount_this_month_centimes: int | None = None


class StaffPaymentRequestCreateIn(BaseModel):
    template_id: int = Field(gt=0)
    payment_method: str = Field(min_length=1, max_length=40)
    provider_reference: str = Field(min_length=3, max_length=160)
    amount_centimes: int = Field(gt=0)
    student_name: str = Field(min_length=2, max_length=160)
    student_phone: str = Field(min_length=4, max_length=80)
    student_email: str | None = Field(default=None, max_length=254)
    proof_url: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("payment_method")
    @classmethod
    def normalize_payment_method(cls, value: str) -> str:
        normalized = value.strip().lower().replace("-", "_")
        if normalized not in MANUAL_PAYMENT_RAILS:
            supported = ", ".join(sorted(MANUAL_PAYMENT_RAILS))
            raise ValueError(f"payment_method must be one of: {supported}")
        return normalized

    @field_validator("provider_reference", "student_name", "student_phone", "student_email", "proof_url", "notes")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class RedemptionCodeOut(BaseModel):
    id: int
    code: str
    template_id: int
    generated_by_user_id: int
    redeemed_by_user_id: int | None = None
    plan: str
    tier: str
    subject_ids: list[int]
    duration_days: int
    amount_centimes: int
    currency: str
    status: str
    expires_at: datetime | None = None
    redeemed_at: datetime | None = None
    created_at: datetime


class StaffPaymentRequestOut(BaseModel):
    id: int
    staff_user_id: int
    template_id: int
    redemption_code_id: int
    payment_method: str
    provider_reference: str
    amount_centimes: int
    currency: str
    status: str
    student_name: str
    student_phone: str
    student_email: str
    proof_url: str
    notes: str
    requires_review: bool
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    code: RedemptionCodeOut


class StaffPaymentDashboardOut(BaseModel):
    generated_at: datetime
    profile: StaffPaymentProfileOut
    templates: list[RedemptionCodeTemplateOut]
    requests: list[StaffPaymentRequestOut]


class RedemptionCodeRedeemIn(BaseModel):
    code: str = Field(min_length=6, max_length=80)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = "".join(ch for ch in value.strip().upper() if ch.isalnum())
        if not normalized:
            raise ValueError("code is required")
        return normalized


class RedemptionCodeRedeemOut(BaseModel):
    code: RedemptionCodeOut
    transaction_id: int
    entitlement_count: int


class FounderMetricOut(BaseModel):
    key: str
    label: str
    value: int | float
    previous_value: int | float = 0
    unit: str = "count"


class FounderDashboardOut(BaseModel):
    generated_at: datetime
    month: date
    metrics: list[FounderMetricOut]
    growth_by_day: list[dict[str, Any]]
    students_by_status: dict[str, int]
    students_by_tier: dict[str, int]
    students_by_track: dict[str, int]
    finance: dict[str, Any]
    engagement: dict[str, Any]
    messages: dict[str, Any]
    staff_codes: dict[str, Any]
    expenses: list[FinanceExpenseOut]
