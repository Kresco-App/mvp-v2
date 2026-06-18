variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "secret_id" {
  type        = string
  description = "Secret Manager secret id."
}

variable "accessor_members" {
  type        = set(string)
  description = "IAM members granted secret accessor on this secret."
  default     = []
}

variable "labels" {
  type        = map(string)
  description = "Labels to apply."
  default     = {}
}
