from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.payments import PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS, PAYMENT_RAIL_CMI

SUPPORTED_PAYMENT_RAILS = {PAYMENT_RAIL_CMI, PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS}


class CheckoutCreateIn(BaseModel):
    plan: str = "pro"
    success_path: str = "/payment-success?session_id={CHECKOUT_SESSION_ID}"
    cancel_path: str = "/pricing"


class CheckoutOut(BaseModel):
    checkout_url: str


class VerifyIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=255)

    @field_validator("session_id")
    @classmethod
    def normalize_session_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("session_id is required")
        return normalized


class VerifyOut(BaseModel):
    is_pro: bool


class PaymentRequestCreateIn(BaseModel):
    payment_method: str = Field(min_length=1, max_length=40)
    plan: str = "pro"

    @field_validator("payment_method")
    @classmethod
    def normalize_payment_method(cls, value: str) -> str:
        normalized = value.strip().lower().replace("-", "_")
        if normalized not in SUPPORTED_PAYMENT_RAILS:
            supported = ", ".join(sorted(SUPPORTED_PAYMENT_RAILS))
            raise ValueError(f"payment_method must be one of: {supported}")
        return normalized

    @field_validator("plan")
    @classmethod
    def normalize_plan(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("plan is required")
        return normalized


class PaymentRequestOut(BaseModel):
    id: int
    payment_method: str
    status: str
    plan: str
    amount_centimes: int
    currency: str
    reference_code: str
    instructions: dict[str, Any]
    created_at: datetime
    expires_at: datetime | None = None


class ManualPaymentTransactionOut(BaseModel):
    id: int
    user_id: int
    provider: str
    payment_method: str
    status: str
    plan: str
    amount_centimes: int
    currency: str
    reference_code: str
    provider_reference: str | None = None
    instructions: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    expires_at: datetime | None = None
    confirmed_at: datetime | None = None


class ManualPaymentReviewIn(BaseModel):
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("reason is required")
        return normalized
