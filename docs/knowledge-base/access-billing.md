# Access and Billing Model

## Current Access Inputs

Access decisions use:

- User subject entitlements.
- User global pro state.
- Content gate fields.

Current gate fields on content records:

- `is_free_preview`
- `required_tier`
- `required_feature_key`

Current subject entitlement records are represented by `UserSubjectEntitlement`.

## Current Access Surfaces

Access checks apply to:

- Topics.
- TopicItems.
- TabContent.
- Resources.
- Lessons and sections on compatibility routes.
- Exams and ExamProblems.

Locked API responses must keep the learning structure visible while hiding protected payloads such as provider IDs, URLs, quiz configs, and written solutions. Course response projection and locked-payload redaction live in `backend/app/services/course_access.py`.

## Current Billing Surface

Stripe payment integration lives in:

- `backend/app/routers/payments.py`
- `backend/app/services/stripe_service.py`
- `backend/app/services/payment_entitlements.py`

Current endpoints:

- `POST /api/payments/create-checkout-session`
- `POST /api/payments/verify-session`
- `GET /api/payments/verify-session` returns current Pro status only for compatibility
- `POST /api/payments/webhook`

The current billing model is a one-time `pro` Checkout payment. Successful payment marks `User.is_pro=true` through the shared payment entitlement service; the app does not currently create Stripe subscriptions or model recurring billing periods.

## Target Billing Direction

Stripe is not the target launch gateway. The payment roadmap should remove
Stripe from the active checkout path and replace it with a provider-neutral
payment gateway layer.

Target launch rails:

- CMI for Moroccan/local card payments.
- Virement bancaire for bank-transfer requests, proof upload, finance review,
  and bank-statement reconciliation.
- CashPlus for cash/offline payment requests, pending instructions, manual or
  imported confirmation, and reconciliation.

Required target behavior:

- Payment history is append-only.
- Provider events, manual confirmations, reconciliation imports, refunds, and
  reversals are recorded as immutable finance events.
- Entitlements are granted only from confirmed transactions or audited manual
  grants.
- `User.is_pro` remains a projection/cache, not the finance source of truth.
- Manual rails such as virement and CashPlus must show pending/manual-review
  states and must not unlock access until finance confirmation or matched
  reconciliation.
- Stripe checkout/webhook code should be deprecated and removed after the new
  gateway layer is ready. Any temporary compatibility shim must not become the
  basis for new payment features.

## Current Preview Rule

Locked content should show:

- Title.
- Lightweight summary.
- Topic context.
- Free preview state.
- Unlock CTA.

Locked content must not leak protected resource URLs, provider IDs, quiz answers, or written solutions.
