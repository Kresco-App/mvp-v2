import stripe
from fastapi import HTTPException

from app.config import Settings
from app.models.users import User

PRICES = {
    "monthly": 9900,  # 99 MAD in centimes
    "yearly": 79900,  # 799 MAD in centimes
}


def _stripe_client(settings: Settings) -> stripe.StripeClient:
    return stripe.StripeClient(settings.stripe_sk)


async def create_checkout_session(user: User, plan: str, settings: Settings) -> str:
    if plan not in PRICES:
        raise HTTPException(status_code=400, detail="Invalid plan. Use 'monthly' or 'yearly'")

    client = _stripe_client(settings)

    # Ensure stripe customer exists
    customer_id = user.stripe_customer_id or None
    if not customer_id:
        customer = client.customers.create(
            params={"email": user.email, "name": user.full_name, "metadata": {"user_id": str(user.id)}}
        )
        customer_id = customer.id

    session = client.checkout.sessions.create(
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
            "success_url": f"{settings.frontend_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{settings.frontend_url}/pricing",
            "metadata": {"user_id": str(user.id), "plan": plan},
        }
    )
    return session.url


async def verify_checkout_session(session_id: str, settings: Settings) -> bool:
    client = _stripe_client(settings)
    try:
        session = client.checkout.sessions.retrieve(session_id)
        return session.payment_status == "paid"
    except stripe.StripeError:
        return False
