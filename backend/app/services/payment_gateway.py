from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import hmac
import html
import ipaddress
import re
import secrets
from types import SimpleNamespace
from urllib.parse import urlparse
from urllib.parse import urljoin

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.payments import (
    FinanceLedgerEntry,
    PAYMENT_PROVIDER_ASHPLUS,
    PAYMENT_PROVIDER_BANK_TRANSFER,
    PAYMENT_PROVIDER_CASHPLUS,
    PAYMENT_PROVIDER_CMI,
    PAYMENT_RAIL_ASHPLUS,
    PAYMENT_RAIL_BANK_TRANSFER,
    PAYMENT_RAIL_CASHPLUS,
    PAYMENT_RAIL_CMI,
    PAYMENT_STATUS_EXPIRED,
    PAYMENT_STATUS_FAILED,
    PAYMENT_STATUS_MISMATCH,
    PAYMENT_STATUS_PAID,
    PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
    PAYMENT_STATUS_PENDING_PROVIDER,
    PaymentProviderEvent,
    PaymentReconciliationImport,
    PaymentReconciliationRow,
    PaymentTransaction,
    PaymentTransactionProof,
)
from app.models.users import User
from app.schemas.payments import (
    FinanceLedgerEntryOut,
    ManualPaymentProofIn,
    ManualPaymentReconciliationIn,
    ManualPaymentTransactionOut,
    PaymentProviderEventOut,
    PaymentReconciliationImportIn,
    PaymentReconciliationImportOut,
    PaymentReconciliationImportRowIn,
    PaymentReconciliationImportRowOut,
    PaymentReconciliationImportSummaryOut,
    PaymentRequestOut,
)
from app.services.payment_entitlements import grant_paid_subject_entitlements

PAYMENT_PLAN_PRICES_CENTIMES = {
    "pro": 9900,
}
MANUAL_PAYMENT_RAILS = {PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS, PAYMENT_RAIL_ASHPLUS}
MANUAL_PAYMENT_EXPIRY_DAYS = 7
MANUAL_PAYMENT_EVENT_APPROVED = "manual.approved"
MANUAL_PAYMENT_EVENT_REJECTED = "manual.rejected"
MANUAL_PAYMENT_EVENT_PROOF_SUBMITTED = "manual.proof_submitted"
MANUAL_PAYMENT_EVENT_RECONCILED = "manual.reconciled"
MANUAL_PAYMENT_EVENT_RECONCILIATION_MISMATCH = "manual.reconciliation_mismatch"
MANUAL_PAYMENT_EVENT_RECONCILIATION_UNMATCHED = "manual.reconciliation_unmatched"
MANUAL_PAYMENT_EVENT_RECONCILIATION_DUPLICATE = "manual.reconciliation_duplicate"
MANUAL_PAYMENT_EVENT_EXPIRED = "manual.expired"
CMI_PAYMENT_EXPIRY_MINUTES = 30
CMI_CURRENCY_CODE_MAD = "504"
CMI_TRAN_TYPE = "PreAuth"
CMI_STORE_TYPE = "3D_PAY_HOSTING"
CMI_HASH_ALGORITHM = "ver3"
CMI_CALLBACK_RESPONSE = "true"
CMI_CALLBACK_EVENT_APPROVED = "cmi.callback.approved"
CMI_CALLBACK_EVENT_FAILED = "cmi.callback.failed"
CMI_CALLBACK_EVENT_INVALID = "cmi.callback.invalid"
CMI_PAYMENT_EVENT_EXPIRED = "cmi.payment_expired"
CMI_POSTAUTH_RESPONSE = "ACTION=POSTAUTH"
CMI_FAILURE_RESPONSE = "FAILURE"


def amount_for_plan(plan: str) -> int:
    normalized = plan.strip().lower()
    try:
        return PAYMENT_PLAN_PRICES_CENTIMES[normalized]
    except KeyError as exc:
        raise HTTPException(status_code=400, detail="Invalid payment plan") from exc


def provider_for_rail(payment_method: str) -> str:
    if payment_method == PAYMENT_RAIL_BANK_TRANSFER:
        return PAYMENT_PROVIDER_BANK_TRANSFER
    if payment_method == PAYMENT_RAIL_CASHPLUS:
        return PAYMENT_PROVIDER_CASHPLUS
    if payment_method == PAYMENT_RAIL_ASHPLUS:
        return PAYMENT_PROVIDER_ASHPLUS
    if payment_method == PAYMENT_RAIL_CMI:
        return PAYMENT_PROVIDER_CMI
    raise HTTPException(status_code=400, detail="Unsupported payment method")


async def create_payment_request(
    db: AsyncSession,
    *,
    user: User,
    payment_method: str,
    plan: str,
    settings: Settings,
) -> PaymentRequestOut:
    normalized_method = payment_method.strip().lower()
    if normalized_method == PAYMENT_RAIL_CMI:
        return await create_pending_cmi_payment_request(db, user=user, plan=plan, settings=settings)
    return await create_pending_manual_payment_request(
        db,
        user=user,
        payment_method=normalized_method,
        plan=plan,
    )


async def get_current_payment_request(
    db: AsyncSession,
    *,
    user: User,
    plan: str = "pro",
) -> PaymentRequestOut | None:
    normalized_plan = plan.strip().lower()
    amount_for_plan(normalized_plan)
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.user_id == int(user.id),
            PaymentTransaction.plan == normalized_plan,
            PaymentTransaction.rail.in_(
                [
                    PAYMENT_RAIL_ASHPLUS,
                    PAYMENT_RAIL_BANK_TRANSFER,
                    PAYMENT_RAIL_CASHPLUS,
                    PAYMENT_RAIL_CMI,
                ]
            ),
            PaymentTransaction.status.in_(
                [
                    PAYMENT_STATUS_PENDING_PROVIDER,
                    PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
                    PAYMENT_STATUS_PAID,
                    PAYMENT_STATUS_FAILED,
                    PAYMENT_STATUS_EXPIRED,
                    PAYMENT_STATUS_MISMATCH,
                ]
            ),
        )
        .order_by(PaymentTransaction.created_at.desc(), PaymentTransaction.id.desc())
        .limit(1)
    )
    transaction = result.scalar_one_or_none()
    if transaction is None or transaction.status == PAYMENT_STATUS_PAID:
        return None

    if transaction.status in {PAYMENT_STATUS_PENDING_MANUAL_REVIEW, PAYMENT_STATUS_PENDING_PROVIDER}:
        if _manual_transaction_is_expired(transaction, now=now):
            if transaction.rail == PAYMENT_RAIL_CMI:
                await _expire_cmi_transaction(db, transaction=transaction, now=now)
            else:
                await _expire_manual_transaction(db, transaction=transaction, now=now)
            await db.refresh(transaction)

    return current_payment_request_out(transaction)


async def create_pending_cmi_payment_request(
    db: AsyncSession,
    *,
    user: User,
    plan: str,
    settings: Settings,
) -> PaymentRequestOut:
    _ensure_cmi_configured(settings)
    user_id = int(user.id)
    user_email = user.email
    user_full_name = user.full_name
    normalized_plan = plan.strip().lower()
    amount_centimes = amount_for_plan(normalized_plan)
    now = datetime.now(timezone.utc)
    request_key = _open_cmi_request_key(user_id=user_id, plan=normalized_plan)
    existing = await _load_open_cmi_request(db, request_key=request_key, now=now)
    if existing is not None:
        return payment_request_out(existing)
    await _release_expired_open_cmi_request(db, request_key=request_key, now=now)

    expires_at = now + timedelta(minutes=CMI_PAYMENT_EXPIRY_MINUTES)
    reference_code = _reference_code(PAYMENT_RAIL_CMI, user_id)
    form_fields = _cmi_form_fields(
        settings=settings,
        user=SimpleNamespace(email=user_email, full_name=user_full_name),
        reference_code=reference_code,
        amount_centimes=amount_centimes,
    )
    instructions = _cmi_payment_instructions(
        settings=settings,
        reference_code=reference_code,
        amount_centimes=amount_centimes,
        expires_at=expires_at,
        form_fields=form_fields,
    )

    transaction = PaymentTransaction(
        user_id=user_id,
        provider=PAYMENT_PROVIDER_CMI,
        rail=PAYMENT_RAIL_CMI,
        status=PAYMENT_STATUS_PENDING_PROVIDER,
        plan=normalized_plan,
        amount_centimes=amount_centimes,
        currency="MAD",
        reference_code=reference_code,
        open_request_key=request_key,
        instructions_json=instructions,
        provider_payload_json={
            "action_url": settings.cmi_payment_url.strip(),
            "form_method": "POST",
            "form_fields": form_fields,
            "hash_algorithm": CMI_HASH_ALGORITHM,
        },
        metadata_json={"source": "student_payment_request", "adapter": "cmi_form_post"},
        expires_at=expires_at,
    )
    db.add(transaction)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await _load_open_cmi_request(db, request_key=request_key, now=now)
        if existing is not None:
            return payment_request_out(existing)
        raise
    await db.refresh(transaction)
    return payment_request_out(transaction)


