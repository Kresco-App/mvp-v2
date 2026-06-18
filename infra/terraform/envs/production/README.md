# Production Terraform

Production remains manual and gated. This directory exists so production has a clear place to land, but it should not be applied until:

- staging auto-deploy has passed repeatedly,
- provider credential rotation evidence is complete,
- dark-production checks pass,
- `docs/production-remediation-traceability.md` is signed off,
- the user explicitly approves production infrastructure changes.

Use the staging environment as the template once those gates are met.
