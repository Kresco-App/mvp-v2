const LOCAL_API_BASE_URL = '/api/'
const API_SUFFIX_PATTERN = /\/api\/?$/
const ABSOLUTE_URL_PATTERN = /^https?:/

export function defaultApiBaseUrl() {
  // Default to same-origin (/api/) in every environment. A cross-site backend
  // (e.g. a cross-site staging backend) must be opted into explicitly via
  // NEXT_PUBLIC_API_BASE_URL, because cross-site cookie auth requires the auth
  // cookie to be SameSite=None — silently defaulting there 401s after login.
  return LOCAL_API_BASE_URL
}

export function normalizeApiBaseUrl(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return defaultApiBaseUrl()
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

export function getApiBaseUrl(envValue = process.env.NEXT_PUBLIC_API_BASE_URL) {
  return normalizeApiBaseUrl(envValue)
}

export function getApiOrigin(envValue = process.env.NEXT_PUBLIC_API_BASE_URL) {
  const baseUrl = getApiBaseUrl(envValue)
  if (baseUrl.startsWith('/')) return ''
  return baseUrl.replace(API_SUFFIX_PATTERN, '').replace(/\/$/, '')
}

export function getBackendUrl(path: string, envValue = process.env.NEXT_PUBLIC_API_BASE_URL) {
  if (!path) return getApiOrigin(envValue)
  if (ABSOLUTE_URL_PATTERN.test(path)) return path

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const origin = getApiOrigin(envValue)
  return origin ? `${origin}${normalizedPath}` : normalizedPath
}

export function getAdminRootUrl(envValue = process.env.NEXT_PUBLIC_API_BASE_URL) {
  return getBackendUrl('/admin', envValue)
}