async def process_cmi_callback(
    db: AsyncSession,
    *,
    settings: Settings,
    payload: dict[str, str],
) -> str:
    _ensure_cmi_configured(settings)
    normalized_payload = {str(key): str(value) for key, value in payload.items()}
    now = datetime.now(timezone.utc)
    reference_code = _payload_value(normalized_payload, "oid", "ReturnOid", "orderid")
    event_id = _cmi_callback_event_id(normalized_payload)

    transaction = await _load_cmi_transaction_for_update(db, reference_code=reference_code)
    if not _cmi_callback_hash_valid(normalized_payload, store_key=settings.cmi_store_key):
        invalid_event_id = _cmi_invalid_callback_event_id(normalized_payload)
        existing_invalid_event = await _load_provider_event(
            db,
            provider=PAYMENT_PROVIDER_CMI,
            event_id=invalid_event_id,
        )
        if existing_invalid_event is not None:
            return CMI_FAILURE_RESPONSE
        db.add(
            PaymentProviderEvent(
                transaction_id=int(transaction.id) if transaction is not None else None,
                provider=PAYMENT_PROVIDER_CMI,
                event_id=invalid_event_id,
                event_type=CMI_CALLBACK_EVENT_INVALID,
                status="failed",
                payload_json=_redacted_cmi_payload(normalized_payload),
                processed_at=now,
            )
        )
        await _commit_provider_event_or_ignore_duplicate(
            db,
            provider=PAYMENT_PROVIDER_CMI,
            event_id=invalid_event_id,
        )
        return CMI_FAILURE_RESPONSE

    matches_transaction = (
        transaction is not None and _cmi_callback_matches_transaction(normalized_payload, transaction, settings=settings)
    )
    callback_success = _cmi_callback_is_success(normalized_payload)
    existing_event = await _load_provider_event(db, provider=PAYMENT_PROVIDER_CMI, event_id=event_id)
    if existing_event is not None:
        if transaction is not None and transaction.status == PAYMENT_STATUS_PAID and matches_transaction and callback_success:
            return CMI_POSTAUTH_RESPONSE
        return CMI_FAILURE_RESPONSE

    if transaction is None:
        db.add(
            PaymentProviderEvent(
                transaction_id=None,
                provider=PAYMENT_PROVIDER_CMI,
                event_id=event_id,
                event_type=CMI_CALLBACK_EVENT_FAILED,
                status="ignored",
                payload_json=_redacted_cmi_payload(normalized_payload),
                processed_at=now,
            )
        )
        await _commit_provider_event_or_ignore_duplicate(db, provider=PAYMENT_PROVIDER_CMI, event_id=event_id)
        return CMI_FAILURE_RESPONSE

    if transaction.status == PAYMENT_STATUS_PAID:
        await _record_cmi_ignored_event(
            db,
            transaction=transaction,
            event_id=event_id,
            payload=normalized_payload,
            now=now,
            event_type=CMI_CALLBACK_EVENT_APPROVED if callback_success else CMI_CALLBACK_EVENT_FAILED,
        )
        return CMI_FAILURE_RESPONSE
    if transaction.status != PAYMENT_STATUS_PENDING_PROVIDER:
        await _record_cmi_ignored_event(
            db,
            transaction=transaction,
            event_id=event_id,
            payload=normalized_payload,
            now=now,
            event_type=CMI_CALLBACK_EVENT_FAILED,
        )
        return CMI_FAILURE_RESPONSE
    if _manual_transaction_is_expired(transaction, now=now):
        await _expire_cmi_transaction(db, transaction=transaction, now=now)
        await db.refresh(transaction)
        await _record_cmi_ignored_event(
            db,
            transaction=transaction,
            event_id=event_id,
            payload=normalized_payload,
            now=now,
            event_type=CMI_CALLBACK_EVENT_FAILED,
        )
        return CMI_FAILURE_RESPONSE

    if not matches_transaction:
        await _mark_cmi_transaction_mismatch(
            db,
            transaction=transaction,
            event_id=event_id,
            payload=normalized_payload,
            now=now,
        )
        return CMI_FAILURE_RESPONSE

    if not callback_success:
        await _mark_cmi_transaction_failed(
            db,
            transaction=transaction,
            event_id=event_id,
            payload=normalized_payload,
            now=now,
        )
        return CMI_FAILURE_RESPONSE

    await _mark_cmi_transaction_paid(
        db,
        transaction=transaction,
        event_id=event_id,
        payload=normalized_payload,
        now=now,
    )
    return CMI_POSTAUTH_RESPONSE


async def create_pending_manual_payment_request(
    db: AsyncSession,
    *,
    user: User,
    payment_method: str,
    plan: str,
) -> PaymentRequestOut:
    user_id = int(user.id)
    normalized_method = payment_method.strip().lower()
    if normalized_method not in MANUAL_PAYMENT_RAILS:
        provider_for_rail(normalized_method)
        raise HTTPException(status_code=400, detail="Payment method does not support manual instructions")

    normalized_plan = plan.strip().lower()
    amount_centimes = amount_for_plan(normalized_plan)
    now = datetime.now(timezone.utc)
    request_key = _open_request_key(user_id=user_id, payment_method=normalized_method, plan=normalized_plan)
    existing = await _load_open_manual_request(db, request_key=request_key, now=now)
    if existing is not None:
        return payment_request_out(existing)
    await _release_expired_open_manual_request(db, request_key=request_key, now=now)

    expires_at = now + timedelta(days=MANUAL_PAYMENT_EXPIRY_DAYS)
    reference_code = _reference_code(normalized_method, user_id)
    instructions = _manual_payment_instructions(
        payment_method=normalized_method,
        reference_code=reference_code,
        amount_centimes=amount_centimes,
        currency="MAD",
        expires_at=expires_at,
    )

    transaction = PaymentTransaction(
        user_id=user_id,
        provider=provider_for_rail(normalized_method),
        rail=normalized_method,
        status=PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
        plan=normalized_plan,
        amount_centimes=amount_centimes,
        currency="MAD",
        reference_code=reference_code,
        open_request_key=request_key,
        instructions_json=instructions,
        metadata_json={"source": "student_payment_request"},
        expires_at=expires_at,
    )
    db.add(transaction)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await _load_open_manual_request(db, request_key=request_key, now=now)
        if existing is not None:
            return payment_request_out(existing)
        raise
    await db.refresh(transaction)
    return payment_request_out(transaction)


def payment_request_out(transaction: PaymentTransaction) -> PaymentRequestOut:
    return PaymentRequestOut(
        id=int(transaction.id),
        payment_method=transaction.rail,
        status=transaction.status,
        plan=transaction.plan,
        amount_centimes=int(transaction.amount_centimes),
        currency=transaction.currency,
        reference_code=transaction.reference_code,
        instructions=transaction.instructions_json or {},
        created_at=transaction.created_at,
        expires_at=transaction.expires_at,
    )


def current_payment_request_out(transaction: PaymentTransaction) -> PaymentRequestOut:
    request = payment_request_out(transaction)
    if transaction.status in {PAYMENT_STATUS_PENDING_MANUAL_REVIEW, PAYMENT_STATUS_PENDING_PROVIDER}:
        return request
    return request.model_copy(update={"instructions": {}})


