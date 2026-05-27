export const KRESCO_TOKEN_KEY = 'kresco_token'
export const KRESCO_USER_KEY = 'kresco_user'
export const KRESCO_TOKEN_COOKIE = 'kresco_token'
export const KRESCO_USER_ROLE_COOKIE = 'kresco_user_role'
export const KRESCO_COOKIE_SESSION = 'cookie-session'

const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24
const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export type StoredAuthSession = {
  token: typeof KRESCO_COOKIE_SESSION | null
  user: Record<string, unknown> | null
}

function readStoredJson(key: string) {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return null

  const prefix = `${encodeURIComponent(name)}=`
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null
}

function decodeBase64Url(value: string) {
  let output = ''
  let buffer = 0
  let bits = 0

  for (const char of value) {
    if (char === '=') break

    const index = BASE64URL_CHARS.indexOf(char)
    if (index === -1) return null

    buffer = (buffer << 6) | index
    bits += 6

    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }

  try {
    return decodeURIComponent(
      Array.from(output, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    )
  } catch {
    return output
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1]
  if (!payload) return null

  const decoded = decodeBase64Url(payload)
  if (decoded) {
    try {
      return JSON.parse(decoded)
    } catch {
      return null
    }
  }

  try {
    if (typeof Buffer !== 'undefined') {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    }
  } catch {
    return null
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

export function isJwtExpired(token: string, nowMs = Date.now()) {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp

  return typeof exp !== 'number' || exp * 1000 <= nowMs
}

export function getTokenCookieMaxAgeSeconds(token: string, nowMs = Date.now()) {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp

  if (typeof exp !== 'number') return DEFAULT_COOKIE_MAX_AGE_SECONDS

  return Math.max(0, Math.floor(exp - nowMs / 1000))
}

function getCookieSecureAttribute() {
  if (typeof document === 'undefined') return ''
  return window.location.protocol === 'https:' ? '; Secure' : ''
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return

  const secure = getCookieSecureAttribute()
  document.cookie = `${KRESCO_TOKEN_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`
  document.cookie = `${KRESCO_USER_ROLE_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`
}

export function clearStoredAuthSession() {
  if (typeof window === 'undefined') return

  localStorage.removeItem(KRESCO_TOKEN_KEY)
  localStorage.removeItem(KRESCO_USER_KEY)
  clearAuthCookie()
}

export function readStoredAuthSession(): StoredAuthSession {
  if (typeof window === 'undefined') return { token: null, user: null }

  localStorage.removeItem(KRESCO_TOKEN_KEY)

  const user = readStoredJson(KRESCO_USER_KEY)
  const hasCookieSession = Boolean(user || readCookie(KRESCO_USER_ROLE_COOKIE))

  return {
    token: hasCookieSession ? KRESCO_COOKIE_SESSION : null,
    user,
  }
}

export function writeStoredAuthSession(user: Record<string, unknown>) {
  if (typeof window === 'undefined') return

  localStorage.removeItem(KRESCO_TOKEN_KEY)
  localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(user))
}

export function updateStoredAuthUser(user: Record<string, unknown>) {
  if (typeof window === 'undefined') return

  localStorage.removeItem(KRESCO_TOKEN_KEY)
  localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(user))
}
