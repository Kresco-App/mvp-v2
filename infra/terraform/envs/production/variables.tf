variable "project_id" {
  type        = string
  description = "Production project id."
  default     = "kresco-prod"
}

variable "project_number" {
  type        = string
  description = "Production project number."
  default     = ""
}

variable "region" {
  type        = string
  description = "Primary production region."
  default     = "europe-southwest1"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository allowed to deploy."
  default     = "Kresco-App/mvp-v2"
}
