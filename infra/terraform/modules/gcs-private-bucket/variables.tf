variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "name" {
  type        = string
  description = "Bucket name."
}

variable "location" {
  type        = string
  description = "Bucket location."
}

variable "lifecycle_delete_age_days" {
  type        = number
  description = "Delete matching objects older than this many days."
  default     = 30
}

variable "lifecycle_delete_prefixes" {
  type        = list(string)
  description = "Prefixes covered by the staging lifecycle cleanup rule."
  default     = []
}

variable "labels" {
  type        = map(string)
  description = "Labels to apply."
  default     = {}
}