async def list_manual_payment_transactions(
    db: AsyncSession,
    *,
    status: str = PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
    limit: int = 100,
) -> list[ManualPaymentTransactionOut]:
    normalized_status = status.strip().lower()
    if normalized_status not in {
        PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
        PAYMENT_STATUS_PAID,
        PAYMENT_STATUS_FAILED,
        PAYMENT_STATUS_MISMATCH,
    }:
        raise HTTPException(status_code=400, detail="Unsupported manual payment status filter")

    result = await db.execute(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.rail.in_(sorted(MANUAL_PAYMENT_RAILS)),
            PaymentTransaction.status == normalized_status,
        )
        .order_by(PaymentTransaction.created_at.desc())
        .limit(max(1, min(int(limit), 200)))
    )
    return [manual_payment_transaction_out(transaction) for transaction in result.scalars().all()]


async def list_finance_ledger_entries(
    db: AsyncSession,
    *,
    transaction_id: int | None = None,
    limit: int = 100,
) -> list[FinanceLedgerEntryOut]:
    statement = select(FinanceLedgerEntry).order_by(FinanceLedgerEntry.created_at.desc(), FinanceLedgerEntry.id.desc())
    if transaction_id is not None:
        statement = statement.where(FinanceLedgerEntry.transaction_id == transaction_id)
    result = await db.execute(statement.limit(_bounded_finance_limit(limit)))
    return [finance_ledger_entry_out(entry) for entry in result.scalars().all()]


async def list_payment_provider_events(
    db: AsyncSession,
    *,
    transaction_id: int | None = None,
    limit: int = 100,
) -> list[PaymentProviderEventOut]:
    statement = select(PaymentProviderEvent).order_by(PaymentProviderEvent.received_at.desc(), PaymentProviderEvent.id.desc())
    if transaction_id is not None:
        statement = statement.where(PaymentProviderEvent.transaction_id == transaction_id)
    result = await db.execute(statement.limit(_bounded_finance_limit(limit)))
    return [payment_provider_event_out(event) for event in result.scalars().all()]


async def list_payment_reconciliation_imports(
    db: AsyncSession,
    *,
    limit: int = 50,
) -> list[PaymentReconciliationImportSummaryOut]:
    result = await db.execute(
        select(PaymentReconciliationImport)
        .order_by(PaymentReconciliationImport.created_at.desc(), PaymentReconciliationImport.id.desc())
        .limit(_bounded_finance_limit(limit, maximum=100))
    )
    return [payment_reconciliation_import_summary_out(item) for item in result.scalars().all()]


async def submit_manual_payment_proof(
    db: AsyncSession,
    *,
    transaction_id: int,
    user: User,
    proof: ManualPaymentProofIn,
) -> ManualPaymentTransactionOut:
    transaction = await _load_user_manual_transaction_for_update(
        db,
        transaction_id=transaction_id,
        user_id=int(user.id),
    )
    if transaction.status != PAYMENT_STATUS_PENDING_MANUAL_REVIEW:
        raise HTTPException(status_code=409, detail="Manual payment is not pending review")

    now = datetime.now(timezone.utc)
    if _manual_transaction_is_expired(transaction, now=now):
        await _expire_manual_transaction(db, transaction=transaction, now=now)
        raise HTTPException(status_code=409, detail="Manual payment request is expired")

    proof_payload = _manual_proof_payload(proof)
    proof_digest = _manual_proof_digest(proof_payload)
    event_id = _manual_proof_event_id(transaction_id=int(transaction.id), proof_digest=proof_digest)
    existing_event = await _load_provider_event(db, provider=transaction.provider, event_id=event_id)
    if existing_event is not None:
        return manual_payment_transaction_out(transaction)

    metadata = dict(transaction.metadata_json or {})
    proofs = list(metadata.get("proofs") or [])
    proof_record = {
        **proof_payload,
        "submitted_by_user_id": int(user.id),
        "submitted_at": now.isoformat(),
        "proof_digest": proof_digest,
    }
    proofs.append(proof_record)
    metadata["proofs"] = proofs
    metadata["latest_proof_submitted_at"] = now.isoformat()
    transaction.metadata_json = metadata
    db.add(
        PaymentTransactionProof(
            transaction_id=int(transaction.id),
            user_id=int(user.id),
            rail=transaction.rail,
            status="submitted",
            proof_kind=proof_payload["proof_kind"],
            proof_digest=proof_digest,
            provider_reference=proof_payload.get("provider_reference"),
            proof_url=proof_payload.get("proof_url"),
            payer_name=proof_payload.get("payer_name"),
            paid_at=proof.paid_at,
            notes=proof_payload.get("notes"),
            metadata_json={"submitted_by_user_id": int(user.id)},
        )
    )
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=transaction.provider,
            event_id=event_id,
            event_type=MANUAL_PAYMENT_EVENT_PROOF_SUBMITTED,
            status="received",
            payload_json=proof_record,
        )
    )
    await db.commit()
    await db.refresh(transaction)
    return manual_payment_transaction_out(transaction)


async def reconcile_manual_payment_transaction(
    db: AsyncSession,
    *,
    actor: User,
    reconciliation: ManualPaymentReconciliationIn,
) -> ManualPaymentTransactionOut:
    payment_method = reconciliation.payment_method
    provider = provider_for_rail(payment_method)
    event_id = _manual_reconciliation_event_id(
        provider_reference=reconciliation.provider_reference,
        reference_code=reconciliation.reference_code,
    )
    existing_event = await _load_provider_event(db, provider=provider, event_id=event_id)
    if existing_event is not None and existing_event.transaction_id is not None:
        existing_transaction = await db.get(PaymentTransaction, int(existing_event.transaction_id))
        if existing_transaction is not None:
            if not _manual_reconciliation_matches_transaction(existing_transaction, reconciliation):
                raise HTTPException(
                    status_code=409,
                    detail="Provider reference is already reconciled to another manual payment",
                )
            return manual_payment_transaction_out(existing_transaction)
    if existing_event is not None:
        raise HTTPException(status_code=409, detail="Reconciliation row was already recorded as unmatched")

    transaction = await _load_manual_transaction_by_reference_for_update(
        db,
        payment_method=payment_method,
        reference_code=reconciliation.reference_code,
    )
    now = datetime.now(timezone.utc)
    if transaction is None:
        db.add(
            PaymentProviderEvent(
                transaction_id=None,
                provider=provider,
                event_id=event_id,
                event_type=MANUAL_PAYMENT_EVENT_RECONCILIATION_UNMATCHED,
                status="failed",
                payload_json=_manual_reconciliation_payload(reconciliation, actor=actor),
                processed_at=now,
            )
        )
        await db.commit()
        raise HTTPException(status_code=404, detail="Manual payment reference was not found")

    if int(actor.id) == int(transaction.user_id):
        raise HTTPException(status_code=403, detail="Staff cannot reconcile their own manual payment")
    if transaction.status == PAYMENT_STATUS_PAID:
        if (
            transaction.provider_reference == reconciliation.provider_reference
            and _manual_reconciliation_matches_transaction(transaction, reconciliation)
        ):
            return manual_payment_transaction_out(transaction)
        await _record_manual_reconciliation_duplicate_event(
            db,
            transaction=transaction,
            actor=actor,
            reconciliation=reconciliation,
            event_id=event_id,
            now=now,
            reason="Manual payment is already paid",
        )
        raise HTTPException(status_code=409, detail="Manual payment is already paid")
    if transaction.status != PAYMENT_STATUS_PENDING_MANUAL_REVIEW:
        await _record_manual_reconciliation_duplicate_event(
            db,
            transaction=transaction,
            actor=actor,
            reconciliation=reconciliation,
            event_id=event_id,
            now=now,
            reason="Manual payment is not pending review",
        )
        raise HTTPException(status_code=409, detail="Manual payment is not pending review")
    if _manual_transaction_is_expired(transaction, now=now):
        await _expire_manual_transaction(db, transaction=transaction, now=now)
        raise HTTPException(status_code=409, detail="Manual payment request is expired")

    if int(reconciliation.amount_centimes) != int(transaction.amount_centimes):
        await _mark_manual_transaction_mismatch(
            db,
            transaction=transaction,
            actor=actor,
            reconciliation=reconciliation,
            event_id=event_id,
            now=now,
        )
        return manual_payment_transaction_out(transaction)

    await _mark_manual_transaction_reconciled(
        db,
        transaction=transaction,
        actor=actor,
        reconciliation=reconciliation,
        event_id=event_id,
        now=now,
    )
    return manual_payment_transaction_out(transaction)


