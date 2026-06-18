output "bucket_name" {
  description = "Bucket name."
  value       = google_storage_bucket.this.name
}

output "bucket_url" {
  description = "gs:// URL for the bucket."
  value       = google_storage_bucket.this.url
}
