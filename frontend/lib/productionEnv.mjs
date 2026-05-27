export const REQUIRED_FRONTEND_PRODUCTION_ENV = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_ABLY_ENABLED',
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
  validateGoogleClientId(env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, errors)
  validateRealtimeToggle(env.NEXT_PUBLIC_ABLY_ENABLED, errors)
  validateLocalRewritePolicy(env, errors)

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
    errors.push('NEXT_PUBLIC_API_BASE_URL must be an absolute HTTPS URL in production.')
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

function validateGoogleClientId(value, errors) {
  if (!hasValue(value)) return
  if (LOCAL_OR_TUNNEL_PATTERN.test(value)) {
    errors.push('NEXT_PUBLIC_GOOGLE_CLIENT_ID must not use local or tunnel placeholders in production.')
  }
}

function validateRealtimeToggle(value, errors) {
  if (!hasValue(value)) return
  if (value !== 'true') {
    errors.push('NEXT_PUBLIC_ABLY_ENABLED must be true in production.')
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
