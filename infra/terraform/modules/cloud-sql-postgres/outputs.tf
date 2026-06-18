output "connection_name" {
  description = "Cloud SQL connection name."
  value       = google_sql_database_instance.this.connection_name
}

output "instance_name" {
  description = "Cloud SQL instance name."
  value       = google_sql_database_instance.this.name
}
