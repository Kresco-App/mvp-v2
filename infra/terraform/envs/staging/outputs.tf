output "artifact_repository_name" {
  value       = module.artifact_registry.repository_name
  description = "Artifact Registry repository name."
}

output "runtime_secret_name" {
  value       = module.runtime_secret.secret_name
  description = "Runtime secret resource name."
}

output "media_bucket_name" {
  value       = module.media_bucket.bucket_name
  description = "Private media bucket name."
}

output "cloud_sql_connection_name" {
  value       = module.cloud_sql.connection_name
  description = "Cloud SQL connection name."
}

output "github_workload_identity_provider" {
  value       = module.github_oidc.workload_identity_provider
  description = "GitHub environment variable GCP_WORKLOAD_IDENTITY_PROVIDER."
}

output "github_deploy_service_account" {
  value       = module.github_oidc.deploy_service_account_email
  description = "GitHub environment variable GCP_DEPLOY_SERVICE_ACCOUNT."
}

output "backend_service_uri" {
  value       = module.backend_service.service_uri
  description = "Backend Cloud Run URI."
}

output "frontend_service_uri" {
  value       = module.frontend_service.service_uri
  description = "Frontend Cloud Run URI."
}
