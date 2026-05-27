# Stripe Integration

## Current Implementation

Stripe is implemented in the FastAPI backend:

- Router: `backend/app/routers/payments.py`
- Stripe service: `backend/app/services/stripe_service.py`
- Entitlement service: `backend/app/services/payment_entitlements.py`
- Schemas: `backend/app/schemas/payments.py`

Current endpoints:

- `POST /api/payments/create-checkout-session`
- `GET /api/payments/verify-session?session_id=...`
- `POST /api/payments/webhook`

Current checkout mode is one-time payment, not subscription mode. A successful payment unlocks the user's Pro access flag.

Current plans:

- `pro`: 9900 centimes MAD one-time Pro unlock.

## Required Environment

Set these in the backend environment:

```text
STRIPE_SK=
STRIPE_PRODUCT_ID=
STRIPE_WEBHOOK_SECRET=
FRONTEND_URL=
```

Accepted aliases are defined in `backend/app/config.py`. `STRIPE_PK` / `STRIPE_PUBLISHABLE_KEY` is still accepted by settings for compatibility, but hosted Checkout is created server-side and does not require it.

## Current Behavior

- Checkout sessions are created server-side with Stripe.
- Checkout session creation requires an authenticated user.
- Stripe customer metadata includes the Kresco user id.
- Existing Stripe customer ids are reused; newly created customer ids are persisted back to the user.
- Successful checkout redirects to `${FRONTEND_URL}/payment-success?session_id=...`.
- Checkout creation returns `503` when required Stripe checkout configuration is missing.
- `verify-session` marks the current user as `is_pro=true` through the shared payment entitlement service when Stripe reports a paid session.
- `verify-session` rejects paid sessions that belong to another user.
- Webhook `checkout.session.completed` marks the target user as pro through the same entitlement service.
- Webhook `customer.subscription.deleted` and `invoice.payment_failed` still mark users non-pro by Stripe customer id through the same entitlement service as a legacy/defensive branch, but current checkout does not create subscriptions.

## Local Verification

Backend tests cover webhook secret enforcement:

```bash
cd backend
python -m pytest tests_fastapi/test_payment_entitlements.py
python -m pytest tests_fastapi/test_payments.py
python -m pytest tests_fastapi/test_stripe_service.py
```

Do not paste real Stripe secrets into Markdown.
