resource "google_storage_bucket" "this" {
  project                     = var.project_id
  name                        = var.name
  location                    = var.location
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age            = var.lifecycle_delete_age_days
      matches_prefix = var.lifecycle_delete_prefixes
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
