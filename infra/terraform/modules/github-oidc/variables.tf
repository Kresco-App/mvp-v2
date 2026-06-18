variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "project_number" {
  type        = string
  description = "GCP project number."
}

variable "pool_id" {
  type        = string
  description = "Workload identity pool id."
}

variable "provider_id" {
  type        = string
  description = "Workload identity pool provider id."
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/name form."
}

variable "deploy_service_account_id" {
  type        = string
  description = "Deploy service account id."
}

variable "deploy_service_account_display_name" {
  type        = string
  description = "Deploy service account display name."
  default     = "GitHub deployer"
}

variable "project_roles" {
  type        = set(string)
  description = "Project-level IAM roles granted to the deploy service account."
  default     = []
}

variable "operator_token_creator_members" {
  type        = set(string)
  description = "Human/operator members allowed to impersonate the deploy service account."
  default     = []
}
