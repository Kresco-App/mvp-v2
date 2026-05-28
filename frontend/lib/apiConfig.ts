const DEFAULT_API_BASE_URL = '/api/'
const API_SUFFIX_PATTERN = /\/api\/?$/
const ABSOLUTE_URL_PATTERN = /^(https?:|data:|blob:)/

export function normalizeApiBaseUrl(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return DEFAULT_API_BASE_URL
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
