resource "google_artifact_registry_repository" "this" {
  project       = var.project_id
  location      = var.location
  repository_id = var.repository_id
  description   = var.description
  format        = "DOCKER"
  labels        = var.labels

  cleanup_policies {
    id     = "delete-old-images"
    action = "DELETE"

    condition {
      older_than = var.cleanup_delete_older_than
    }
  }

  cleanup_policies {
    id     = "keep-latest-10"
    action = "KEEP"

    most_recent_versions {
      keep_count = var.cleanup_keep_count
    }
  }
}
