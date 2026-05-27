import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.payments import CheckoutOut, VerifyOut
from app.services.payment_entitlements import (
    apply_paid_checkout_by_user_id,
    apply_paid_checkout_to_user,
    persist_created_stripe_customer,
    revoke_paid_access_by_customer_id,
    stripe_metadata_user_id,
)
from app.services.stripe_service import create_checkout_session, verify_checkout_session

router = APIRouter(tags=["Payments"])
logger = logging.getLogger("kresco.payments")


@router.post("/create-checkout-session", response_model=CheckoutOut)
async def create_checkout(
    plan: str = "pro",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    previous_customer_id = user.stripe_customer_id
    checkout_url = await create_checkout_session(user, plan, settings)
    await persist_created_stripe_customer(db, user, previous_customer_id=previous_customer_id)

    return CheckoutOut(checkout_url=checkout_url)


@router.get("/verify-session", response_model=VerifyOut)
async def verify_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    verification = await verify_checkout_session(session_id, settings)
    if verification.is_paid and verification.user_id != user.id:
        raise HTTPException(status_code=403, detail="Checkout session does not belong to this user")
    if verification.is_paid:
        await apply_paid_checkout_to_user(db, user, customer_id=verification.customer_id)
    return VerifyOut(is_pro=user.is_pro)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        user_id = stripe_metadata_user_id(data.get("metadata", {}))
        if user_id is None:
            logger.warning("stripe_checkout_completed_missing_user_id")
            return {"received": True}
        await apply_paid_checkout_by_user_id(db, user_id, customer_id=data.get("customer", ""))

    elif event_type in ("customer.subscription.deleted", "invoice.payment_failed"):
        await revoke_paid_access_by_customer_id(db, customer_id=data.get("customer", ""))

    return {"received": True}
