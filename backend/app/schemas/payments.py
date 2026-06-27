from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.payments import PAYMENT_RAIL_ASHPLUS, PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS, PAYMENT_RAIL_CMI
from app.schemas.limits import JsonBounds, StrictInputModel, validate_bounded_json_object

SUPPORTED_PAYMENT_RAILS = {PAYMENT_RAIL_CMI, PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS, PAYMENT_RAIL_ASHPLUS}
MANUAL_PAYMENT_RAILS = {PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS, PAYMENT_RAIL_ASHPLUS}
PAYMENT_IMPORT_RAW_ROW_BOUNDS = JsonBounds(
    max_container_depth=3,
    max_dict_items=50,
    max_list_items=50,
    max_string_length=1000,
    max_total_bytes=4096,
)


class PaymentRequestCreateIn(StrictInputModel):
    payment_method: str = Field(min_length=1, max_length=40)
    plan: str = Field(default="pro", min_length=1, max_length=60)

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
    metadata: dict[str, Any] = Field(default_factory=dict)


class ManualPaymentReviewIn(StrictInputModel):
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("reason is required")
        return normalized


class ManualPaymentProofIn(StrictInputModel):
    proof_kind: str = Field(default="receipt", min_length=3, max_length=40)
    provider_reference: str | None = Field(default=None, max_length=160)
    proof_url: str | None = Field(default=None, max_length=2000)
    payer_name: str | None = Field(default=None, max_length=160)
    paid_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("proof_kind", "provider_reference", "proof_url", "payer_name", "notes")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class ManualPaymentReconciliationIn(StrictInputModel):
    payment_method: str = Field(min_length=1, max_length=40)
    reference_code: str = Field(min_length=3, max_length=80)
    amount_centimes: int = Field(gt=0)
    provider_reference: str = Field(min_length=3, max_length=160)
    reason: str = Field(min_length=3, max_length=255)
    collected_at: datetime | None = None

    @field_validator("payment_method")
    @classmethod
    def normalize_payment_method(cls, value: str) -> str:
        normalized = value.strip().lower().replace("-", "_")
        if normalized not in MANUAL_PAYMENT_RAILS:
            supported = ", ".join(sorted(MANUAL_PAYMENT_RAILS))
            raise ValueError(f"payment_method must be one of: {supported}")
        return normalized

    @field_validator("reference_code", "provider_reference", "reason")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value is required")
        return normalized