async def import_manual_payment_reconciliation(
    db: AsyncSession,
    *,
    actor: User,
    reconciliation_import: PaymentReconciliationImportIn,
) -> PaymentReconciliationImportOut:
    payment_method = reconciliation_import.payment_method
    provider = provider_for_rail(payment_method)
    import_record = PaymentReconciliationImport(
        provider=provider,
        rail=payment_method,
        source_name=reconciliation_import.source_name,
        status="failed",
        row_count=len(reconciliation_import.rows),
        created_by_user_id=int(actor.id),
        metadata_json={"source": "manual_json_import"},
    )
    db.add(import_record)
    await db.commit()
    await db.refresh(import_record)

    rows_out: list[PaymentReconciliationImportRowOut] = []
    counts = {"matched": 0, "mismatch": 0, "unmatched": 0, "duplicate": 0, "error": 0}
    try:
        for row_number, row in enumerate(reconciliation_import.rows, start=1):
            row_out = await _process_reconciliation_import_row(
                db,
                actor=actor,
                import_id=int(import_record.id),
                provider=provider,
                payment_method=payment_method,
                row_number=row_number,
                row=row,
            )
            counts[row_out.status] = counts.get(row_out.status, 0) + 1
            rows_out.append(row_out)
        import_record.status = "processed"
        _apply_reconciliation_import_counts(import_record, counts)
        await db.commit()
    except Exception:
        await db.rollback()
        import_record = await db.get(PaymentReconciliationImport, int(import_record.id))
        if import_record is not None:
            import_record.status = "failed"
            _apply_reconciliation_import_counts(import_record, counts)
            await db.commit()
        raise
    await db.refresh(import_record)
    return PaymentReconciliationImportOut(
        id=int(import_record.id),
        provider=import_record.provider,
        payment_method=import_record.rail,
        source_name=import_record.source_name,
        status=import_record.status,
        row_count=int(import_record.row_count),
        matched_count=int(import_record.matched_count),
        mismatch_count=int(import_record.mismatch_count),
        unmatched_count=int(import_record.unmatched_count),
        duplicate_count=int(import_record.duplicate_count),
        error_count=int(import_record.error_count),
        rows=rows_out,
        created_at=import_record.created_at,
    )


async def approve_manual_payment_transaction(
    db: AsyncSession,
    *,
    transaction_id: int,
    actor: User,
    reason: str,
) -> ManualPaymentTransactionOut:
    transaction = await _load_manual_transaction_for_update(db, transaction_id=transaction_id)
    if transaction.status == PAYMENT_STATUS_PAID:
        return manual_payment_transaction_out(transaction)
    if transaction.status != PAYMENT_STATUS_PENDING_MANUAL_REVIEW:
        raise HTTPException(status_code=409, detail="Manual payment is not pending review")
    if int(actor.id) == int(transaction.user_id):
        raise HTTPException(status_code=403, detail="Staff cannot approve their own manual payment")

    now = datetime.now(timezone.utc)
    if _manual_transaction_is_expired(transaction, now=now):
        await _expire_manual_transaction(db, transaction=transaction, now=now)
        raise HTTPException(status_code=409, detail="Manual payment request is expired")

    transaction.status = PAYMENT_STATUS_PAID
    transaction.confirmed_at = now
    transaction.open_request_key = None
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "confirmed_by_user_id": int(actor.id),
        "confirmation_reason": reason,
    }
    user = await db.get(User, int(transaction.user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Payment user not found")
    user.is_pro = True
    entitlement_count = await grant_paid_subject_entitlements(
        db,
        user=user,
        source=f"{transaction.rail}:{transaction.reference_code}",
        starts_at=now,
    )
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=transaction.provider,
            event_id=f"manual-approval-{transaction.id}",
            event_type=MANUAL_PAYMENT_EVENT_APPROVED,
            status="processed",
            payload_json={"actor_user_id": int(actor.id), "reason": reason},
            processed_at=now,
        )
    )
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(transaction.user_id),
            entry_type="payment_confirmed",
            amount_centimes=int(transaction.amount_centimes),
            currency=transaction.currency,
            reason=reason,
            metadata_json={
                "actor_user_id": int(actor.id),
                "rail": transaction.rail,
                "entitlements_granted": entitlement_count,
            },
        )
    )
    await db.commit()
    await db.refresh(transaction)
    return manual_payment_transaction_out(transaction)


async def reject_manual_payment_transaction(
    db: AsyncSession,
    *,
    transaction_id: int,
    actor: User,
    reason: str,
) -> ManualPaymentTransactionOut:
    transaction = await _load_manual_transaction_for_update(db, transaction_id=transaction_id)
    if transaction.status == PAYMENT_STATUS_FAILED:
        return manual_payment_transaction_out(transaction)
    if transaction.status != PAYMENT_STATUS_PENDING_MANUAL_REVIEW:
        raise HTTPException(status_code=409, detail="Manual payment is not pending review")

    now = datetime.now(timezone.utc)
    transaction.status = PAYMENT_STATUS_FAILED
    transaction.open_request_key = None
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "rejected_by_user_id": int(actor.id),
        "rejection_reason": reason,
    }
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=transaction.provider,
            event_id=f"manual-rejection-{transaction.id}",
            event_type=MANUAL_PAYMENT_EVENT_REJECTED,
            status="processed",
            payload_json={"actor_user_id": int(actor.id), "reason": reason},
            processed_at=now,
        )
    )
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(transaction.user_id),
            entry_type="payment_rejected",
            amount_centimes=0,
            currency=transaction.currency,
            reason=reason,
            metadata_json={"actor_user_id": int(actor.id), "rail": transaction.rail},
        )
    )
    await db.commit()
    await db.refresh(transaction)
    return manual_payment_transaction_out(transaction)


def manual_payment_transaction_out(transaction: PaymentTransaction) -> ManualPaymentTransactionOut:
    return ManualPaymentTransactionOut(
        id=int(transaction.id),
        user_id=int(transaction.user_id),
        provider=transaction.provider,
        payment_method=transaction.rail,
        status=transaction.status,
        plan=transaction.plan,
        amount_centimes=int(transaction.amount_centimes),
        currency=transaction.currency,
        reference_code=transaction.reference_code,
        provider_reference=transaction.provider_reference,
        instructions=transaction.instructions_json or {},
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
        expires_at=transaction.expires_at,
        confirmed_at=transaction.confirmed_at,
        metadata=transaction.metadata_json or {},
    )


def finance_ledger_entry_out(entry: FinanceLedgerEntry) -> FinanceLedgerEntryOut:
    return FinanceLedgerEntryOut(
        id=int(entry.id),
        transaction_id=int(entry.transaction_id) if entry.transaction_id is not None else None,
        user_id=int(entry.user_id) if entry.user_id is not None else None,
        entry_type=entry.entry_type,
        amount_centimes=int(entry.amount_centimes),
        currency=entry.currency,
        reason=entry.reason,
        metadata=entry.metadata_json or {},
        created_at=entry.created_at,
    )


def payment_provider_event_out(event: PaymentProviderEvent) -> PaymentProviderEventOut:
    return PaymentProviderEventOut(
        id=int(event.id),
        transaction_id=int(event.transaction_id) if event.transaction_id is not None else None,
        provider=event.provider,
        event_id=event.event_id,
        event_type=event.event_type,
        status=event.status,
        payload=event.payload_json or {},
        received_at=event.received_at,
        processed_at=event.processed_at,
    )


