# Architecture and Infrastructure

## Current backend shape

Current architecture:

```text
Vercel Frontend
-> API Gateway
-> Lambda / FastAPI
-> RDS PostgreSQL
```

Deployment uses Zappa for the FastAPI/Lambda backend.

This is a good core API backend for the current product if it remains the control layer.

## Backend responsibilities

FastAPI/Lambda should handle:

- Auth/session APIs.
- Users.
- Roles/permissions.
- Subjects/topics/content metadata.
- Course/topic access.
- Quiz attempts.
- Progress.
- XP event ingestion.
- Payments/subscriptions.
- Admin actions.
- Token generation for video/live/chat providers.
- Webhooks.
- Email triggers.

## What not to put in Lambda

Do not use the normal FastAPI/Lambda path for:

- Actual livestream video delivery.
- Thousands of websocket chat connections.
- Large video processing.
- Long-running AI jobs inside one HTTP request.
- Large file processing.

Use providers and async workers.

## Future providers

Livestream/video delivery:

- Mux.
- AWS IVS.
- LiveKit.
- Agora.
- Cloudflare Stream.

Realtime/chat:

- Ably.
- Pusher.
- LiveKit data channels.
- API Gateway WebSocket only if AWS-native complexity is worth it.

AI:

- Backend-authenticated AI calls for simple chat.
- Async jobs for long analysis/generation.

## Async architecture

Use event-driven processing for progress, XP, recommendations, and long-running work.

Preferred model:

```text
FastAPI Lambda
-> database event row
-> SQS
-> worker Lambda
-> derived tables / notifications / analytics
```

This keeps user requests fast and makes XP/progress more reliable.

## RDS Proxy and caching

Before launch:

- Add RDS Proxy.
- Add caching where appropriate.

Important current decision:

Do not implement caching right now.

But design APIs and data access so caching can be added later:

- Stable resource identifiers.
- Clear read endpoints.
- Updated timestamps/versions.
- Avoid mixing user-private and public cacheable data unnecessarily.
- Separate expensive aggregate queries from simple content reads.

## Observability

Track and alert on:

- Payment failures.
- Webhook failures.
- Video token generation failures.
- Quiz submission failures.
- XP/progress worker failures.
- SQS dead-letter queues.
- API errors.
- Deploy failures.
- Database connection pressure.
- Cost-sensitive features.

## Evals/checks

Add explicit checks/evals for:

- Access decisions.
- XP awarding.
- Anti-farming.
- Quiz grading.
- Progress calculation.
- Content visibility.
- Recommendation logic later.
- AI tutor behavior later.

## Scalability stance

FastAPI on Lambda can scale well for core request/response features.

Main risks are:

- Database connection pressure.
- Cold starts during spikes.
- Missing RDS Proxy.
- Expensive AI usage.
- Livestream viewer-minute cost.
- Chat fanout cost.
- No usage limits.
- Weak observability.

The right boundary is:

```text
Backend = source of truth and access control
Providers = heavy video/realtime/AI infrastructure
Workers = slow/derived/background work
```
