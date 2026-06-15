from datetime import datetime

from typing import Optional

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

PAYMENT_PROVIDER_STRIPE = "stripe"
PAYMENT_PROVIDER_CMI = "cmi"
PAYMENT_PROVIDER_BANK_TRANSFER = "bank_transfer"
PAYMENT_PROVIDER_CASHPLUS = "cashplus"
PAYMENT_PROVIDER_ASHPLUS = "ashplus"

PAYMENT_RAIL_CMI = "cmi"
PAYMENT_RAIL_BANK_TRANSFER = "bank_transfer"
PAYMENT_RAIL_CASHPLUS = "cashplus"
PAYMENT_RAIL_ASHPLUS = "ashplus"

PAYMENT_STATUS_DRAFT = "draft"
PAYMENT_STATUS_PENDING_PROVIDER = "pending_provider"
PAYMENT_STATUS_PENDING_MANUAL_REVIEW = "pending_manual_review"
PAYMENT_STATUS_PAID = "paid"
PAYMENT_STATUS_FAILED = "failed"
PAYMENT_STATUS_EXPIRED = "expired"
PAYMENT_STATUS_REFUNDED = "refunded"
PAYMENT_STATUS_CANCELLED = "cancelled"
PAYMENT_STATUS_MISMATCH = "mismatch"


