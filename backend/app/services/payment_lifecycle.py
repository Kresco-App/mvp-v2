import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

import stripe
from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.payments import PaymentVerificationAttempt, StripeWebhookEvent
from app.models.users import User
from app.schemas.payments import CheckoutOut, VerifyOut
from app.services.payment_entitlements import (
    apply_paid_checkout_by_user_id,
    apply_paid_checkout_to_user,
    persist_created_stripe_customer,
    revoke_paid_access_by_customer_id,
    stripe_metadata_user_id,
)
from app.services.stripe_service import CheckoutSessionCreation, CheckoutSessionVerification
from app.services.stripe_service import VERIFY_CHECKOUT_UNAVAILABLE_DETAIL

logger = logging.getLogger("kresco.payments")
DISPUTE_CUSTOMER_LOOKUP_UNAVAILABLE_DETAIL = "Stripe dispute customer lookup is temporarily unavailable"
PAYMENT_VERIFICATION_PENDING_STATUS = "pending"
PAYMENT_VERIFICATION_COMPLETED_STATUS = "completed"
PAYMENT_VERIFICATION_FAILED_STATUS = "failed"
PAYMENT_VERIFICATION_PENDING_TIMEOUT_SECONDS = 20.0
PAYMENT_VERIFICATION_PENDING_POLL_SECONDS = 0.05


CreateCheckoutSession = Callable[..., Awaitable[CheckoutSessionCreation]]
VerifyCheckoutSession = Callable[[str, Settings], Awaitable[CheckoutSessionVerification]]
CustomerIdForCharge = Callable[[str, Settings], Awaitable[str]]
ConstructStripeEvent = Callable[[bytes, str, str], object]
RecordWebhookEventOnce = Callable[[AsyncSession, str, str], Awaitable[bool]]


def event_value(data, key: str, default: str = "") -> str:
    value = data.get(key, default) if hasattr(data, "get") else getattr(data, key, default)
    return str(value or "").strip()


async def record_stripe_webhook_event_once(db: AsyncSession, event_id: str, event_type: str) -> bool:
    if not event_id:
        return True
    db.add(StripeWebhookEvent(event_id=event_id, event_type=event_type))
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        logger.info(
            "stripe_webhook_duplicate_event",
            extra={"stripe_event_id": event_id, "stripe_event_type": event_type},
        )
        return False
    return True


