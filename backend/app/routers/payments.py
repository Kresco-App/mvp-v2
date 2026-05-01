import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.payments import CheckoutOut, VerifyOut
from app.services.stripe_service import create_checkout_session, verify_checkout_session

router = APIRouter(tags=["Payments"])


@router.post("/create-checkout-session", response_model=CheckoutOut)
async def create_checkout(
    plan: str = "monthly",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    checkout_url = await create_checkout_session(user, plan, settings)

    # Persist stripe_customer_id if we just created a customer (refresh from DB not needed —
    # the service creates the customer but doesn't update the model; we do it here)
    if not user.stripe_customer_id:
        await db.commit()

    return CheckoutOut(checkout_url=checkout_url)


@router.get("/verify-session", response_model=VerifyOut)
async def verify_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    is_paid = await verify_checkout_session(session_id, settings)
    if is_paid and not user.is_pro:
        await db.execute(update(User).where(User.id == user.id).values(is_pro=True))
        await db.commit()
        user.is_pro = True
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
    except stripe.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        user_id = int(data.get("metadata", {}).get("user_id", 0))
        customer_id = data.get("customer", "")
        if user_id:
            await db.execute(
                update(User)
                .where(User.id == user_id)
                .values(is_pro=True, stripe_customer_id=customer_id or User.stripe_customer_id)
            )
            await db.commit()

    elif event_type in ("customer.subscription.deleted", "invoice.payment_failed"):
        customer_id = data.get("customer", "")
        if customer_id:
            await db.execute(
                update(User).where(User.stripe_customer_id == customer_id).values(is_pro=False)
            )
            await db.commit()

    return {"received": True}