class StripeWebhookEvent(Base):
    __tablename__ = "stripe_webhook_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentVerificationAttempt(Base):
    __tablename__ = "payment_verification_attempts"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "session_id",
            name="uq_payment_verification_attempts_user_session",
        ),
        Index("ix_payment_verification_attempts_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", server_default="pending")
    is_pro_result: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    response_status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_detail: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"
    __table_args__ = (
        UniqueConstraint("reference_code", name="uq_payment_transactions_reference_code"),
        UniqueConstraint("open_request_key", name="uq_payment_transactions_open_request_key"),
        CheckConstraint(
            "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_transactions_provider",
        ),
        CheckConstraint(
            "rail IN ('cmi', 'bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_transactions_rail",
        ),
        CheckConstraint(
            "status IN ('draft', 'pending_provider', 'pending_manual_review', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'mismatch')",
            name="ck_payment_transactions_status",
        ),
        CheckConstraint("currency = 'MAD'", name="ck_payment_transactions_currency"),
        Index("ix_payment_transactions_user_status", "user_id", "status"),
        Index("ix_payment_transactions_provider_status", "provider", "status"),
        Index("ix_payment_transactions_rail_status", "rail", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    rail: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=PAYMENT_STATUS_DRAFT,
        server_default=PAYMENT_STATUS_DRAFT,
        index=True,
    )
    plan: Mapped[str] = mapped_column(String(60), nullable=False, default="pro", server_default="pro")
    amount_centimes: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="MAD", server_default="MAD")
    reference_code: Mapped[str] = mapped_column(String(80), nullable=False)
    open_request_key: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    provider_reference: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    instructions_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    provider_payload_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PaymentProviderEvent(Base):
    __tablename__ = "payment_provider_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_payment_provider_events_provider_event"),
        CheckConstraint(
            "provider IN ('stripe', 'cmi', 'bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_provider_events_provider",
        ),
        CheckConstraint(
            "status IN ('received', 'processed', 'failed', 'ignored')",
            name="ck_payment_provider_events_status",
        ),
        Index("ix_payment_provider_events_transaction", "transaction_id"),
        Index("ix_payment_provider_events_provider_type", "provider", "event_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("payment_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    event_id: Mapped[str] = mapped_column(String(180), nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="received", server_default="received")
    payload_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PaymentTransactionProof(Base):
    __tablename__ = "payment_transaction_proofs"
    __table_args__ = (
        UniqueConstraint("transaction_id", "proof_digest", name="uq_payment_transaction_proofs_transaction_digest"),
        CheckConstraint(
            "rail IN ('bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_transaction_proofs_rail",
        ),
        CheckConstraint(
            "status IN ('submitted', 'reviewed', 'rejected')",
            name="ck_payment_transaction_proofs_status",
        ),
        Index("ix_payment_transaction_proofs_transaction", "transaction_id"),
        Index("ix_payment_transaction_proofs_user_created", "user_id", "created_at"),
        Index("ix_payment_transaction_proofs_rail_status", "rail", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("payment_transactions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rail: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="submitted", server_default="submitted")
    proof_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    proof_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_reference: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    proof_url: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    payer_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PaymentReconciliationImport(Base):
    __tablename__ = "payment_reconciliation_imports"
    __table_args__ = (
        CheckConstraint(
            "provider IN ('bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_reconciliation_imports_provider",
        ),
        CheckConstraint(
            "rail IN ('bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_reconciliation_imports_rail",
        ),
        CheckConstraint(
            "status IN ('processed', 'failed')",
            name="ck_payment_reconciliation_imports_status",
        ),
        Index("ix_payment_reconciliation_imports_provider_created", "provider", "created_at"),
        Index("ix_payment_reconciliation_imports_actor_created", "created_by_user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    rail: Mapped[str] = mapped_column(String(40), nullable=False)
    source_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="processed", server_default="processed")
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    matched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    mismatch_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    unmatched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    duplicate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentReconciliationRow(Base):
    __tablename__ = "payment_reconciliation_rows"
    __table_args__ = (
        UniqueConstraint("import_id", "row_number", name="uq_payment_reconciliation_rows_import_row"),
        CheckConstraint(
            "provider IN ('bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_reconciliation_rows_provider",
        ),
        CheckConstraint(
            "rail IN ('bank_transfer', 'cashplus', 'ashplus')",
            name="ck_payment_reconciliation_rows_rail",
        ),
        CheckConstraint(
            "status IN ('matched', 'mismatch', 'unmatched', 'duplicate', 'error')",
            name="ck_payment_reconciliation_rows_status",
        ),
        Index("ix_payment_reconciliation_rows_import", "import_id"),
        Index("ix_payment_reconciliation_rows_provider_reference", "provider", "provider_reference"),
        Index("ix_payment_reconciliation_rows_status", "status"),
        Index("ix_payment_reconciliation_rows_transaction", "matched_transaction_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("payment_reconciliation_imports.id", ondelete="CASCADE"),
        nullable=False,
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    rail: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_code: Mapped[str] = mapped_column(String(80), nullable=False)
    amount_centimes: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="MAD", server_default="MAD")
    provider_reference: Mapped[str] = mapped_column(String(160), nullable=False)
    row_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    matched_transaction_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("payment_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    failure_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    raw_row_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FinanceLedgerEntry(Base):
    __tablename__ = "finance_ledger_entries"
    __table_args__ = (
        CheckConstraint("currency = 'MAD'", name="ck_finance_ledger_entries_currency"),
        Index("ix_finance_ledger_entries_transaction", "transaction_id"),
        Index("ix_finance_ledger_entries_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("payment_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entry_type: Mapped[str] = mapped_column(String(60), nullable=False)
    amount_centimes: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="MAD", server_default="MAD")
    reason: Mapped[str] = mapped_column(String(255), nullable=False, default="", server_default="")
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FinanceExport(Base):
    __tablename__ = "finance_exports"
    __table_args__ = (
        CheckConstraint(
            "export_kind IN ('ledger', 'provider_events', 'reconciliation_imports')",
            name="ck_finance_exports_kind",
        ),
        CheckConstraint(
            "status IN ('completed', 'failed')",
            name="ck_finance_exports_status",
        ),
        Index("ix_finance_exports_actor_created", "created_by_user_id", "created_at"),
        Index("ix_finance_exports_kind_created", "export_kind", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    export_kind: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="completed", server_default="completed")
    filters_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