async def record_payment_verification_attempt_once(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
) -> bool:
    db.add(
        PaymentVerificationAttempt(
            user_id=user_id,
            session_id=session_id,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.info(
            "payment_verify_duplicate_attempt",
            extra={"user_id": user_id, "stripe_session_id": session_id},
        )
        return False
    return True


async def complete_payment_verification_attempt(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
    is_pro: bool,
) -> None:
    await db.execute(
        update(PaymentVerificationAttempt)
        .where(
            PaymentVerificationAttempt.user_id == user_id,
            PaymentVerificationAttempt.session_id == session_id,
        )
        .values(
            status=PAYMENT_VERIFICATION_COMPLETED_STATUS,
            is_pro_result=is_pro,
            response_status_code=None,
            response_detail=None,
            completed_at=func.now(),
        )
    )
    await db.commit()


async def fail_payment_verification_attempt(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
    status_code: int,
    detail: str,
) -> None:
    await db.execute(
        update(PaymentVerificationAttempt)
        .where(
            PaymentVerificationAttempt.user_id == user_id,
            PaymentVerificationAttempt.session_id == session_id,
        )
        .values(
            status=PAYMENT_VERIFICATION_FAILED_STATUS,
            is_pro_result=None,
            response_status_code=status_code,
            response_detail=detail[:255],
            completed_at=func.now(),
        )
    )
    await db.commit()


async def release_payment_verification_attempt(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
) -> None:
    await db.execute(
        delete(PaymentVerificationAttempt).where(
            PaymentVerificationAttempt.user_id == user_id,
            PaymentVerificationAttempt.session_id == session_id,
        )
    )
    await db.commit()


async def load_payment_verification_attempt_result(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
):
    return (
        await db.execute(
            select(
                PaymentVerificationAttempt.status,
                PaymentVerificationAttempt.is_pro_result,
                PaymentVerificationAttempt.response_status_code,
                PaymentVerificationAttempt.response_detail,
            ).where(
                PaymentVerificationAttempt.user_id == user_id,
                PaymentVerificationAttempt.session_id == session_id,
            )
        )
    ).one_or_none()


async def wait_for_payment_verification_attempt_result(
    db: AsyncSession,
    *,
    user_id: int,
    session_id: str,
) -> VerifyOut:
    deadline = time.monotonic() + PAYMENT_VERIFICATION_PENDING_TIMEOUT_SECONDS
    while True:
        row = await load_payment_verification_attempt_result(
            db,
            user_id=user_id,
            session_id=session_id,
        )
        if row is None:
            raise HTTPException(status_code=503, detail=VERIFY_CHECKOUT_UNAVAILABLE_DETAIL)

        status, is_pro_result, response_status_code, response_detail = row
        if status == PAYMENT_VERIFICATION_COMPLETED_STATUS:
            return VerifyOut(is_pro=bool(is_pro_result))
        if status == PAYMENT_VERIFICATION_FAILED_STATUS:
            raise HTTPException(
                status_code=int(response_status_code or 400),
                detail=response_detail or "Payment verification failed",
            )

        if time.monotonic() >= deadline:
            logger.warning(
                "payment_verify_duplicate_pending_timeout",
                extra={"user_id": user_id, "stripe_session_id": session_id},
            )
            raise HTTPException(status_code=409, detail="Payment verification is still in progress")

        await asyncio.sleep(PAYMENT_VERIFICATION_PENDING_POLL_SECONDS)


async def create_checkout_state(
    db: AsyncSession,
    *,
    user: User,
    plan: str,
    success_path: str,
    cancel_path: str,
    settings: Settings,
    create_checkout_session_fn: CreateCheckoutSession,
) -> CheckoutOut:
    previous_customer_id = user.stripe_customer_id
    await db.commit()
    checkout_session = await create_checkout_session_fn(
        user,
        plan,
        settings,
        success_path=success_path,
        cancel_path=cancel_path,
    )
    await persist_created_stripe_customer(
        db,
        user,
        previous_customer_id=previous_customer_id,
        customer_id=checkout_session.customer_id,
    )
    return CheckoutOut(checkout_url=checkout_session.checkout_url)


async def verify_checkout_session_state(
    db: AsyncSession,
    *,
    user: User,
    session_id: str,
    settings: Settings,
    verify_checkout_session_fn: VerifyCheckoutSession,
) -> VerifyOut:
    user_id = int(user.id)
    first_attempt = await record_payment_verification_attempt_once(
        db,
        user_id=user_id,
        session_id=session_id,
    )
    if not first_attempt:
        return await wait_for_payment_verification_attempt_result(
            db,
            user_id=user_id,
            session_id=session_id,
        )

    try:
        verification = await verify_checkout_session_fn(session_id, settings)
        if verification.is_paid and verification.user_id != user_id:
            raise HTTPException(status_code=403, detail="Checkout session does not belong to this user")
        if verification.is_paid:
            await apply_paid_checkout_to_user(db, user, customer_id=verification.customer_id)
        else:
            await release_payment_verification_attempt(
                db,
                user_id=user_id,
                session_id=session_id,
            )
            return VerifyOut(is_pro=False)
        result = VerifyOut(is_pro=bool(user.is_pro))
        await complete_payment_verification_attempt(
            db,
            user_id=user_id,
            session_id=session_id,
            is_pro=result.is_pro,
        )
        return result
    except HTTPException as exc:
        if exc.status_code == 503:
            await release_payment_verification_attempt(
                db,
                user_id=user_id,
                session_id=session_id,
            )
        else:
            await fail_payment_verification_attempt(
                db,
                user_id=user_id,
                session_id=session_id,
                status_code=exc.status_code,
                detail=str(exc.detail or "Payment verification failed"),
            )
        raise
    except Exception:
        await release_payment_verification_attempt(
            db,
            user_id=user_id,
            session_id=session_id,
        )
        raise


async def construct_stripe_webhook_event(
    *,
    payload: bytes,
    signature: str,
    settings: Settings,
    construct_event_fn: ConstructStripeEvent,
):
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        return await asyncio.to_thread(
            construct_event_fn,
            payload,
            signature,
            settings.stripe_webhook_secret,
        )
    except stripe.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid payload") from exc
    except Exception as exc:
        logger.exception("stripe_webhook_construct_event_failed")
        raise HTTPException(status_code=400, detail="Invalid payload") from exc


async def process_stripe_webhook_event(
    db: AsyncSession,
    *,
    settings: Settings,
    payload: bytes,
    signature: str,
    construct_event_fn: ConstructStripeEvent,
    customer_id_for_charge_fn: CustomerIdForCharge,
    record_webhook_event_once_fn: RecordWebhookEventOnce = record_stripe_webhook_event_once,
) -> dict[str, bool]:
    event = await construct_stripe_webhook_event(
        payload=payload,
        signature=signature,
        settings=settings,
        construct_event_fn=construct_event_fn,
    )

    event_type = event["type"]
    data = event["data"]["object"]
    event_id = event_value(event, "id")
    resolved_dispute_customer_id = ""

    if event_type == "charge.dispute.created":
        resolved_dispute_customer_id = event_value(data, "customer")
        charge_id = event_value(data, "charge")
        if not resolved_dispute_customer_id:
            resolved_dispute_customer_id = await customer_id_for_charge_fn(charge_id, settings)
        if not resolved_dispute_customer_id:
            logger.warning(
                "stripe_dispute_created_missing_customer",
                extra={"stripe_event_id": event_id, "stripe_charge_id": charge_id},
            )
            raise HTTPException(status_code=503, detail=DISPUTE_CUSTOMER_LOOKUP_UNAVAILABLE_DETAIL)

    if not await record_webhook_event_once_fn(db, event_id, event_type):
        return {"received": True, "duplicate": True}

    if event_type == "checkout.session.completed":
        if event_value(data, "payment_status") != "paid":
            logger.info(
                "stripe_checkout_completed_not_paid",
                extra={"stripe_event_id": event_id, "payment_status": event_value(data, "payment_status")},
            )
            await db.commit()
            return {"received": True}
        user_id = stripe_metadata_user_id(data.get("metadata", {}))
        if user_id is None:
            logger.warning("stripe_checkout_completed_missing_user_id")
            await db.commit()
            return {"received": True}
        await apply_paid_checkout_by_user_id(db, user_id, customer_id=data.get("customer", ""))

    elif event_type == "customer.subscription.deleted":
        await revoke_paid_access_by_customer_id(db, customer_id=event_value(data, "customer"))

    elif event_type == "invoice.payment_failed":
        logger.info("stripe_invoice_payment_failed_no_revocation", extra={"stripe_event_id": event_id})

    elif event_type == "charge.refunded":
        await revoke_paid_access_by_customer_id(db, customer_id=event_value(data, "customer"))

    elif event_type == "charge.dispute.created":
        await revoke_paid_access_by_customer_id(db, customer_id=resolved_dispute_customer_id)

    await db.commit()
    return {"received": True}
