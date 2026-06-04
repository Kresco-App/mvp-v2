export const KRESCO_TOKEN_KEY = 'kresco_token'
export const KRESCO_USER_KEY = 'kresco_user'
export const KRESCO_CSRF_KEY = 'kresco_csrf'
export const KRESCO_TOKEN_COOKIE = 'kresco_token'
export const KRESCO_USER_ROLE_COOKIE = 'kresco_user_role'
export const KRESCO_CSRF_COOKIE = 'kresco_csrf'
export const KRESCO_CSRF_HEADER = 'x-csrf-token'
export const KRESCO_COOKIE_SESSION = 'cookie-session'
export const KRESCO_STORED_AUTH_SNAPSHOT = '__kresco_minimal_auth_snapshot'

const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24
const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export type AuthUser = {
  id?: string | number
  email?: string
  full_name?: string
  role?: string
  tier?: string
  niveau?: string
  filiere?: string
  track?: string
  avatar_url?: string
  banner_url?: string
  created_at?: string
  is_staff?: boolean
  is_superuser?: boolean
  is_pro?: boolean
  [key: string]: unknown
}

export type StoredAuthSession = {
  token: typeof KRESCO_COOKIE_SESSION | null
  user: AuthUser | null
}

let csrfTokenCache: string | null = null

export function sanitizeStoredAuthUser(user: AuthUser | null | undefined): AuthUser | null {
  if (!user || typeof user !== 'object') return null

  const snapshot: AuthUser = {
    [KRESCO_STORED_AUTH_SNAPSHOT]: true,
  }
  if (typeof user.role === 'string') snapshot.role = user.role
  if (typeof user.is_staff === 'boolean') snapshot.is_staff = user.is_staff

  return snapshot
}

export function isStoredAuthSnapshot(user: AuthUser | null | undefined) {
  return user?.[KRESCO_STORED_AUTH_SNAPSHOT] === true
}

function readStoredJson<T = unknown>(key: string): T | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
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

export function readCsrfToken() {
  if (csrfTokenCache) return csrfTokenCache
  const cookieToken = readCookie(KRESCO_CSRF_COOKIE)
  if (cookieToken) return cookieToken

  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(KRESCO_CSRF_KEY)
}

export function writeCsrfToken(token?: string | null) {
  csrfTokenCache = token || null
  if (typeof window === 'undefined') return

  if (token) sessionStorage.setItem(KRESCO_CSRF_KEY, token)
  else sessionStorage.removeItem(KRESCO_CSRF_KEY)
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

export function getAuthUserFromJwt(token: string | undefined | null) {
  if (!token) return null

  const payload = decodeJwtPayload(token)
  if (!payload) return null

  return {
    role: typeof payload.role === 'string' ? payload.role : null,
    is_staff: payload.is_staff === true,
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
  document.cookie = `${KRESCO_CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`
  writeCsrfToken(null)
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

  const storedUser = readStoredJson<AuthUser>(KRESCO_USER_KEY)
  const user = sanitizeStoredAuthUser(storedUser)
  if (storedUser && user) {
    const sanitized = JSON.stringify(user)
    if (JSON.stringify(storedUser) !== sanitized) {
      localStorage.setItem(KRESCO_USER_KEY, sanitized)
    }
  } else if (storedUser) {
    localStorage.removeItem(KRESCO_USER_KEY)
  }
  const hasCookieSession = Boolean(readCookie(KRESCO_USER_ROLE_COOKIE))

  return {
    token: hasCookieSession ? KRESCO_COOKIE_SESSION : null,
    user,
  }
}

export function writeStoredAuthSession(user: AuthUser, csrfToken?: string | null) {
  if (typeof window === 'undefined') return

  localStorage.removeItem(KRESCO_TOKEN_KEY)
  const authSnapshot = sanitizeStoredAuthUser(user)
  if (authSnapshot) localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(authSnapshot))
  else localStorage.removeItem(KRESCO_USER_KEY)
  if (csrfToken !== undefined) writeCsrfToken(csrfToken)
}

export function updateStoredAuthUser(user: AuthUser) {
  if (typeof window === 'undefined') return

  localStorage.removeItem(KRESCO_TOKEN_KEY)
  const authSnapshot = sanitizeStoredAuthUser(user)
  if (authSnapshot) localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(authSnapshot))
  else localStorage.removeItem(KRESCO_USER_KEY)
}
