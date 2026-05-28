import asyncio
import stripe
from dataclasses import dataclass

from fastapi import HTTPException

from app.config import Settings
from app.models.users import User

ONE_TIME_PRO_PLAN = "pro"
ONE_TIME_PRO_PRICE_CENTIMES = 9900

PRICES = {
    ONE_TIME_PRO_PLAN: ONE_TIME_PRO_PRICE_CENTIMES,
}
VALID_PLAN_DETAIL = "Invalid plan. Use 'pro'"
MISSING_CHECKOUT_CONFIG_DETAIL = "Stripe checkout is not configured"


@dataclass(frozen=True)
class CheckoutSessionVerification:
    is_paid: bool
    user_id: int | None = None
    customer_id: str = ""


def _stripe_client(settings: Settings) -> stripe.StripeClient:
    return stripe.StripeClient(settings.stripe_sk)


async def _call_stripe(func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)


def _require_checkout_config(settings: Settings) -> None:
    if not settings.stripe_sk.strip() or not settings.stripe_product_id.strip():
        raise HTTPException(status_code=503, detail=MISSING_CHECKOUT_CONFIG_DETAIL)


def _frontend_url(settings: Settings, path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/{path.lstrip('/')}"


async def create_checkout_session(user: User, plan: str, settings: Settings) -> str:
    if plan not in PRICES:
        raise HTTPException(status_code=400, detail=VALID_PLAN_DETAIL)
    _require_checkout_config(settings)

    client = _stripe_client(settings)

    # Ensure stripe customer exists
    customer_id = user.stripe_customer_id or None
    if not customer_id:
        customer = await _call_stripe(
            client.v1.customers.create,
            params={"email": user.email, "name": user.full_name, "metadata": {"user_id": str(user.id)}}
        )
        customer_id = customer.id
        user.stripe_customer_id = customer_id

    session = await _call_stripe(
        client.v1.checkout.sessions.create,
        params={
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [
                {
                    "price_data": {
                        "currency": "mad",
                        "unit_amount": PRICES[plan],
                        "product": settings.stripe_product_id,
                    },
                    "quantity": 1,
                }
            ],
            "mode": "payment",
            "success_url": _frontend_url(settings, "payment-success?session_id={CHECKOUT_SESSION_ID}"),
            "cancel_url": _frontend_url(settings, "pricing"),
            "metadata": {
                "user_id": str(user.id),
                "plan": plan,
                "access_model": "one_time_pro_unlock",
            },
        }
    )
    return session.url


async def verify_checkout_session(session_id: str, settings: Settings) -> CheckoutSessionVerification:
    client = _stripe_client(settings)
    try:
        session = await _call_stripe(client.v1.checkout.sessions.retrieve, session_id)
        metadata = getattr(session, "metadata", {}) or {}
        raw_user_id = metadata.get("user_id") if isinstance(metadata, dict) else getattr(metadata, "user_id", None)
        try:
            user_id = int(raw_user_id) if raw_user_id else None
        except (TypeError, ValueError):
            user_id = None
        return CheckoutSessionVerification(
            is_paid=session.payment_status == "paid",
            user_id=user_id,
            customer_id=str(getattr(session, "customer", "") or ""),
        )
    except stripe.StripeError:
        return CheckoutSessionVerification(is_paid=False)


async def customer_id_for_charge(charge_id: str | None, settings: Settings) -> str:
    normalized_charge_id = str(charge_id or "").strip()
    if not normalized_charge_id or not settings.stripe_sk.strip():
        return ""

    client = _stripe_client(settings)
    try:
        charge = await _call_stripe(client.v1.charges.retrieve, normalized_charge_id)
    except stripe.StripeError:
        return ""

    customer_id = getattr(charge, "customer", "") or ""
    return str(customer_id)
