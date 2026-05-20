# Stripe Integration

## Current Implementation

Stripe is implemented in the FastAPI backend:

- Router: `backend/app/routers/payments.py`
- Service: `backend/app/services/stripe_service.py`
- Schemas: `backend/app/schemas/payments.py`

Current endpoints:

- `POST /api/payments/create-checkout-session`
- `GET /api/payments/verify-session?session_id=...`
- `POST /api/payments/webhook`

Current checkout mode is one-time payment, not subscription mode.

Current plans:

- `monthly`: 9900 centimes MAD.
- `yearly`: 79900 centimes MAD.

## Required Environment

Set these in the backend environment:

```text
STRIPE_SK=
STRIPE_PK=
STRIPE_PRODUCT_ID=
STRIPE_WEBHOOK_SECRET=
FRONTEND_URL=
```

Accepted aliases are defined in `backend/app/config.py`.

## Current Behavior

- Checkout sessions are created server-side with Stripe.
- Stripe customer metadata includes the Kresco user id.
- Successful checkout redirects to `${FRONTEND_URL}/payment-success?session_id=...`.
- `verify-session` marks the current user as `is_pro=true` when Stripe reports a paid session.
- Webhook `checkout.session.completed` marks the target user as pro.
- Webhook `customer.subscription.deleted` and `invoice.payment_failed` mark users non-pro by Stripe customer id.

## Local Verification

Backend tests cover webhook secret enforcement:

```bash
cd backend
python -m pytest tests_fastapi/test_payments.py
```

Do not paste real Stripe secrets into Markdown.