def payment_reconciliation_import_summary_out(item: PaymentReconciliationImport) -> PaymentReconciliationImportSummaryOut:
    return PaymentReconciliationImportSummaryOut(
        id=int(item.id),
        provider=item.provider,
        payment_method=item.rail,
        source_name=item.source_name,
        status=item.status,
        row_count=int(item.row_count),
        matched_count=int(item.matched_count),
        mismatch_count=int(item.mismatch_count),
        unmatched_count=int(item.unmatched_count),
        duplicate_count=int(item.duplicate_count),
        error_count=int(item.error_count),
        created_by_user_id=int(item.created_by_user_id),
        created_at=item.created_at,
    )


def _bounded_finance_limit(limit: int, *, maximum: int = 200) -> int:
    return max(1, min(int(limit), maximum))


def _reference_code(payment_method: str, user_id: int) -> str:
    if payment_method == PAYMENT_RAIL_BANK_TRANSFER:
        prefix = "VIR"
    elif payment_method == PAYMENT_RAIL_CMI:
        prefix = "CMI"
    elif payment_method == PAYMENT_RAIL_ASHPLUS:
        prefix = "ASH"
    else:
        prefix = "CASH"
    token = secrets.token_urlsafe(6).replace("-", "").replace("_", "").upper()[:8]
    return f"KRESCO-{prefix}-{user_id}-{token}"


def _open_request_key(*, user_id: int, payment_method: str, plan: str) -> str:
    return f"manual:{user_id}:{payment_method}:{plan}"


def _open_cmi_request_key(*, user_id: int, plan: str) -> str:
    return f"cmi:{user_id}:{plan}"


async def _load_open_manual_request(
    db: AsyncSession,
    *,
    request_key: str,
    now: datetime,
) -> PaymentTransaction | None:
    return await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.open_request_key == request_key,
            PaymentTransaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
            PaymentTransaction.expires_at > now,
        )
        .order_by(PaymentTransaction.created_at.desc())
    )


async def _load_open_cmi_request(
    db: AsyncSession,
    *,
    request_key: str,
    now: datetime,
) -> PaymentTransaction | None:
    return await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.open_request_key == request_key,
            PaymentTransaction.status == PAYMENT_STATUS_PENDING_PROVIDER,
            PaymentTransaction.expires_at > now,
        )
        .order_by(PaymentTransaction.created_at.desc())
    )


async def _release_expired_open_manual_request(
    db: AsyncSession,
    *,
    request_key: str,
    now: datetime,
) -> None:
    transaction = await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.open_request_key == request_key,
            PaymentTransaction.status == PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
            PaymentTransaction.expires_at <= now,
        )
        .with_for_update()
    )
    if transaction is None:
        return
    await _expire_manual_transaction(db, transaction=transaction, now=now)


async def _release_expired_open_cmi_request(
    db: AsyncSession,
    *,
    request_key: str,
    now: datetime,
) -> None:
    transaction = await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.open_request_key == request_key,
            PaymentTransaction.status == PAYMENT_STATUS_PENDING_PROVIDER,
            PaymentTransaction.expires_at <= now,
        )
        .with_for_update()
    )
    if transaction is None:
        return
    await _expire_cmi_transaction(db, transaction=transaction, now=now)


async def _expire_manual_transaction(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    now: datetime,
) -> None:
    await _record_payment_expired_event(db, transaction=transaction, now=now, event_type=MANUAL_PAYMENT_EVENT_EXPIRED)
    transaction.status = PAYMENT_STATUS_EXPIRED
    transaction.open_request_key = None
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "expired_at": now.isoformat(),
    }
    await _commit_expired_transaction(db, transaction=transaction)


async def _expire_cmi_transaction(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    now: datetime,
) -> None:
    await _record_payment_expired_event(db, transaction=transaction, now=now, event_type=CMI_PAYMENT_EVENT_EXPIRED)
    transaction.status = PAYMENT_STATUS_EXPIRED
    transaction.open_request_key = None
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "expired_at": now.isoformat(),
    }
    await _commit_expired_transaction(db, transaction=transaction)


async def _commit_expired_transaction(db: AsyncSession, *, transaction: PaymentTransaction) -> None:
    transaction_id = int(transaction.id)
    provider = transaction.provider
    event_id = _payment_expired_event_id(transaction)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing_event = await _load_provider_event(db, provider=provider, event_id=event_id)
        if existing_event is None:
            raise
        current = await db.get(PaymentTransaction, transaction_id)
        if current is None:
            return
        current.status = PAYMENT_STATUS_EXPIRED
        current.open_request_key = None
        metadata = dict(current.metadata_json or {})
        metadata.setdefault("expired_at", existing_event.processed_at.isoformat() if existing_event.processed_at else "")
        current.metadata_json = metadata
        await db.commit()


async def _record_payment_expired_event(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    now: datetime,
    event_type: str,
) -> None:
    event_id = _payment_expired_event_id(transaction)
    existing_event = await _load_provider_event(db, provider=transaction.provider, event_id=event_id)
    if existing_event is not None:
        return
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=transaction.provider,
            event_id=event_id,
            event_type=event_type,
            status="processed",
            payload_json={
                "reference_code": transaction.reference_code,
                "rail": transaction.rail,
                "previous_status": transaction.status,
                "expired_at": now.isoformat(),
            },
            processed_at=now,
        )
    )


def _payment_expired_event_id(transaction: PaymentTransaction) -> str:
    return f"{transaction.provider}:payment_expired:{int(transaction.id)}"


def _manual_transaction_is_expired(transaction: PaymentTransaction, *, now: datetime) -> bool:
    expires_at = transaction.expires_at
    if expires_at is None:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= now


async def _load_manual_transaction_for_update(
    db: AsyncSession,
    *,
    transaction_id: int,
) -> PaymentTransaction:
    transaction = await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.id == transaction_id,
            PaymentTransaction.rail.in_(sorted(MANUAL_PAYMENT_RAILS)),
        )
        .with_for_update()
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Manual payment transaction not found")
    return transaction


async def _load_user_manual_transaction_for_update(
    db: AsyncSession,
    *,
    transaction_id: int,
    user_id: int,
) -> PaymentTransaction:
    transaction = await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.id == transaction_id,
            PaymentTransaction.user_id == user_id,
            PaymentTransaction.rail.in_(sorted(MANUAL_PAYMENT_RAILS)),
        )
        .with_for_update()
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Manual payment transaction not found")
    return transaction


async def _load_manual_transaction_by_reference_for_update(
    db: AsyncSession,
    *,
    payment_method: str,
    reference_code: str,
) -> PaymentTransaction | None:
    return await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.rail == payment_method,
            PaymentTransaction.reference_code == reference_code,
        )
        .with_for_update()
    )


def _manual_payment_instructions(
    *,
    payment_method: str,
    reference_code: str,
    amount_centimes: int,
    currency: str,
    expires_at: datetime,
) -> dict[str, object]:
    common = {
        "reference_code": reference_code,
        "amount_centimes": amount_centimes,
        "currency": currency,
        "expires_at": expires_at.isoformat(),
        "unlock_policy": "Access is unlocked only after finance confirmation or matched reconciliation.",
    }
    if payment_method == PAYMENT_RAIL_BANK_TRANSFER:
        return {
            **common,
            "title": "Virement bancaire",
            "steps": [
                "Use the reference code in the bank transfer description.",
                "Upload or send proof of transfer if requested by support.",
                "Wait for finance confirmation before access is unlocked.",
            ],
        }
    if payment_method == PAYMENT_RAIL_ASHPLUS:
        return {
            **common,
            "title": "AshPlus",
            "steps": [
                "Use the reference code when paying through AshPlus.",
                "Keep the receipt until the payment is confirmed.",
                "Wait for finance confirmation before access is unlocked.",
            ],
        }
    return {
        **common,
        "title": "CashPlus",
        "steps": [
            "Use the reference code when paying through CashPlus.",
            "Keep the receipt until the payment is confirmed.",
            "Wait for finance confirmation before access is unlocked.",
        ],
    }


def _manual_proof_payload(proof: ManualPaymentProofIn) -> dict[str, str | None]:
    return {
        "proof_kind": proof.proof_kind or "receipt",
        "provider_reference": proof.provider_reference,
        "proof_url": proof.proof_url,
        "payer_name": proof.payer_name,
        "paid_at": proof.paid_at.isoformat() if proof.paid_at is not None else None,
        "notes": proof.notes,
    }


