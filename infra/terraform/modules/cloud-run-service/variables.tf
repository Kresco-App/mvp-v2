variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "location" {
  type        = string
  description = "Cloud Run region."
}

variable "name" {
  type        = string
  description = "Cloud Run service name."
}

variable "image" {
  type        = string
  description = "Bootstrap image. Deploy workflows own day-to-day image changes."
}

variable "service_account_email" {
  type        = string
  description = "Runtime service account email. Null uses the platform default."
  default     = null
}

variable "min_instances" {
  type        = number
  description = "Minimum instance count."
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Maximum instance count."
  default     = 3
}

variable "container_port" {
  type        = number
  description = "Container port."
  default     = 8080
}

variable "env" {
  type        = map(string)
  description = "Plain environment variables."
  default     = {}
}

variable "secret_env" {
  type = map(object({
    secret  = string
    version = string
  }))
  description = "Secret-backed environment variables."
  default     = {}
}

variable "annotations" {
  type        = map(string)
  description = "Template annotations, including Cloud SQL instances when needed."
  default     = {}
}

variable "resource_limits" {
  type        = map(string)
  description = "Container resource limits."
  default = {
    cpu    = "1000m"
    memory = "512Mi"
  }
}

variable "labels" {
  type        = map(string)
  description = "Labels to apply."
  default     = {}
}
