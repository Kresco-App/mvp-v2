import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { getApiBaseUrl, getApiOrigin, getBackendUrl } from './apiConfig'
import { KRESCO_CSRF_HEADER, clearStoredAuthSession, readCsrfToken, writeCsrfToken } from './authSession'
import { getUnauthorizedDestination } from './authPolicy'

type CsrfConfig = InternalAxiosRequestConfig & {
  headers: InternalAxiosRequestConfig['headers'] & Record<string, string>
}

const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  withCredentials: true,
})

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete'])
const CSRF_EXEMPT_PATHS = new Set([
  '/google-login',
  '/auth/signup',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/logout',
])
let csrfRefreshPromise: Promise<string | null> | null = null

function isCsrfExemptRequest(config: Pick<InternalAxiosRequestConfig, 'url'>) {
  const url = config.url || ''
  try {
    const parsed = new URL(url, 'http://kresco.local')
    return CSRF_EXEMPT_PATHS.has(parsed.pathname.replace(/^\/api/, ''))
  } catch {
    return false
  }
}

export function isAllowedCsrfRequestTarget(
  config: Pick<InternalAxiosRequestConfig, 'baseURL' | 'url'>,
  apiBaseUrl = getApiBaseUrl(),
) {
  const configuredApiOrigin = getApiOrigin(apiBaseUrl)
  const requestBaseUrl = config.baseURL || apiBaseUrl
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://kresco.local'
  try {
    const target = new URL(config.url || '', new URL(requestBaseUrl, browserOrigin))
    if (configuredApiOrigin) return target.origin === configuredApiOrigin
    return target.origin === browserOrigin
  } catch {
    return false
  }
}

async function refreshCsrfToken() {
  if (csrfRefreshPromise) return csrfRefreshPromise

  csrfRefreshPromise = fetch(getBackendUrl('/api/auth/csrf'), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) return null
      const body = await response.json().catch(() => null)
      const token = typeof body?.csrf_token === 'string' ? body.csrf_token : null
      writeCsrfToken(token)
      return token
    })
    .catch(() => null)
    .finally(() => {
      csrfRefreshPromise = null
    })

  return csrfRefreshPromise
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method || 'get').toLowerCase()
  const needsCsrf = UNSAFE_METHODS.has(method) && !isCsrfExemptRequest(config) && isAllowedCsrfRequestTarget(config)
  const csrfToken = needsCsrf ? readCsrfToken() || await refreshCsrfToken() : null
  if (csrfToken) {
    const typedConfig = config as CsrfConfig
    typedConfig.headers = typedConfig.headers || {}
    typedConfig.headers[KRESCO_CSRF_HEADER] = csrfToken
  }
  return config
})

// Global error handler
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/figma-audit')) {
        clearStoredAuthSession()
        window.location.href = getUnauthorizedDestination(window.location.pathname)
      }
    }
    return Promise.reject(error)
  }
)

export default api
