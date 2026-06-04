import asyncio
import logging
import stripe
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlsplit, urlunsplit

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
CHECKOUT_UNAVAILABLE_DETAIL = "Stripe checkout is temporarily unavailable"
VERIFY_CHECKOUT_UNAVAILABLE_DETAIL = "Stripe checkout verification is temporarily unavailable"
STRIPE_CONNECT_TIMEOUT_SECONDS = 2.0
STRIPE_READ_TIMEOUT_SECONDS = 5.0
STRIPE_FETCH_ATTEMPTS = 3
STRIPE_FETCH_RETRY_BASE_SECONDS = 0.1

logger = logging.getLogger("kresco.payments")


@dataclass(frozen=True)
class CheckoutSessionVerification:
    is_paid: bool
    user_id: int | None = None
    customer_id: str = ""


def _stripe_client(settings: Settings) -> stripe.StripeClient:
    return stripe.StripeClient(
        settings.stripe_sk,
        max_network_retries=0,
        http_client=stripe.RequestsClient(
            timeout=(STRIPE_CONNECT_TIMEOUT_SECONDS, STRIPE_READ_TIMEOUT_SECONDS),
        ),
    )


async def _call_stripe(func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)


async def _call_stripe_fetch_with_retries(func, *args, **kwargs):
    for attempt in range(1, STRIPE_FETCH_ATTEMPTS + 1):
        try:
            return await _call_stripe(func, *args, **kwargs)
        except stripe.StripeError as exc:
            if attempt >= STRIPE_FETCH_ATTEMPTS or not _is_retryable_stripe_error(exc):
                raise
            await asyncio.sleep(STRIPE_FETCH_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))


def _require_checkout_config(settings: Settings) -> None:
    if not settings.stripe_sk.strip() or not settings.stripe_product_id.strip():
        raise HTTPException(status_code=503, detail=MISSING_CHECKOUT_CONFIG_DETAIL)


def _frontend_url(settings: Settings, path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/{path.lstrip('/')}"


def _safe_relative_checkout_path(path: str, *, fallback: str) -> str:
    value = (path or fallback).strip() or fallback
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith("//") or "\\" in value:
        raise HTTPException(status_code=400, detail="Checkout return paths must be safe relative URLs")
    if not value.startswith("/"):
        raise HTTPException(status_code=400, detail="Checkout return paths must be safe relative URLs")
    return value


def _success_path_with_session_id(path: str) -> str:
    parsed = urlsplit(path)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    if not any(key == "session_id" for key, _value in query):
        separator = "&" if parsed.query else ""
        query_string = f"{parsed.query}{separator}session_id={{CHECKOUT_SESSION_ID}}"
        return urlunsplit(("", "", parsed.path, query_string, parsed.fragment))
    return path


def _is_retryable_stripe_error(exc: stripe.StripeError) -> bool:
    if isinstance(exc, (stripe.APIConnectionError, stripe.APIError, stripe.RateLimitError)):
        return True
    if getattr(exc, "should_retry", False):
        return True
    http_status = getattr(exc, "http_status", None)
    return isinstance(http_status, int) and http_status >= 500


def _is_retryable_checkout_verification_error(exc: stripe.StripeError) -> bool:
    return _is_retryable_stripe_error(exc)


async def create_checkout_session(
    user: User,
    plan: str,
    settings: Settings,
    *,
    success_path: str = "/payment-success?session_id={CHECKOUT_SESSION_ID}",
    cancel_path: str = "/pricing",
) -> str:
    if plan not in PRICES:
        raise HTTPException(status_code=400, detail=VALID_PLAN_DETAIL)
    _require_checkout_config(settings)
    safe_success_path = _success_path_with_session_id(
        _safe_relative_checkout_path(success_path, fallback="/payment-success?session_id={CHECKOUT_SESSION_ID}")
    )
    safe_cancel_path = _safe_relative_checkout_path(cancel_path, fallback="/pricing")

    client = _stripe_client(settings)

    # Ensure stripe customer exists
    customer_id = user.stripe_customer_id or None
    try:
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
                "success_url": _frontend_url(settings, safe_success_path),
                "cancel_url": _frontend_url(settings, safe_cancel_path),
                "metadata": {
                    "user_id": str(user.id),
                    "plan": plan,
                    "access_model": "one_time_pro_unlock",
                },
            }
        )
    except stripe.StripeError as exc:
        logger.warning(
            "stripe_checkout_create_failed user_id=%s error_type=%s",
            user.id,
            type(exc).__name__,
        )
        raise HTTPException(status_code=503, detail=CHECKOUT_UNAVAILABLE_DETAIL) from exc
    return session.url


async def verify_checkout_session(session_id: str, settings: Settings) -> CheckoutSessionVerification:
    client = _stripe_client(settings)
    try:
        session = await _call_stripe_fetch_with_retries(client.v1.checkout.sessions.retrieve, session_id)
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
    except stripe.StripeError as exc:
        if _is_retryable_checkout_verification_error(exc):
            raise HTTPException(status_code=503, detail=VERIFY_CHECKOUT_UNAVAILABLE_DETAIL) from exc
        return CheckoutSessionVerification(is_paid=False)


async def customer_id_for_charge(charge_id: str | None, settings: Settings) -> str:
    normalized_charge_id = str(charge_id or "").strip()
    if not normalized_charge_id or not settings.stripe_sk.strip():
        return ""

    client = _stripe_client(settings)
    try:
        charge = await _call_stripe_fetch_with_retries(client.v1.charges.retrieve, normalized_charge_id)
    except stripe.StripeError:
        return ""

    customer_id = getattr(charge, "customer", "") or ""
    return str(customer_id)
