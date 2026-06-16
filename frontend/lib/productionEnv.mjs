export const REQUIRED_FRONTEND_PRODUCTION_ENV = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_ABLY_ENABLED',
  'NEXT_PUBLIC_RELEASE_SHA',
]

const LOCAL_HOST_PATTERN = /(^|\.)localhost$|^127\.|^\[?::1\]?$/
const LOCAL_OR_TUNNEL_PATTERN = /localhost|127\.0\.0\.1|\[::1\]|ngrok/i

export function validateFrontendProductionEnv(env) {
  const errors = []

  for (const key of REQUIRED_FRONTEND_PRODUCTION_ENV) {
    if (!hasValue(env[key])) {
      errors.push(`${key} must be configured for production frontend deployments.`)
    }
  }

  validateApiBaseUrl(env.NEXT_PUBLIC_API_BASE_URL, errors)
  validateFirebaseAuthConfig(env, errors)
  validateRealtimeToggle(env.NEXT_PUBLIC_ABLY_ENABLED, errors)
  validateReleaseSha(env.NEXT_PUBLIC_RELEASE_SHA, errors)
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

function validateApiBaseUrl(value, errors) {
  if (!hasValue(value)) return

  const trimmed = value.trim()
  if (trimmed.startsWith('/')) {
    if (trimmed.replace(/\/+$/, '') !== '/api') {
      errors.push('NEXT_PUBLIC_API_BASE_URL must be /api or an absolute HTTPS URL in production.')
    }
    validateBackendRewriteOrigin(process.env.KRESCO_BACKEND_ORIGIN, errors)
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
}

function validateBackendRewriteOrigin(value, errors) {
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
  if (LOCAL_HOST_PATTERN.test(parsed.hostname) || LOCAL_OR_TUNNEL_PATTERN.test(value)) {
    errors.push('KRESCO_BACKEND_ORIGIN must not point to localhost or tunnel origins in production.')
  }
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
  if (LOCAL_OR_TUNNEL_PATTERN.test(value) || /placeholder|change-me|development|unknown/i.test(value)) {
    errors.push(`${key} must not use local or placeholder values in production.`)
  }
}

function validateRealtimeToggle(value, errors) {
  if (!hasValue(value)) return
  if (value !== 'true') {
    errors.push('NEXT_PUBLIC_ABLY_ENABLED must be true in production.')
  }
}

function validateReleaseSha(value, errors) {
  if (!hasValue(value)) return
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length < 7 || ['development', 'local', 'unknown', 'placeholder', 'change-me'].includes(trimmed)) {
    errors.push('NEXT_PUBLIC_RELEASE_SHA must identify the deployed commit or build.')
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
  return typeof value === 'string' && value.trim() !== ''
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
