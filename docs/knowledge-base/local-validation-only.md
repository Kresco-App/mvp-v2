# Local Validation Only Mode

## Current decision

Deployment and CI/CD are paused until a separate deployment-focused session.

Do not spend implementation-loop time trying to fix production deployment.

## Out of scope for the main implementation loop

Do not attempt:

- GitHub Actions deployment.
- Vercel deployment.
- AWS Lambda/Zappa deployment.
- Production environment variable setup.
- Production database migrations.
- Production smoke tests.

If deployment config is encountered, leave it alone unless it is required for local development.

## Required local-only approach

Use local/dev systems only:

- Local backend.
- Local frontend.
- Local database or existing dev database.
- Local seed data.
- Local migrations.
- Mock providers.
- Demo provider IDs only when records are clearly local/demo data.
- Browser validation on localhost.

## Missing services rule

If a third-party service is missing, do not stop the whole loop.

Use a local workaround:

- Missing VdoCipher: use demo video records or a mock video provider adapter.
- Missing CMI: use mock payment-request and callback state.
- Missing Resend: log/mock email sends.
- Missing Google OAuth: use mock/dev login if available.
- Missing AI provider: use mock AI response provider.
- Missing live/chat provider: build shell/data model only.

Only mark that specific integration as blocked.

Continue implementing and validating every independent part.

## Validation focus

Validation should focus on:

- Local tests.
- Local type/lint/build checks.
- Local migrations.
- Local seed data.
- Local API smoke checks.
- Frontend/backend dev server startup.
- Browser verification on localhost.
- Console error inspection.
- Network request inspection.
- Main user flows.

Do not treat deployment failure as failure of the product implementation loop.

## Agent instruction

For long-running goals, use this rule:

```text
Deployment/CI/CD is paused.
Validate locally.
If deployment-related work appears, document it and continue with local implementation.
Do not end the loop because production deployment is blocked.
```
