output "secret_name" {
  description = "Fully qualified secret resource name."
  value       = google_secret_manager_secret.this.name
}

output "secret_id" {
  description = "Secret id."
  value       = google_secret_manager_secret.this.secret_id
}
