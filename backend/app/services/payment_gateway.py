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
from urllib.parse import urlparse
from urllib.parse import urljoin

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.payments import (
    FinanceLedgerEntry,
    PAYMENT_PROVIDER_BANK_TRANSFER,
    PAYMENT_PROVIDER_CASHPLUS,
    PAYMENT_PROVIDER_CMI,
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
    PaymentTransaction,
)
from app.models.users import User
from app.schemas.payments import ManualPaymentTransactionOut, PaymentRequestOut

PAYMENT_PLAN_PRICES_CENTIMES = {
    "pro": 9900,
}
MANUAL_PAYMENT_RAILS = {PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS}
MANUAL_PAYMENT_EXPIRY_DAYS = 7
MANUAL_PAYMENT_EVENT_APPROVED = "manual.approved"
MANUAL_PAYMENT_EVENT_REJECTED = "manual.rejected"
CMI_PAYMENT_EXPIRY_MINUTES = 30
CMI_CURRENCY_CODE_MAD = "504"
CMI_TRAN_TYPE = "PreAuth"
CMI_STORE_TYPE = "3D_PAY_HOSTING"
CMI_HASH_ALGORITHM = "ver3"
CMI_CALLBACK_RESPONSE = "true"
CMI_CALLBACK_EVENT_APPROVED = "cmi.callback.approved"
CMI_CALLBACK_EVENT_FAILED = "cmi.callback.failed"
CMI_CALLBACK_EVENT_INVALID = "cmi.callback.invalid"
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


async def create_pending_cmi_payment_request(
    db: AsyncSession,
    *,
    user: User,
    plan: str,
    settings: Settings,
) -> PaymentRequestOut:
    _ensure_cmi_configured(settings)
    normalized_plan = plan.strip().lower()
    amount_centimes = amount_for_plan(normalized_plan)
    now = datetime.now(timezone.utc)
    request_key = _open_cmi_request_key(user_id=int(user.id), plan=normalized_plan)
    existing = await _load_open_cmi_request(db, request_key=request_key, now=now)
    if existing is not None:
        return payment_request_out(existing)
    await _release_expired_open_cmi_request(db, request_key=request_key, now=now)

    expires_at = now + timedelta(minutes=CMI_PAYMENT_EXPIRY_MINUTES)
    reference_code = _reference_code(PAYMENT_RAIL_CMI, int(user.id))
    form_fields = _cmi_form_fields(
        settings=settings,
        user=user,
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
        user_id=int(user.id),
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
        await db.commit()
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
        await db.commit()
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
    normalized_method = payment_method.strip().lower()
    if normalized_method not in MANUAL_PAYMENT_RAILS:
        provider_for_rail(normalized_method)
        raise HTTPException(status_code=400, detail="Payment method does not support manual instructions")

    normalized_plan = plan.strip().lower()
    amount_centimes = amount_for_plan(normalized_plan)
    now = datetime.now(timezone.utc)
    request_key = _open_request_key(user_id=int(user.id), payment_method=normalized_method, plan=normalized_plan)
    existing = await _load_open_manual_request(db, request_key=request_key, now=now)
    if existing is not None:
        return payment_request_out(existing)
    await _release_expired_open_manual_request(db, request_key=request_key, now=now)

    expires_at = now + timedelta(days=MANUAL_PAYMENT_EXPIRY_DAYS)
    reference_code = _reference_code(normalized_method, int(user.id))
    instructions = _manual_payment_instructions(
        payment_method=normalized_method,
        reference_code=reference_code,
        amount_centimes=amount_centimes,
        currency="MAD",
        expires_at=expires_at,
    )

    transaction = PaymentTransaction(
        user_id=int(user.id),
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
            metadata_json={"actor_user_id": int(actor.id), "rail": transaction.rail},
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
    )


def _reference_code(payment_method: str, user_id: int) -> str:
    if payment_method == PAYMENT_RAIL_BANK_TRANSFER:
        prefix = "VIR"
    elif payment_method == PAYMENT_RAIL_CMI:
        prefix = "CMI"
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
    transaction.status = PAYMENT_STATUS_EXPIRED
    transaction.open_request_key = None
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "expired_at": now.isoformat(),
    }
    await db.commit()


async def _expire_manual_transaction(
    db: AsyncSession,
    *,
    transaction: PaymentTransaction,
    now: datetime,
) -> None:
    transaction.status = PAYMENT_STATUS_EXPIRED
    transaction.open_request_key = None
    transaction.metadata_json = {
        **(transaction.metadata_json or {}),
        "expired_at": now.isoformat(),
    }
    await db.commit()


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
    return {
        **common,
        "title": "CashPlus",
        "steps": [
            "Use the reference code when paying through CashPlus.",
            "Keep the receipt until the payment is confirmed.",
            "Wait for finance confirmation before access is unlocked.",
        ],
    }


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
            metadata_json={"rail": PAYMENT_RAIL_CMI, "provider_reference": transaction.provider_reference},
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
    await db.commit()


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