def _manual_proof_digest(proof_payload: dict[str, str | None]) -> str:
    canonical = "|".join(
        f"{key}={proof_payload.get(key) or ''}"
        for key in ("proof_kind", "provider_reference", "proof_url", "payer_name", "paid_at", "notes")
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _manual_proof_event_id(*, transaction_id: int, proof_digest: str) -> str:
    return f"manual-proof:{transaction_id}:{proof_digest}"


def _manual_reconciliation_event_id(*, provider_reference: str, reference_code: str) -> str:
    del reference_code
    canonical = provider_reference.strip()
    return f"manual-reconciliation:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"


def _manual_reconciliation_matches_transaction(
    transaction: PaymentTransaction,
    reconciliation: ManualPaymentReconciliationIn,
) -> bool:
    return (
        transaction.reference_code == reconciliation.reference_code
        and transaction.rail == reconciliation.payment_method
        and int(transaction.amount_centimes) == int(reconciliation.amount_centimes)
    )


def _apply_reconciliation_import_counts(
    import_record: PaymentReconciliationImport,
    counts: dict[str, int],
) -> None:
    import_record.matched_count = counts["matched"]
    import_record.mismatch_count = counts["mismatch"]
    import_record.unmatched_count = counts["unmatched"]
    import_record.duplicate_count = counts["duplicate"]
    import_record.error_count = counts["error"]


async def _process_reconciliation_import_row(
    db: AsyncSession,
    *,
    actor: User,
    import_id: int,
    provider: str,
    payment_method: str,
    row_number: int,
    row: PaymentReconciliationImportRowIn,
) -> PaymentReconciliationImportRowOut:
    reconciliation = ManualPaymentReconciliationIn(
        payment_method=payment_method,
        reference_code=row.reference_code,
        amount_centimes=row.amount_centimes,
        provider_reference=row.provider_reference,
        reason=row.reason,
        collected_at=row.collected_at,
    )
    event_id = _manual_reconciliation_event_id(
        provider_reference=row.provider_reference,
        reference_code=row.reference_code,
    )
    row_record = await _create_reconciliation_import_row_placeholder(
        db,
        import_id=import_id,
        provider=provider,
        payment_method=payment_method,
        row_number=row_number,
        row=row,
    )
    existing_event = await _load_provider_event(db, provider=provider, event_id=event_id)
    if existing_event is not None:
        matched_transaction_id = int(existing_event.transaction_id) if existing_event.transaction_id is not None else None
        failure_reason = "Provider reference was already imported"
        if matched_transaction_id is not None:
            existing_transaction = await db.get(PaymentTransaction, matched_transaction_id)
            if existing_transaction is not None and not _manual_reconciliation_matches_transaction(
                existing_transaction,
                reconciliation,
            ):
                failure_reason = "Provider reference is already reconciled to another manual payment"
        return await _finalize_reconciliation_import_row(
            db,
            row_record=row_record,
            row=row,
            status="duplicate",
            matched_transaction_id=matched_transaction_id,
            failure_reason=failure_reason,
        )

    try:
        result = await reconcile_manual_payment_transaction(db, actor=actor, reconciliation=reconciliation)
    except HTTPException as exc:
        if exc.status_code == 404:
            status = "unmatched"
        elif exc.status_code == 409:
            status = "duplicate"
        else:
            status = "error"
        return await _finalize_reconciliation_import_row(
            db,
            row_record=row_record,
            row=row,
            status=status,
            matched_transaction_id=None,
            failure_reason=_truncate_reason(str(exc.detail)),
        )
    except Exception as exc:
        await db.rollback()
        return await _finalize_reconciliation_import_row(
            db,
            row_record=row_record,
            row=row,
            status="error",
            matched_transaction_id=None,
            failure_reason=_truncate_reason(str(exc)),
        )

    status = "matched" if result.status == PAYMENT_STATUS_PAID else "mismatch"
    failure_reason = None if status == "matched" else "Reconciliation row did not match the pending payment amount"
    return await _finalize_reconciliation_import_row(
        db,
        row_record=row_record,
        row=row,
        status=status,
        matched_transaction_id=result.id,
        failure_reason=failure_reason,
    )


async def _create_reconciliation_import_row_placeholder(
    db: AsyncSession,
    *,
    import_id: int,
    provider: str,
    payment_method: str,
    row_number: int,
    row: PaymentReconciliationImportRowIn,
) -> PaymentReconciliationRow:
    row_record = PaymentReconciliationRow(
        import_id=import_id,
        row_number=row_number,
        provider=provider,
        rail=payment_method,
        status="error",
        reference_code=row.reference_code,
        amount_centimes=int(row.amount_centimes),
        currency="MAD",
        provider_reference=row.provider_reference,
        row_digest=_manual_reconciliation_row_digest(provider=provider, row=row),
        matched_transaction_id=None,
        failure_reason="Processing interrupted before final outcome",
        raw_row_json=row.raw_row or {},
    )
    db.add(row_record)
    await db.commit()
    await db.refresh(row_record)
    return row_record


async def _finalize_reconciliation_import_row(
    db: AsyncSession,
    *,
    row_record: PaymentReconciliationRow,
    row: PaymentReconciliationImportRowIn,
    status: str,
    matched_transaction_id: int | None,
    failure_reason: str | None,
) -> PaymentReconciliationImportRowOut:
    row_record.status = status
    row_record.matched_transaction_id = matched_transaction_id
    row_record.failure_reason = _truncate_reason(failure_reason) if failure_reason else None
    db.add(row_record)
    await db.commit()
    return PaymentReconciliationImportRowOut(
        row_number=int(row_record.row_number),
        status=status,
        reference_code=row.reference_code,
        amount_centimes=int(row.amount_centimes),
        provider_reference=row.provider_reference,
        matched_transaction_id=matched_transaction_id,
        failure_reason=_truncate_reason(failure_reason) if failure_reason else None,
    )


def _manual_reconciliation_row_digest(*, provider: str, row: PaymentReconciliationImportRowIn) -> str:
    canonical = "|".join(
        [
            provider,
            row.reference_code,
            str(int(row.amount_centimes)),
            row.provider_reference,
            row.collected_at.isoformat() if row.collected_at is not None else "",
        ]
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _truncate_reason(value: str) -> str:
    return value[:255]


def _manual_reconciliation_payload(
    reconciliation: ManualPaymentReconciliationIn,
    *,
    actor: User,
) -> dict[str, object]:
    return {
        "actor_user_id": int(actor.id),
        "payment_method": reconciliation.payment_method,
        "reference_code": reconciliation.reference_code,
        "amount_centimes": int(reconciliation.amount_centimes),
        "provider_reference": reconciliation.provider_reference,
        "reason": reconciliation.reason,
        "collected_at": reconciliation.collected_at.isoformat() if reconciliation.collected_at is not None else None,
    }


async def _mark_manual_transaction_reconciled(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    actor: User,
    reconciliation: ManualPaymentReconciliationIn,
    event_id: str,
    now: datetime,
) -> None:
    transaction.status = PAYMENT_STATUS_PAID
    transaction.confirmed_at = now
    transaction.open_request_key = None
    transaction.provider_reference = reconciliation.provider_reference
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "reconciled_by_user_id": int(actor.id),
        "reconciliation_reason": reconciliation.reason,
        "reconciled_at": now.isoformat(),
        "collected_at": reconciliation.collected_at.isoformat() if reconciliation.collected_at is not None else None,
    }
    user = await db.get(User, int(transaction.user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Payment user not found")
    user.is_pro = True
    entitlement_count = await grant_paid_subject_entitlements(
        db,
        user=user,
        source=f"{transaction.rail}:{transaction.reference_code}",
        starts_at=now,
    )
    payload = _manual_reconciliation_payload(reconciliation, actor=actor)
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=transaction.provider,
            event_id=event_id,
            event_type=MANUAL_PAYMENT_EVENT_RECONCILED,
            status="processed",
            payload_json=payload,
            processed_at=now,
        )
    )
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(transaction.user_id),
            entry_type="payment_confirmed",
            amount_centimes=int(transaction.amount_centimes),
            currency=transaction.currency,
            reason=reconciliation.reason,
            metadata_json={
                "actor_user_id": int(actor.id),
                "rail": transaction.rail,
                "provider_reference": reconciliation.provider_reference,
                "entitlements_granted": entitlement_count,
            },
        )
    )
    await db.commit()
    await db.refresh(transaction)


