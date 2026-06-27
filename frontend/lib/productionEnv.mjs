export const REQUIRED_FRONTEND_PRODUCTION_ENV = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_REALTIME_PROVIDER',
  'NEXT_PUBLIC_RELEASE_SHA',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_AUTH_COOKIE_DOMAIN',
]

const LOCAL_HOST_PATTERN = /(^|\.)localhost$|^127\.|^\[?::1\]?$/
const LOCAL_OR_TUNNEL_PATTERN = /localhost|127\.0\.0\.1|\[::1\]|lvh\.me|kresco\.test|ngrok/i

export function validateFrontendProductionEnv(env) {
  const errors = []

  for (const key of REQUIRED_FRONTEND_PRODUCTION_ENV) {
    if (!hasValue(env[key])) {
      errors.push(`${key} must be configured for production frontend deployments.`)
    }
  }

  validateApiBaseUrl(env.NEXT_PUBLIC_API_BASE_URL, env.KRESCO_BACKEND_ORIGIN, env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN, errors)
  validateFirebaseAuthConfig(env, errors)
  validateRealtimeProvider(env, errors)
  validateReleaseSha(env.NEXT_PUBLIC_RELEASE_SHA, errors)
  validateSiteUrl(env.NEXT_PUBLIC_SITE_URL, env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN, errors)
  validateAuthCookieDomain(env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN, errors)
  validateLocalRewritePolicy(env, errors)
  validateLocalDemoFeaturePolicy(env, errors)

  return errors
}

export function parseEnvFile(contents) {
  const env = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const assignment = line.startsWith('export ') ? line.slice(7).trim() : line
    const equalsIndex = assignment.indexOf('=')
    if (equalsIndex <= 0) continue

    const key = assignment.slice(0, equalsIndex).trim()
    const rawValue = assignment.slice(equalsIndex + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    env[key] = unquoteEnvValue(rawValue)
  }
  return env
}

function validateApiBaseUrl(value, backendRewriteOrigin, authCookieDomain, errors) {
  if (!hasValue(value)) return

  const trimmed = value.trim()
  if (trimmed.startsWith('/')) {
    if (trimmed.replace(/\/+$/, '') !== '/api') {
      errors.push('NEXT_PUBLIC_API_BASE_URL must be /api or an absolute HTTPS URL in production.')
    }
    validateBackendRewriteOrigin(backendRewriteOrigin, authCookieDomain, errors)
    return
  }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    errors.push('NEXT_PUBLIC_API_BASE_URL must be a valid absolute URL.')
    return
  }

  if (parsed.protocol !== 'https:') {
    errors.push('NEXT_PUBLIC_API_BASE_URL must use HTTPS in production.')
  }
  if (LOCAL_HOST_PATTERN.test(parsed.hostname) || LOCAL_OR_TUNNEL_PATTERN.test(trimmed)) {
    errors.push('NEXT_PUBLIC_API_BASE_URL must not point to localhost or tunnel origins in production.')
  }
  if (!parsed.pathname.replace(/\/+$/, '').endsWith('/api')) {
    errors.push('NEXT_PUBLIC_API_BASE_URL must include the backend /api path.')
  }
  validateHostWithinAuthCookieDomain(parsed.hostname, authCookieDomain, 'NEXT_PUBLIC_API_BASE_URL', errors)
}

function validateBackendRewriteOrigin(value, authCookieDomain, errors) {
  if (!hasValue(value)) {
    errors.push('KRESCO_BACKEND_ORIGIN must be configured when NEXT_PUBLIC_API_BASE_URL is /api in production.')
    return
  }

  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    errors.push('KRESCO_BACKEND_ORIGIN must be a valid absolute URL.')
    return
  }

  if (parsed.protocol !== 'https:') {
    errors.push('KRESCO_BACKEND_ORIGIN must use HTTPS in production.')
  }
  if (parsed.pathname.replace(/\/+$/, '') !== '' || parsed.search || parsed.hash) {
    errors.push('KRESCO_BACKEND_ORIGIN must be an origin only, without a path, query, or hash.')
  }
  if (LOCAL_HOST_PATTERN.test(parsed.hostname) || LOCAL_OR_TUNNEL_PATTERN.test(value)) {
    errors.push('KRESCO_BACKEND_ORIGIN must not point to localhost or tunnel origins in production.')
  }
  validateHostWithinAuthCookieDomain(parsed.hostname, authCookieDomain, 'KRESCO_BACKEND_ORIGIN', errors)
}

function validateFirebaseAuthConfig(env, errors) {
  validateFirebaseValue('NEXT_PUBLIC_FIREBASE_API_KEY', env.NEXT_PUBLIC_FIREBASE_API_KEY, errors)
  validateFirebaseValue('NEXT_PUBLIC_FIREBASE_PROJECT_ID', env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, errors)
  validateFirebaseValue('NEXT_PUBLIC_FIREBASE_APP_ID', env.NEXT_PUBLIC_FIREBASE_APP_ID, errors)

  const authDomain = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  validateFirebaseValue('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', authDomain, errors)
  if (!hasValue(authDomain)) return

  const trimmed = authDomain.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    errors.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be a hostname, not a URL.')
    return
  }
  if (LOCAL_HOST_PATTERN.test(trimmed) || LOCAL_OR_TUNNEL_PATTERN.test(trimmed)) {
    errors.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must not point to localhost or tunnel origins in production.')
  }
}

