output "repository_name" {
  description = "Fully qualified Artifact Registry repository name."
  value       = google_artifact_registry_repository.this.name
}

output "repository_id" {
  description = "Repository id."
  value       = google_artifact_registry_repository.this.repository_id
}