async def _mark_manual_transaction_mismatch(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    actor: User,
    reconciliation: ManualPaymentReconciliationIn,
    event_id: str,
    now: datetime,
) -> None:
    transaction.status = PAYMENT_STATUS_MISMATCH
    transaction.open_request_key = None
    transaction.provider_reference = reconciliation.provider_reference
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "mismatch_by_user_id": int(actor.id),
        "mismatch_reason": "Reconciled amount did not match the pending transaction",
        "expected_amount_centimes": int(transaction.amount_centimes),
        "received_amount_centimes": int(reconciliation.amount_centimes),
        "reconciled_at": now.isoformat(),
    }
    payload = _manual_reconciliation_payload(reconciliation, actor=actor)
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=transaction.provider,
            event_id=event_id,
            event_type=MANUAL_PAYMENT_EVENT_RECONCILIATION_MISMATCH,
            status="failed",
            payload_json=payload,
            processed_at=now,
        )
    )
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(transaction.user_id),
            entry_type="payment_mismatch",
            amount_centimes=0,
            currency=transaction.currency,
            reason="Manual reconciliation amount mismatch",
            metadata_json={
                "actor_user_id": int(actor.id),
                "rail": transaction.rail,
                "provider_reference": reconciliation.provider_reference,
                "received_amount_centimes": int(reconciliation.amount_centimes),
            },
        )
    )
    await db.commit()
    await db.refresh(transaction)


async def _record_manual_reconciliation_duplicate_event(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    actor: User,
    reconciliation: ManualPaymentReconciliationIn,
    event_id: str,
    now: datetime,
    reason: str,
) -> None:
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=transaction.provider,
            event_id=event_id,
            event_type=MANUAL_PAYMENT_EVENT_RECONCILIATION_DUPLICATE,
            status="ignored",
            payload_json={
                **_manual_reconciliation_payload(reconciliation, actor=actor),
                "failure_reason": reason,
                "transaction_status": transaction.status,
            },
            processed_at=now,
        )
    )
    await db.commit()


def _ensure_cmi_configured(settings: Settings) -> None:
    required = {
        "CMI_CLIENT_ID": settings.cmi_client_id,
        "CMI_STORE_KEY": settings.cmi_store_key,
        "CMI_PAYMENT_URL": settings.cmi_payment_url,
        "CMI_OK_URL": settings.cmi_ok_url,
        "CMI_FAIL_URL": settings.cmi_fail_url,
        "CMI_CALLBACK_URL": settings.cmi_callback_url,
    }
    missing = [name for name, value in required.items() if not value.strip()]
    if missing:
        raise HTTPException(status_code=503, detail="CMI payments are not configured yet")
    _validate_cmi_url(settings.cmi_payment_url, name="CMI_PAYMENT_URL", require_cmi_host=True)
    _validate_cmi_url(settings.cmi_ok_url, name="CMI_OK_URL")
    _validate_cmi_url(settings.cmi_fail_url, name="CMI_FAIL_URL")
    _validate_cmi_url(settings.cmi_callback_url, name="CMI_CALLBACK_URL")


def _cmi_form_fields(
    *,
    settings: Settings,
    user: User,
    reference_code: str,
    amount_centimes: int,
) -> dict[str, str]:
    amount = f"{amount_centimes / 100:.2f}"
    fields = {
        "amount": amount,
        "BillToName": user.full_name or user.email,
        "callbackUrl": settings.cmi_callback_url.strip(),
        "CallbackResponse": CMI_CALLBACK_RESPONSE,
        "clientid": settings.cmi_client_id.strip(),
        "currency": CMI_CURRENCY_CODE_MAD,
        "email": user.email,
        "encoding": "UTF-8",
        "failUrl": settings.cmi_fail_url.strip(),
        "hashAlgorithm": CMI_HASH_ALGORITHM,
        "lang": "fr",
        "oid": reference_code,
        "okUrl": settings.cmi_ok_url.strip(),
        "rnd": secrets.token_urlsafe(16),
        "shopurl": urljoin(settings.frontend_url.rstrip("/") + "/", "pricing"),
        "storetype": CMI_STORE_TYPE,
        "TranType": CMI_TRAN_TYPE,
    }
    fields["hash"] = _cmi_hash(fields, store_key=settings.cmi_store_key)
    return fields


def _cmi_hash(fields: dict[str, str], *, store_key: str) -> str:
    escaped_values = []
    for key in sorted(fields, key=str.lower):
        lowered = key.lower()
        if lowered in {"hash", "encoding"}:
            continue
        escaped_values.append(_cmi_escape(fields[key]))
    escaped_values.append(_cmi_escape(store_key.strip()))
    digest = hashlib.sha512("|".join(escaped_values).encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def _cmi_escape(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("|", "\\|")


def _validate_cmi_url(value: str, *, name: str, require_cmi_host: bool = False) -> None:
    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname:
        raise HTTPException(status_code=503, detail=f"{name} must be an HTTPS URL")
    if _is_local_or_private_host(hostname):
        raise HTTPException(status_code=503, detail=f"{name} must be publicly reachable")
    if require_cmi_host and not (hostname == "cmi.co.ma" or hostname.endswith(".cmi.co.ma")):
        raise HTTPException(status_code=503, detail="CMI_PAYMENT_URL must use a CMI gateway host")


def _is_local_or_private_host(hostname: str) -> bool:
    if hostname == "localhost" or hostname.endswith(".localhost") or "." not in hostname:
        return True
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return False
    return address.is_private or address.is_loopback or address.is_link_local or address.is_reserved


def _cmi_payment_instructions(
    *,
    settings: Settings,
    reference_code: str,
    amount_centimes: int,
    expires_at: datetime,
    form_fields: dict[str, str],
) -> dict[str, object]:
    return {
        "title": "CMI card payment",
        "action": "form_post",
        "action_url": settings.cmi_payment_url.strip(),
        "form_method": "POST",
        "form_fields": form_fields,
        "reference_code": reference_code,
        "amount_centimes": amount_centimes,
        "currency": "MAD",
        "expires_at": expires_at.isoformat(),
        "unlock_policy": "Access is unlocked only after CMI confirms the payment through a signed callback.",
    }


async def _load_cmi_transaction_for_update(
    db: AsyncSession,
    *,
    reference_code: str,
) -> PaymentTransaction | None:
    if not reference_code:
        return None
    return await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.provider == PAYMENT_PROVIDER_CMI,
            PaymentTransaction.rail == PAYMENT_RAIL_CMI,
            PaymentTransaction.reference_code == reference_code,
        )
        .with_for_update()
    )


async def _load_provider_event(
    db: AsyncSession,
    *,
    provider: str,
    event_id: str,
) -> PaymentProviderEvent | None:
    return await db.scalar(
        select(PaymentProviderEvent).where(
            PaymentProviderEvent.provider == provider,
            PaymentProviderEvent.event_id == event_id,
        )
    )


async def _mark_cmi_transaction_paid(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    event_id: str,
    payload: dict[str, str],
    now: datetime,
) -> None:
    transaction.status = PAYMENT_STATUS_PAID
    transaction.confirmed_at = now
    transaction.open_request_key = None
    transaction.provider_reference = _cmi_provider_reference(payload)
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "confirmed_by_provider": PAYMENT_PROVIDER_CMI,
        "confirmed_at": now.isoformat(),
    }
    user = await db.get(User, int(transaction.user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Payment user not found")
    user.is_pro = True
    entitlement_count = await grant_paid_subject_entitlements(
        db,
        user=user,
        source=f"{PAYMENT_RAIL_CMI}:{transaction.reference_code}",
        starts_at=now,
    )
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=PAYMENT_PROVIDER_CMI,
            event_id=event_id,
            event_type=CMI_CALLBACK_EVENT_APPROVED,
            status="processed",
            payload_json=_redacted_cmi_payload(payload),
            processed_at=now,
        )
    )
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(transaction.user_id),
            entry_type="payment_confirmed",
            amount_centimes=int(transaction.amount_centimes),
            currency=transaction.currency,
            reason="CMI callback verified",
            metadata_json={
                "rail": PAYMENT_RAIL_CMI,
                "provider_reference": transaction.provider_reference,
                "entitlements_granted": entitlement_count,
            },
        )
    )
    await db.commit()


