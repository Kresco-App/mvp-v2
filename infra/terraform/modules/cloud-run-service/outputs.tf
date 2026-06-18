output "service_name" {
  description = "Cloud Run service name."
  value       = google_cloud_run_v2_service.this.name
}

output "service_uri" {
  description = "Cloud Run service URI."
  value       = google_cloud_run_v2_service.this.uri
}
