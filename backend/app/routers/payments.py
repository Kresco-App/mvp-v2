import stripe
from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.payments import CheckoutOut, VerifyOut
from app.services.payment_lifecycle import (
    create_checkout_state,
    process_stripe_webhook_event,
    record_stripe_webhook_event_once as _record_stripe_webhook_event_once,
    verify_checkout_session_state,
)
from app.services.stripe_service import create_checkout_session, customer_id_for_charge, verify_checkout_session

router = APIRouter(tags=["Payments"])


@router.post("/create-checkout-session", response_model=CheckoutOut)
@limiter.limit("10/minute")
async def create_checkout(
    request: Request,
    plan: str = "pro",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    return await create_checkout_state(
        db,
        user=user,
        plan=plan,
        settings=settings,
        create_checkout_session_fn=create_checkout_session,
    )


@router.get("/verify-session", response_model=VerifyOut)
@limiter.limit("20/minute")
async def verify_session(
    request: Request,
    session_id: str,
    idempotency_key: str = Header(..., min_length=8, max_length=160, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    return await verify_checkout_session_state(
        db,
        user=user,
        session_id=session_id,
        idempotency_key=idempotency_key,
        settings=settings,
        verify_checkout_session_fn=verify_checkout_session,
    )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    return await process_stripe_webhook_event(
        db,
        settings=settings,
        payload=payload,
        signature=sig,
        construct_event_fn=stripe.Webhook.construct_event,
        customer_id_for_charge_fn=customer_id_for_charge,
        record_webhook_event_once_fn=_record_stripe_webhook_event_once,
    )
