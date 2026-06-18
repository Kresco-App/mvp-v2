output "workload_identity_provider" {
  description = "Workload identity provider resource name for GitHub environment vars."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account_email" {
  description = "Deploy service account email for GitHub environment vars."
  value       = google_service_account.deploy.email
}
