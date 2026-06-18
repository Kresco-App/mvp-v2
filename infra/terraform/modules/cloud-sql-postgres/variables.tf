variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "name" {
  type        = string
  description = "Cloud SQL instance name."
}

variable "region" {
  type        = string
  description = "Cloud SQL region."
}

variable "database_version" {
  type        = string
  description = "Postgres database version."
  default     = "POSTGRES_16"
}

variable "tier" {
  type        = string
  description = "Cloud SQL machine tier."
}

variable "availability_type" {
  type        = string
  description = "ZONAL for staging cost control, REGIONAL when explicitly approved."
  default     = "ZONAL"
}

variable "activation_policy" {
  type        = string
  description = "NEVER keeps staging stopped outside deploy/test windows."
  default     = "NEVER"
}

variable "disk_size_gb" {
  type        = number
  description = "Data disk size in GB."
  default     = 20
}

variable "deletion_protection" {
  type        = bool
  description = "Protect the instance from Terraform destroy."
  default     = true
}
