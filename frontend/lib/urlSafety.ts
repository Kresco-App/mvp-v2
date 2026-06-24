const SAFE_NAVIGATION_PROTOCOLS = new Set(['http:', 'https:'])
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

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

  if (options.allowRelative !== false && isSafeRelativeUrl(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    const allowedProtocols = options.allowMailto ? SAFE_LINK_PROTOCOLS : SAFE_NAVIGATION_PROTOCOLS
    return allowedProtocols.has(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

export function isSafeLinkHref(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return false
  if (trimmed.startsWith('#')) return true
  return Boolean(sanitizeNavigationUrl(trimmed, { allowMailto: true }))
}
