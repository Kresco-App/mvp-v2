# Kresco Terraform

This directory is an import-first scaffold for the GCP/Firebase staging and production footprint.

Do not run `terraform apply` against an existing environment until the matching import plan has been completed and `terraform plan` is reviewed as a no-op or as an intentional change set.

## Layout

- `modules/artifact-registry`: Docker repository and cleanup policy.
- `modules/cloud-run-service`: Cloud Run v2 service shell with release/runtime env wiring.
- `modules/cloud-sql-postgres`: managed Postgres instance settings.
- `modules/gcs-private-bucket`: private media bucket posture.
- `modules/github-oidc`: GitHub Actions OIDC provider, deploy service account, and IAM.
- `modules/secret-manager`: runtime secret container and IAM grants, without storing secret values.
- `envs/staging`: staging instantiation and import plan.
- `envs/production`: production scaffold; keep manual/gated until launch approval.

## State

Use a GCS backend after the state bucket is created and access is confirmed:

```hcl
terraform {
  backend "gcs" {
    bucket = "kresco-terraform-state"
    prefix = "envs/staging"
  }
}
```

Keep state access restricted to operators and the GitHub deploy service account. Secret values are not written by this scaffold; runtime values stay in Secret Manager versions managed outside Terraform.

## Safe Staging Flow

1. `terraform init -backend=false`
2. Run every command in `envs/staging/import-plan.md`.
3. `terraform plan -var-file=terraform.tfvars`
4. Review any drift before apply.
5. Apply only after the plan is understood.

Firebase Auth provider settings are documented and verified through Firebase/Identity Toolkit APIs for now. Terraform does not own Firebase Auth provider configuration in this scaffold.
