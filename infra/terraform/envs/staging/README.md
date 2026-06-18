# Staging Terraform

This environment describes the current staging target:

- Project: `kresco-staging`
- Region: `europe-southwest1`
- Cloud Run: `kresco-backend-staging`, `kresco-frontend-staging`
- Artifact Registry: `kresco-containers`
- Cloud SQL: `kresco-staging-postgres`
- Secret Manager: `kresco-runtime`
- Media bucket: `kresco-staging-private-media`
- Firestore: `(default)` in native mode, verified outside Terraform
- Firebase Auth: Email/Password and Google providers verified outside Terraform

The live resources already exist. Complete `import-plan.md` before any apply.

## Validate Locally

```powershell
terraform init -backend=false
terraform validate
terraform fmt -recursive
```

## Pending Provider Values

CMI and VdoCipher values are intentionally pending in staging until provider-owned credentials and callback URLs are available. The automated deploy smoke does not mark those provider checks complete.
