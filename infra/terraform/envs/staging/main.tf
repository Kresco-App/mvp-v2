locals {
  labels = {
    app         = "kresco"
    environment = "staging"
    managed_by  = "terraform-import-first"
  }

  runtime_secret_name      = "kresco-runtime"
  cloud_sql_instance       = "kresco-staging-postgres"
  cloud_sql_connection     = "${var.project_id}:${var.region}:${local.cloud_sql_instance}"
  backend_bootstrap_image  = "${var.region}-docker.pkg.dev/${var.project_id}/kresco-containers/kresco-backend:bootstrap"
  frontend_bootstrap_image = "${var.region}-docker.pkg.dev/${var.project_id}/kresco-containers/kresco-frontend:bootstrap"
}

module "artifact_registry" {
  source = "../../modules/artifact-registry"

  project_id    = var.project_id
  location      = var.region
  repository_id = "kresco-containers"
  labels        = local.labels
}

module "runtime_secret" {
  source = "../../modules/secret-manager"

  project_id = var.project_id
  secret_id  = local.runtime_secret_name
  labels     = local.labels
}

module "media_bucket" {
  source = "../../modules/gcs-private-bucket"

  project_id                = var.project_id
  name                      = "kresco-staging-private-media"
  location                  = "EUROPE-SOUTHWEST1"
  lifecycle_delete_prefixes = ["staging/"]
  labels                    = local.labels
}

module "cloud_sql" {
  source = "../../modules/cloud-sql-postgres"

  project_id        = var.project_id
  name              = local.cloud_sql_instance
  region            = var.region
  tier              = "db-custom-1-3840"
  availability_type = "ZONAL"
  activation_policy = "NEVER"
  disk_size_gb      = 20
}

module "github_oidc" {
  source = "../../modules/github-oidc"

  project_id                          = var.project_id
  project_number                      = var.project_number
  pool_id                             = "github-kresco"
  provider_id                         = "github"
  github_repository                   = var.github_repository
  deploy_service_account_id           = "github-deployer"
  operator_token_creator_members      = var.operator_token_creator_members
  deploy_service_account_display_name = "GitHub deployer"
  project_roles = [
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.editor",
    "roles/cloudsql.admin",
    "roles/datastore.user",
    "roles/iam.serviceAccountUser",
    "roles/run.admin",
    "roles/secretmanager.admin",
    "roles/secretmanager.secretAccessor",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/storage.admin",
    "roles/storage.objectAdmin",
  ]
}

module "backend_service" {
  source = "../../modules/cloud-run-service"

  project_id = var.project_id
  location   = var.region
  name       = "kresco-backend-staging"
  image      = local.backend_bootstrap_image
  labels     = local.labels
  annotations = {
    "run.googleapis.com/cloudsql-instances" = local.cloud_sql_connection
  }
  env = {
    KRESCO_ENV                     = "staging"
    KRESCO_RELEASE_SHA             = "terraform-placeholder"
    KRESCO_GCP_RUNTIME_SECRET_NAME = "projects/${var.project_id}/secrets/${local.runtime_secret_name}/versions/latest"
    DATABASE_CONNECTION_STRATEGY   = "cloud_sql"
    GOOGLE_CLOUD_PROJECT           = var.project_id
    GCP_PROJECT_ID                 = var.project_id
    GCP_REGION                     = var.region
    FIRESTORE_DATABASE             = "(default)"
  }
}

module "frontend_service" {
  source = "../../modules/cloud-run-service"

  project_id = var.project_id
  location   = var.region
  name       = "kresco-frontend-staging"
  image      = local.frontend_bootstrap_image
  labels     = local.labels
  env = {
    KRESCO_BACKEND_ORIGIN         = "https://kresco-backend-staging-mlrqm5mqgq-no.a.run.app"
    NEXT_PUBLIC_API_BASE_URL      = "/api"
    NEXT_PUBLIC_REALTIME_PROVIDER = "firestore"
    NEXT_PUBLIC_RELEASE_SHA       = "terraform-placeholder"
  }
}
