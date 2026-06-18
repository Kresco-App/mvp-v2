# Staging Terraform Import Plan

Run from `infra/terraform/envs/staging` after `terraform init -backend=false`.

Do not apply until every imported resource has a reviewed no-op or intentional plan.

```powershell
terraform import 'module.artifact_registry.google_artifact_registry_repository.this' 'projects/kresco-staging/locations/europe-southwest1/repositories/kresco-containers'
terraform import 'module.runtime_secret.google_secret_manager_secret.this' 'projects/kresco-staging/secrets/kresco-runtime'
terraform import 'module.media_bucket.google_storage_bucket.this' 'kresco-staging-private-media'
terraform import 'module.cloud_sql.google_sql_database_instance.this' 'projects/kresco-staging/instances/kresco-staging-postgres'
terraform import 'module.github_oidc.google_iam_workload_identity_pool.github' 'projects/kresco-staging/locations/global/workloadIdentityPools/github-kresco'
terraform import 'module.github_oidc.google_iam_workload_identity_pool_provider.github' 'projects/kresco-staging/locations/global/workloadIdentityPools/github-kresco/providers/github'
terraform import 'module.github_oidc.google_service_account.deploy' 'projects/kresco-staging/serviceAccounts/github-deployer@kresco-staging.iam.gserviceaccount.com'
terraform import 'module.github_oidc.google_service_account_iam_member.github_workload_identity_user' 'projects/kresco-staging/serviceAccounts/github-deployer@kresco-staging.iam.gserviceaccount.com roles/iam.workloadIdentityUser principalSet://iam.googleapis.com/projects/760338563763/locations/global/workloadIdentityPools/github-kresco/attribute.repository/Kresco-App/mvp-v2'
terraform import 'module.backend_service.google_cloud_run_v2_service.this' 'projects/kresco-staging/locations/europe-southwest1/services/kresco-backend-staging'
terraform import 'module.frontend_service.google_cloud_run_v2_service.this' 'projects/kresco-staging/locations/europe-southwest1/services/kresco-frontend-staging'
```

Project IAM role imports use the role/member id shape required by the Google provider. Generate them from the configured roles before importing:

```powershell
terraform plan -generate-config-out=generated-staging.tf
```

Then import each `module.github_oidc.google_project_iam_member.deploy_project_roles[...]` instance only after the generated address and id are confirmed.

The migration job `kresco-migrate-staging` is intentionally workflow-managed in this first pass because every deploy updates its image. Import it only after deciding whether Terraform or the deploy workflow owns job image drift.
