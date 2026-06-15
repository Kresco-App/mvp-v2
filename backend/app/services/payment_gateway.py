from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payments import (
    PAYMENT_PROVIDER_BANK_TRANSFER,
    PAYMENT_PROVIDER_CASHPLUS,
    PAYMENT_RAIL_BANK_TRANSFER,
    PAYMENT_RAIL_CASHPLUS,
    PAYMENT_RAIL_CMI,
    PAYMENT_STATUS_PENDING_MANUAL_REVIEW,
    PaymentTransaction,
)
from app.models.users import User
from app.schemas.payments import PaymentRequestOut

PAYMENT_PLAN_PRICES_CENTIMES = {
    "pro": 9900,
}
MANUAL_PAYMENT_RAILS = {PAYMENT_RAIL_BANK_TRANSFER, PAYMENT_RAIL_CASHPLUS}
MANUAL_PAYMENT_EXPIRY_DAYS = 7


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
