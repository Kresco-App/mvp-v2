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
- Lessons and sections.
- Exams and ExamProblems.

Locked API responses must keep the learning structure visible while hiding protected payloads such as provider IDs, URLs, quiz configs, and written solutions. Course response projection and locked-payload redaction live in `backend/app/services/course_access.py`.

## Current Billing Surface

Payment integration lives in:

- `backend/app/routers/payments.py`
- `backend/app/services/payment_gateway.py`
- `backend/app/services/payment_entitlements.py`

Current endpoints:

- `POST /api/payments/payment-requests`
- `GET /api/payments/payment-requests/current`
- `POST /api/payments/cmi/callback`
- `POST /api/payments/manual-payment-requests/{transaction_id}/proof`
- Finance/admin endpoints under `/api/payments/finance/*`,
  `/api/payments/manual-payment-requests/*`, and
  `/api/payments/manual-payment-reconciliation-imports`.

The current billing model is one-time `pro` access through CMI card payments
or manual rails. Confirmed payment marks `User.is_pro=true` through the shared
payment entitlement service, while finance records remain the durable source of
truth.

## Target Billing Direction

The launch payment surface is provider-neutral and should stay that way.

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

## Current Preview Rule

Locked content should show:

- Title.
- Lightweight summary.
- Topic context.
- Free preview state.
- Unlock CTA.

Locked content must not leak protected resource URLs, provider IDs, quiz answers, or written solutions.
