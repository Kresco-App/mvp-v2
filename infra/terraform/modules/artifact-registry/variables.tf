variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "location" {
  type        = string
  description = "Artifact Registry location."
}

variable "repository_id" {
  type        = string
  description = "Artifact Registry repository id."
}

variable "description" {
  type        = string
  description = "Repository description."
  default     = "Kresco container images"
}

variable "cleanup_delete_older_than" {
  type        = string
  description = "Delete unprotected images older than this duration."
  default     = "604800s"
}

variable "cleanup_keep_count" {
  type        = number
  description = "Number of most recent image versions to keep."
  default     = 10
}

variable "labels" {
  type        = map(string)
  description = "Labels to apply."
  default     = {}
}