function validateFirebaseValue(key, value, errors) {
  if (!hasValue(value)) return
  if (LOCAL_OR_TUNNEL_PATTERN.test(value) || /placeholder|change-me|development|unknown|^null$|^undefined$/i.test(value.trim())) {
    errors.push(`${key} must not use local or placeholder values in production.`)
  }
}

function validateRealtimeProvider(env, errors) {
  const provider = env.NEXT_PUBLIC_REALTIME_PROVIDER?.trim().toLowerCase()
  if (!hasValue(provider)) return
  if (provider !== 'firestore') {
    errors.push('NEXT_PUBLIC_REALTIME_PROVIDER must be firestore in production.')
    return
  }
  validateFirebaseValue('NEXT_PUBLIC_FIRESTORE_DATABASE', env.NEXT_PUBLIC_FIRESTORE_DATABASE, errors)
  if (!hasValue(env.NEXT_PUBLIC_FIRESTORE_DATABASE)) {
    errors.push('NEXT_PUBLIC_FIRESTORE_DATABASE must be configured when NEXT_PUBLIC_REALTIME_PROVIDER is firestore.')
  }
}

function validateReleaseSha(value, errors) {
  if (!hasValue(value)) return
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length < 7 || ['development', 'local', 'unknown', 'placeholder', 'change-me', 'null', 'undefined'].includes(trimmed)) {
    errors.push('NEXT_PUBLIC_RELEASE_SHA must identify the deployed commit or build.')
  }
}

function validateSiteUrl(value, authCookieDomain, errors) {
  if (!hasValue(value)) return

  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    errors.push('NEXT_PUBLIC_SITE_URL must be a valid absolute URL.')
    return
  }

  if (parsed.protocol !== 'https:') {
    errors.push('NEXT_PUBLIC_SITE_URL must use HTTPS in production.')
  }
  if (LOCAL_HOST_PATTERN.test(parsed.hostname) || LOCAL_OR_TUNNEL_PATTERN.test(value)) {
    errors.push('NEXT_PUBLIC_SITE_URL must not point to localhost or tunnel origins in production.')
  }
  validateHostWithinAuthCookieDomain(parsed.hostname, authCookieDomain, 'NEXT_PUBLIC_SITE_URL', errors)
}

function validateAuthCookieDomain(value, errors) {
  if (!hasValue(value)) return

  const trimmed = value.trim().toLowerCase()
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/') || trimmed.includes(':') || /\s/.test(trimmed)) {
    errors.push('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN must be a bare registrable domain such as kresco.ma.')
    return
  }
  if (LOCAL_HOST_PATTERN.test(trimmed) || LOCAL_OR_TUNNEL_PATTERN.test(trimmed)) {
    errors.push('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN must not point to localhost or tunnel domains in production.')
  }
}

function validateHostWithinAuthCookieDomain(hostname, authCookieDomain, key, errors) {
  if (!hasValue(authCookieDomain)) return
  const normalizedHost = hostname.trim().toLowerCase().replace(/\.$/, '')
  const normalizedDomain = authCookieDomain.trim().toLowerCase().replace(/^\./, '').replace(/\.$/, '')
  if (!normalizedHost || !normalizedDomain || normalizedHost === normalizedDomain) return
  if (!normalizedHost.endsWith(`.${normalizedDomain}`)) {
    errors.push(`${key} must stay within NEXT_PUBLIC_AUTH_COOKIE_DOMAIN.`)
  }
}

function validateLocalRewritePolicy(env, errors) {
  if (env.KRESCO_ENABLE_LOCAL_REWRITES === 'true') {
    errors.push('KRESCO_ENABLE_LOCAL_REWRITES must not be true in production frontend deployments.')
  }

  if (hasValue(env.KRESCO_LOCAL_BACKEND_ORIGIN) && LOCAL_OR_TUNNEL_PATTERN.test(env.KRESCO_LOCAL_BACKEND_ORIGIN)) {
    errors.push('KRESCO_LOCAL_BACKEND_ORIGIN must not point to localhost or tunnel origins in production.')
  }
}

function validateLocalDemoFeaturePolicy(env, errors) {
  if (env.NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO === 'true') {
    errors.push('NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO must not be true in production frontend deployments.')
  }

  if (env.KRESCO_ENABLE_LOCAL_IMAGE_HOSTS === 'true') {
    errors.push('KRESCO_ENABLE_LOCAL_IMAGE_HOSTS must not be true in production frontend deployments.')
  }
}

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '' && !['null', 'undefined'].includes(value.trim().toLowerCase())
}

function unquoteEnvValue(value) {
  if (value.length < 2) return value
  const quote = value[0]
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value

  const inner = value.slice(1, -1)
  if (quote === "'") return inner
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}