async def _mark_cmi_transaction_failed(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    event_id: str,
    payload: dict[str, str],
    now: datetime,
) -> None:
    transaction.status = PAYMENT_STATUS_FAILED
    transaction.open_request_key = None
    transaction.provider_reference = _cmi_provider_reference(payload)
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "failed_by_provider": PAYMENT_PROVIDER_CMI,
        "failed_at": now.isoformat(),
        "failure_reason": _payload_value(payload, "ErrMsg", "mdErrorMsg", "Response") or "CMI callback failed",
    }
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=PAYMENT_PROVIDER_CMI,
            event_id=event_id,
            event_type=CMI_CALLBACK_EVENT_FAILED,
            status="processed",
            payload_json=_redacted_cmi_payload(payload),
            processed_at=now,
        )
    )
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(transaction.user_id),
            entry_type="payment_failed",
            amount_centimes=0,
            currency=transaction.currency,
            reason="CMI callback failed",
            metadata_json={"rail": PAYMENT_RAIL_CMI, "provider_reference": transaction.provider_reference},
        )
    )
    await db.commit()


async def _mark_cmi_transaction_mismatch(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    event_id: str,
    payload: dict[str, str],
    now: datetime,
    reason: str = "CMI callback did not match the pending transaction",
) -> None:
    transaction.status = PAYMENT_STATUS_MISMATCH
    transaction.open_request_key = None
    transaction.provider_reference = _cmi_provider_reference(payload)
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "mismatch_by_provider": PAYMENT_PROVIDER_CMI,
        "mismatch_at": now.isoformat(),
        "mismatch_reason": reason,
    }
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=PAYMENT_PROVIDER_CMI,
            event_id=event_id,
            event_type=CMI_CALLBACK_EVENT_FAILED,
            status="failed",
            payload_json=_redacted_cmi_payload(payload),
            processed_at=now,
        )
    )
    db.add(
        FinanceLedgerEntry(
            transaction_id=int(transaction.id),
            user_id=int(transaction.user_id),
            entry_type="payment_mismatch",
            amount_centimes=0,
            currency=transaction.currency,
            reason=reason,
            metadata_json={"rail": PAYMENT_RAIL_CMI, "provider_reference": transaction.provider_reference},
        )
    )
    await db.commit()


async def _record_cmi_ignored_event(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    event_id: str,
    payload: dict[str, str],
    now: datetime,
    event_type: str,
) -> None:
    existing_event = await _load_provider_event(db, provider=PAYMENT_PROVIDER_CMI, event_id=event_id)
    if existing_event is not None:
        return
    db.add(
        PaymentProviderEvent(
            transaction_id=int(transaction.id),
            provider=PAYMENT_PROVIDER_CMI,
            event_id=event_id,
            event_type=event_type,
            status="ignored",
            payload_json=_redacted_cmi_payload(payload),
            processed_at=now,
        )
    )
    await _commit_provider_event_or_ignore_duplicate(db, provider=PAYMENT_PROVIDER_CMI, event_id=event_id)


async def _commit_provider_event_or_ignore_duplicate(
    db: AsyncSession,
    *,
    provider: str,
    event_id: str,
) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing_event = await _load_provider_event(db, provider=provider, event_id=event_id)
        if existing_event is not None:
            return
        raise


def _cmi_callback_hash_valid(payload: dict[str, str], *, store_key: str) -> bool:
    actual_hash = _payload_value(payload, "HASH", "hash")
    if not actual_hash:
        return False
    candidates = {
        _cmi_callback_hash_sorted(payload, store_key=store_key),
        _cmi_hash_from_hashparams(payload, store_key=store_key),
    }
    return any(candidate and hmac.compare_digest(actual_hash, candidate) for candidate in candidates)


def _cmi_hash_from_hashparams(payload: dict[str, str], *, store_key: str) -> str:
    hashparams = _payload_value(payload, "HASHPARAMS")
    if not hashparams:
        return ""
    signed_fields = {field.lower() for field in hashparams.split(":") if field}
    required_fields = {"clientid", "oid", "amount", "currency", "procreturncode", "response", "mdstatus"}
    if not required_fields.issubset(signed_fields):
        return ""
    values = [
        _cmi_escape(_normalized_callback_value(_payload_value(payload, name)))
        for name in hashparams.split(":")
        if name
    ]
    values.append(_cmi_escape(store_key.strip()))
    digest = hashlib.sha512("|".join(values).encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def _cmi_callback_hash_sorted(payload: dict[str, str], *, store_key: str) -> str:
    escaped_values = []
    for key in sorted(payload, key=str.lower):
        lowered = key.lower()
        if lowered in {"hash", "encoding"}:
            continue
        escaped_values.append(_cmi_escape(_normalized_callback_value(payload[key])))
    escaped_values.append(_cmi_escape(store_key.strip()))
    digest = hashlib.sha512("|".join(escaped_values).encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def _cmi_callback_matches_transaction(
    payload: dict[str, str],
    transaction: PaymentTransaction,
    *,
    settings: Settings,
) -> bool:
    client_id = _payload_value(payload, "clientid")
    if client_id != settings.cmi_client_id.strip():
        return False
    callback_amount = _amount_centimes_from_mad(_payload_value(payload, "amount"))
    if callback_amount is None or callback_amount != int(transaction.amount_centimes):
        return False
    currency = _payload_value(payload, "currency")
    if currency not in {CMI_CURRENCY_CODE_MAD, "MAD"}:
        return False
    return True


def _cmi_callback_is_success(payload: dict[str, str]) -> bool:
    proc_return_code = _payload_value(payload, "ProcReturnCode")
    response = _payload_value(payload, "Response")
    md_status = _payload_value(payload, "mdStatus")
    if proc_return_code != "00":
        return False
    if response.lower() != "approved":
        return False
    if md_status not in {"1", "2", "3", "4"}:
        return False
    return True


def _cmi_callback_event_id(payload: dict[str, str]) -> str:
    provider_reference = _payload_value(payload, "TransId", "transid", "HostRefNum")
    if provider_reference:
        return provider_reference
    fallback = "|".join(
        [
            _payload_value(payload, "oid", "ReturnOid", "OrderId"),
            _payload_value(payload, "ProcReturnCode"),
            _payload_value(payload, "Response"),
            _payload_value(payload, "AuthCode"),
            _payload_value(payload, "rnd"),
        ]
    )
    return f"cmi:{hashlib.sha256(fallback.encode('utf-8')).hexdigest()}"


def _cmi_invalid_callback_event_id(payload: dict[str, str]) -> str:
    canonical = "|".join(f"{key}={payload[key]}" for key in sorted(payload, key=str.lower))
    return f"cmi-invalid:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"


def _cmi_provider_reference(payload: dict[str, str]) -> str:
    return _payload_value(payload, "TransId", "transid", "HostRefNum", "AuthCode", "xid")


def _payload_value(payload: dict[str, str], *names: str) -> str:
    requested = {name.lower() for name in names if name}
    for key, value in payload.items():
        if key.lower() in requested:
            return _normalized_callback_value(value)
    return ""


def _normalized_callback_value(value: object) -> str:
    return re.sub(
        r"document(.)",
        "document.",
        html.unescape(str(value or "").removesuffix("\n").strip()),
        flags=re.IGNORECASE,
    )


def _amount_centimes_from_mad(value: str) -> int | None:
    try:
        amount = Decimal(value.replace(",", "."))
    except (InvalidOperation, AttributeError):
        return None
    return int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _redacted_cmi_payload(payload: dict[str, str]) -> dict[str, str]:
    sensitive = {"cvv", "cvc", "storekey", "store_key", "cardnumber", "pan"}
    redacted = {}
    for key, value in payload.items():
        lowered = key.lower()
        redacted[key] = "[redacted]" if any(token in lowered for token in sensitive) else value
    return redacted