class PaymentReconciliationImportRowIn(StrictInputModel):
    reference_code: str = Field(min_length=3, max_length=80)
    amount_centimes: int = Field(gt=0)
    provider_reference: str = Field(min_length=3, max_length=160)
    reason: str = Field(default="Reconciliation import row matched", min_length=3, max_length=255)
    collected_at: datetime | None = None
    raw_row: dict[str, Any] = Field(default_factory=dict)

    @field_validator("reference_code", "provider_reference", "reason")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value is required")
        return normalized

    @field_validator("raw_row")
    @classmethod
    def validate_raw_row(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_bounded_json_object(value, bounds=PAYMENT_IMPORT_RAW_ROW_BOUNDS)


class PaymentReconciliationImportIn(StrictInputModel):
    payment_method: str = Field(min_length=1, max_length=40)
    source_name: str | None = Field(default=None, max_length=160)
    rows: list[PaymentReconciliationImportRowIn] = Field(min_length=1, max_length=500)

    @field_validator("payment_method")
    @classmethod
    def normalize_payment_method(cls, value: str) -> str:
        normalized = value.strip().lower().replace("-", "_")
        if normalized not in MANUAL_PAYMENT_RAILS:
            supported = ", ".join(sorted(MANUAL_PAYMENT_RAILS))
            raise ValueError(f"payment_method must be one of: {supported}")
        return normalized

    @field_validator("source_name")
    @classmethod
    def normalize_source_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class PaymentReconciliationImportRowOut(BaseModel):
    row_number: int
    status: str
    reference_code: str
    amount_centimes: int
    provider_reference: str
    matched_transaction_id: int | None = None
    failure_reason: str | None = None


class PaymentReconciliationImportOut(BaseModel):
    id: int
    provider: str
    payment_method: str
    source_name: str | None = None
    status: str
    row_count: int
    matched_count: int
    mismatch_count: int
    unmatched_count: int
    duplicate_count: int
    error_count: int
    rows: list[PaymentReconciliationImportRowOut]
    created_at: datetime


class PaymentReconciliationImportSummaryOut(BaseModel):
    id: int
    provider: str
    payment_method: str
    source_name: str | None = None
    status: str
    row_count: int
    matched_count: int
    mismatch_count: int
    unmatched_count: int
    duplicate_count: int
    error_count: int
    created_by_user_id: int
    created_at: datetime


class PaymentReconciliationRowOut(BaseModel):
    id: int
    import_id: int
    row_number: int
    provider: str
    payment_method: str
    status: str
    reference_code: str
    amount_centimes: int
    currency: str
    provider_reference: str
    matched_transaction_id: int | None = None
    failure_reason: str | None = None
    created_at: datetime


class PaymentProviderEventOut(BaseModel):
    id: int
    transaction_id: int | None = None
    provider: str
    event_id: str
    event_type: str
    status: str
    payload: dict[str, Any]
    received_at: datetime
    processed_at: datetime | None = None


class FinanceMonitoringBucketOut(BaseModel):
    key: str
    count: int


class FinanceMonitoringProblemIndicatorOut(BaseModel):
    kind: str
    id: int
    transaction_id: int | None = None
    status: str
    label: str
    created_at: datetime | None = None


class FinancePaymentMonitoringOut(BaseModel):
    generated_at: datetime
    total_transactions: int
    total_provider_events: int
    transaction_statuses: list[FinanceMonitoringBucketOut]
    transaction_providers: list[FinanceMonitoringBucketOut]
    transaction_rails: list[FinanceMonitoringBucketOut]
    provider_event_statuses: list[FinanceMonitoringBucketOut]
    provider_event_types: list[FinanceMonitoringBucketOut]
    reconciliation_import_statuses: list[FinanceMonitoringBucketOut]
    refund_request_statuses: list[FinanceMonitoringBucketOut]
    open_manual_review_count: int
    open_provider_count: int
    failed_or_mismatch_count: int
    open_refund_request_count: int
    latest_problem_indicators: list[FinanceMonitoringProblemIndicatorOut]


class FinanceExportCreateIn(StrictInputModel):
    export_kind: str = Field(min_length=1, max_length=60)
    transaction_id: int | None = None
    limit: int = Field(default=200, ge=1, le=500)

    @field_validator("export_kind")
    @classmethod
    def normalize_export_kind(cls, value: str) -> str:
        normalized = value.strip().lower().replace("-", "_")
        if normalized not in {"ledger", "provider_events", "reconciliation_imports"}:
            raise ValueError("export_kind must be one of: ledger, provider_events, reconciliation_imports")
        return normalized


class FinanceExportSummaryOut(BaseModel):
    id: int
    export_kind: str
    status: str
    filters: dict[str, Any]
    row_count: int
    checksum_sha256: str
    created_by_user_id: int
    metadata: dict[str, Any]
    created_at: datetime


class FinanceExportOut(FinanceExportSummaryOut):
    filename: str
    content_type: str
    csv_text: str


class ManualAccessGrantCreateIn(StrictInputModel):
    user_id: int = Field(gt=0)
    subject_id: int = Field(gt=0)
    action: str = Field(min_length=1, max_length=20)
    reason: str = Field(min_length=3, max_length=255)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("action")
    @classmethod
    def normalize_action(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"grant", "revoke"}:
            raise ValueError("action must be one of: grant, revoke")
        return normalized

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("reason is required")
        return normalized


class ManualAccessGrantOut(BaseModel):
    id: int
    user_id: int
    subject_id: int
    action: str
    status: str
    entitlement_id: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    reason: str
    created_by_user_id: int
    metadata: dict[str, Any]
    created_at: datetime


class RefundRequestCreateIn(StrictInputModel):
    transaction_id: int = Field(gt=0)
    amount_centimes: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("reason is required")
        return normalized


class RefundRequestReviewIn(StrictInputModel):
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("reason is required")
        return normalized


class RefundRequestOut(BaseModel):
    id: int
    transaction_id: int | None = None
    user_id: int
    provider: str
    payment_method: str
    amount_centimes: int
    currency: str
    status: str
    reason: str
    requested_by_user_id: int
    reviewed_by_user_id: int | None = None
    review_reason: str | None = None
    metadata: dict[str, Any]
    created_at: datetime
    reviewed_at: datetime | None = None


class FinanceLedgerEntryOut(BaseModel):
    id: int
    transaction_id: int | None = None
    user_id: int | None = None
    entry_type: str
    amount_centimes: int
    currency: str
    reason: str
    metadata: dict[str, Any]
    created_at: datetime
