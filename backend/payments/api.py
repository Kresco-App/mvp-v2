import stripe
from ninja import Router
from ninja.errors import HttpError
from django.conf import settings
from users.auth import jwt_auth

router = Router()

PRICES = {
    'monthly': {'amount': 9900, 'interval': 'month'},   # 99 MAD
    'yearly':  {'amount': 79900, 'interval': 'year'},    # 799 MAD
}


@router.post("/create-checkout-session", auth=jwt_auth)
def create_checkout_session(request, plan: str = 'monthly'):
    if not settings.STRIPE_SK:
        raise HttpError(503, "Stripe n'est pas configure. Contactez l'administrateur.")

    stripe.api_key = settings.STRIPE_SK
    user = request.auth

    if plan not in PRICES:
        raise HttpError(400, "Plan invalide. Choisissez 'monthly' ou 'yearly'.")

    price_info = PRICES[plan]

    try:
        # Get or create Stripe customer
        if user.stripe_customer_id:
            customer_id = user.stripe_customer_id
        else:
            customer = stripe.Customer.create(
                email=user.email,
                name=user.full_name,
                metadata={'user_id': str(user.id)},
            )
            customer_id = customer.id
            user.stripe_customer_id = customer_id
            user.save(update_fields=['stripe_customer_id'])

        # Reuse existing price or create a new one
        prices = stripe.Price.list(product=settings.STRIPE_PRODUCT_ID, active=True, currency='mad')
        existing = None
        for p in prices.data:
            if p.unit_amount == price_info['amount'] and p.recurring and p.recurring.interval == price_info['interval']:
                existing = p
                break
        if existing:
            price_id = existing.id
        else:
            price = stripe.Price.create(
                product=settings.STRIPE_PRODUCT_ID,
                unit_amount=price_info['amount'],
                currency='mad',
                recurring={'interval': price_info['interval']},
            )
            price_id = price.id

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode='subscription',
            line_items=[{'price': price_id, 'quantity': 1}],
            success_url='http://localhost:3000/payment-success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url='http://localhost:3000/pricing',
            metadata={'user_id': str(user.id), 'plan': plan},
        )

        return {'checkout_url': session.url}

    except stripe.error.StripeError as e:
        raise HttpError(500, f"Erreur Stripe: {str(e)}")


@router.get("/verify-session", auth=jwt_auth)
def verify_session(request, session_id: str):
    stripe.api_key = settings.STRIPE_SK
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.StripeError as e:
        raise HttpError(400, f"Session invalide: {str(e)}")

    if session.payment_status == 'paid':
        user = request.auth
        user.is_pro = True
        user.save(update_fields=['is_pro'])
        return {"status": "ok", "is_pro": True}

    return {"status": "pending", "is_pro": False}
