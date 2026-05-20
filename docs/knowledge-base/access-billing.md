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

Locked API responses must keep the learning structure visible while hiding protected payloads such as provider IDs, URLs, quiz configs, and written solutions.

## Current Billing Surface

Stripe payment integration lives in:

- `backend/app/routers/payments.py`
- `backend/app/services/stripe_service.py`

Current endpoints:

- `POST /api/payments/create-checkout-session`
- `GET /api/payments/verify-session`
- `POST /api/payments/webhook`

Successful payment marks `User.is_pro=true`.

## Current Preview Rule

Locked content should show:

- Title.
- Lightweight summary.
- Topic context.
- Free preview state.
- Unlock CTA.

Locked content must not leak protected resource URLs, provider IDs, quiz answers, or written solutions.
