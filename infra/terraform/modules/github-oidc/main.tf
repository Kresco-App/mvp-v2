locals {
  deploy_member = "serviceAccount:${google_service_account.deploy.email}"
  github_member = "principalSet://iam.googleapis.com/projects/${var.project_number}/locations/global/workloadIdentityPools/${var.pool_id}/attribute.repository/${var.github_repository}"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = var.pool_id
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.provider_id
  display_name                       = "GitHub Actions"
  attribute_condition                = "assertion.repository=='${var.github_repository}'"

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.ref"         = "assertion.ref"
    "attribute.environment" = "assertion.environment"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deploy" {
  project      = var.project_id
  account_id   = var.deploy_service_account_id
  display_name = var.deploy_service_account_display_name
}

resource "google_service_account_iam_member" "github_workload_identity_user" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.github_member
}

resource "google_service_account_iam_member" "operator_token_creator" {
  for_each = var.operator_token_creator_members

  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = each.value
}

resource "google_project_iam_member" "deploy_project_roles" {
  for_each = var.project_roles

  project = var.project_id
  role    = each.value
  member  = local.deploy_member
}
