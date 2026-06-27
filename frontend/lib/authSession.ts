export const KRESCO_TOKEN_KEY = 'kresco_token'
export const KRESCO_USER_KEY = 'kresco_user'
export const KRESCO_CSRF_KEY = 'kresco_csrf'
export const KRESCO_TOKEN_COOKIE = 'kresco_token'
export const KRESCO_USER_ROLE_COOKIE = 'kresco_user_role'
export const KRESCO_CSRF_COOKIE = 'kresco_csrf'
export const KRESCO_CSRF_HEADER = 'x-csrf-token'
export const KRESCO_COOKIE_SESSION = 'cookie-session'
export const KRESCO_STORED_AUTH_SNAPSHOT = '__kresco_minimal_auth_snapshot'
export const KRESCO_AUTH_SESSION_EVENT = 'kresco:auth-session'

const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24
const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64URL_INDEX_BY_CHAR = new Map(Array.from(BASE64URL_CHARS, (char, index) => [char, index]))
const STORED_AUTH_SNAPSHOT_KEYS = new Set([
  KRESCO_STORED_AUTH_SNAPSHOT,
  'role',
  'is_staff',
])

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

let csrfTokenCache: string | null | undefined
let cookieCacheSource: string | null = null
let cookieCache = new Map<string, string>()
const storedJsonParseCache = new Map<string, { raw: string; value: unknown }>()

function safeLocalStorageGetItem(key: string) {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSetItem(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, value)
    storedJsonParseCache.delete(key)
  } catch {
    // Storage can be disabled or full; auth falls back to cookie session state.
  }
}

function safeLocalStorageRemoveItem(key: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
    storedJsonParseCache.delete(key)
  } catch {
    // Ignore unavailable storage.
  }
}

function safeSessionStorageGetItem(key: string) {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionStorageSetItem(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Ignore unavailable storage.
  }
}

function safeSessionStorageRemoveItem(key: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore unavailable storage.
  }
}

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

function isSanitizedStoredAuthUser(user: AuthUser | null | undefined) {
  if (!user || typeof user !== 'object' || !isStoredAuthSnapshot(user)) return false

  for (const key of Object.keys(user)) {
    if (!STORED_AUTH_SNAPSHOT_KEYS.has(key)) return false
    if (key === 'role' && typeof user.role !== 'string') return false
    if (key === 'is_staff' && typeof user.is_staff !== 'boolean') return false
  }

  return true
}

function readStoredJson<T = unknown>(key: string): T | null {
  try {
    const raw = safeLocalStorageGetItem(key)
    if (!raw) {
      storedJsonParseCache.delete(key)
      return null
    }

    const cached = storedJsonParseCache.get(key)
    if (cached?.raw === raw) return cached.value as T

    const value = JSON.parse(raw) as T
    storedJsonParseCache.set(key, { raw, value })
    return value
  } catch {
    storedJsonParseCache.delete(key)
    return null
  }
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return null

  const source = document.cookie
  if (cookieCacheSource !== source) {
    cookieCacheSource = source
    cookieCache = new Map()

    for (const part of source.split(';')) {
      const trimmed = part.trim()
      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex <= 0) continue
      cookieCache.set(
        trimmed.slice(0, separatorIndex),
        decodeURIComponent(trimmed.slice(separatorIndex + 1)),
      )
    }
  }

  return cookieCache.get(encodeURIComponent(name)) ?? null
}

export function readCsrfToken() {
  if (csrfTokenCache !== undefined) return csrfTokenCache

  const cookieToken = readCookie(KRESCO_CSRF_COOKIE)
  if (cookieToken) {
    csrfTokenCache = cookieToken
    return cookieToken
  }

  if (typeof window === 'undefined') return null
  csrfTokenCache = safeSessionStorageGetItem(KRESCO_CSRF_KEY)
  return csrfTokenCache
}

export function writeCsrfToken(token?: string | null) {
  csrfTokenCache = token || null
  if (typeof window === 'undefined') return

  if (token) safeSessionStorageSetItem(KRESCO_CSRF_KEY, token)
  else safeSessionStorageRemoveItem(KRESCO_CSRF_KEY)
}

function decodeBase64Url(value: string) {
  let output = ''
  let buffer = 0
  let bits = 0

  for (const char of value) {
    if (char === '=') break

    const index = BASE64URL_INDEX_BY_CHAR.get(char)
    if (index === undefined) return null

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
  writeCsrfToken(null)
  if (typeof document === 'undefined') return

  const secure = getCookieSecureAttribute()
  const domain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim()
  for (const cookieName of [KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE, KRESCO_CSRF_COOKIE]) {
    document.cookie = `${cookieName}=; Path=/; SameSite=Lax; Max-Age=0${secure}`
    if (domain) {
      document.cookie = `${cookieName}=; Path=/; Domain=${domain}; SameSite=Lax; Max-Age=0${secure}`
    }
  }
}

export function clearStoredAuthSession() {
  if (typeof window === 'undefined') return

  safeLocalStorageRemoveItem(KRESCO_TOKEN_KEY)
  safeLocalStorageRemoveItem(KRESCO_USER_KEY)
  clearAuthCookie()
  window.dispatchEvent(new Event(KRESCO_AUTH_SESSION_EVENT))
}

export function readStoredAuthSession(): StoredAuthSession {
  if (typeof window === 'undefined') return { token: null, user: null }

  safeLocalStorageRemoveItem(KRESCO_TOKEN_KEY)

  const storedUser = readStoredJson<AuthUser>(KRESCO_USER_KEY)
  const user = sanitizeStoredAuthUser(storedUser)
  if (storedUser && user) {
    if (!isSanitizedStoredAuthUser(storedUser)) {
      safeLocalStorageSetItem(KRESCO_USER_KEY, JSON.stringify(user))
    }
  } else if (storedUser) {
    safeLocalStorageRemoveItem(KRESCO_USER_KEY)
  }
  const hasCookieSession = Boolean(readCookie(KRESCO_USER_ROLE_COOKIE))

  return {
    token: hasCookieSession ? KRESCO_COOKIE_SESSION : null,
    user,
  }
}

export function writeStoredAuthSession(user: AuthUser, csrfToken?: string | null) {
  if (typeof window === 'undefined') return

  safeLocalStorageRemoveItem(KRESCO_TOKEN_KEY)
  const authSnapshot = sanitizeStoredAuthUser(user)
  if (authSnapshot) safeLocalStorageSetItem(KRESCO_USER_KEY, JSON.stringify(authSnapshot))
  else safeLocalStorageRemoveItem(KRESCO_USER_KEY)
  if (csrfToken !== undefined) writeCsrfToken(csrfToken)
}

export function updateStoredAuthUser(user: AuthUser) {
  if (typeof window === 'undefined') return

  safeLocalStorageRemoveItem(KRESCO_TOKEN_KEY)
  const authSnapshot = sanitizeStoredAuthUser(user)
  if (authSnapshot) safeLocalStorageSetItem(KRESCO_USER_KEY, JSON.stringify(authSnapshot))
  else safeLocalStorageRemoveItem(KRESCO_USER_KEY)
}
