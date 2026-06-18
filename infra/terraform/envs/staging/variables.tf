variable "project_id" {
  type        = string
  description = "Staging project id."
  default     = "kresco-staging"
}

variable "project_number" {
  type        = string
  description = "Staging project number."
  default     = "760338563763"
}

variable "region" {
  type        = string
  description = "Primary staging region."
  default     = "europe-southwest1"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository allowed to deploy."
  default     = "Kresco-App/mvp-v2"
}

variable "operator_token_creator_members" {
  type        = set(string)
  description = "Human/operator IAM members allowed to impersonate the deploy service account."
  default     = []
}
