const SAFE_NAVIGATION_PROTOCOLS = new Set(['http:', 'https:'])
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const URL_SAFETY_CACHE_MAX = 512
const sanitizedNavigationUrlCache = new Map<string, string>()

type UrlSafetyOptions = {
  allowMailto?: boolean
  allowRelative?: boolean
}

export function isSafeRelativeUrl(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')
}

export function sanitizeNavigationUrl(value?: string | null, options: UrlSafetyOptions = {}) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''

  const cacheKey = urlSafetyCacheKey(trimmed, options)
  const cached = sanitizedNavigationUrlCache.get(cacheKey)
  if (cached !== undefined) return cached

  if (options.allowRelative !== false && isSafeRelativeUrl(trimmed)) {
    return rememberSanitizedNavigationUrl(cacheKey, trimmed)
  }

  try {
    const url = new URL(trimmed)
    const allowedProtocols = options.allowMailto ? SAFE_LINK_PROTOCOLS : SAFE_NAVIGATION_PROTOCOLS
    return rememberSanitizedNavigationUrl(cacheKey, allowedProtocols.has(url.protocol) ? url.toString() : '')
  } catch {
    return rememberSanitizedNavigationUrl(cacheKey, '')
  }
}

export function isSafeLinkHref(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return false
  if (trimmed.startsWith('#')) return true
  return Boolean(sanitizeNavigationUrl(trimmed, { allowMailto: true }))
}

function urlSafetyCacheKey(value: string, options: UrlSafetyOptions) {
  return `${options.allowMailto === true ? 'mailto' : 'nav'}:${options.allowRelative === false ? 'absolute' : 'relative'}:${value}`
}

function rememberSanitizedNavigationUrl(cacheKey: string, value: string) {
  if (sanitizedNavigationUrlCache.size >= URL_SAFETY_CACHE_MAX) {
    const first = sanitizedNavigationUrlCache.keys().next().value
    if (first !== undefined) sanitizedNavigationUrlCache.delete(first)
  }

  sanitizedNavigationUrlCache.set(cacheKey, value)
  return value
}
