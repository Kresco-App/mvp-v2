from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payments import (
    FinanceLedgerEntry,
    PAYMENT_PROVIDER_BANK_TRANSFER,
    PAYMENT_PROVIDER_CASHPLUS,
    PAYMENT_RAIL_BANK_TRANSFER,
    PAYMENT_RAIL_CASHPLUS,
    PAYMENT_RAIL_CMI,
    PAYMENT_STATUS_EXPIRED,
    PAYMENT_STATUS_FAILED,
    PAYMENT_STATUS_PAID,
    PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
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
        raise HTTPException(status_code=503, detail="CMI payments are not configured yet")
    raise HTTPException(status_code=400, detail="Unsupported payment method")


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
    prefix = "VIR" if payment_method == PAYMENT_RAIL_BANK_TRANSFER else "CASH"
    token = secrets.token_urlsafe(6).replace("-", "").replace("_", "").upper()[:8]
    return f"KRESCO-{prefix}-{user_id}-{token}"


def _open_request_key(*, user_id: int, payment_method: str, plan: str) -> str:
    return f"manual:{user_id}:{payment_method}:{plan}"


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
