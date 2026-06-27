import { getApiBaseUrl } from '@/lib/apiConfig'
import { KRESCO_CSRF_HEADER, readCsrfToken } from '@/lib/authSession'

type ApiRequestConfig = Record<string, unknown>
type ApiTransport = typeof import('@/lib/axios').default

let apiTransportPromise: Promise<ApiTransport> | null = null
const inFlightGetJsonRequests = new Map<string, Promise<unknown>>()

async function loadApiTransport() {
  apiTransportPromise ??= import('@/lib/axios').then((mod) => mod.default)
  return apiTransportPromise
}

export async function getJson<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
  const dedupeKey = getJsonDedupeKey(url, config)
  if (dedupeKey) {
    const existing = inFlightGetJsonRequests.get(dedupeKey)
    if (existing) return existing as Promise<T>
  }

  const request = requestJson<T>(url, config)
  if (!dedupeKey) return request

  inFlightGetJsonRequests.set(dedupeKey, request)
  const clearDedupeEntry = () => {
    if (inFlightGetJsonRequests.get(dedupeKey) === request) {
      inFlightGetJsonRequests.delete(dedupeKey)
    }
  }
  void request.then(clearDedupeEntry, clearDedupeEntry)
  return request
}

async function requestJson<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
  const api = await loadApiTransport()
  const { data } = config === undefined
    ? await api.get<T>(url)
    : await api.get<T>(url, config)
  return data
}

export function clearApiClientInFlightRequests() {
  inFlightGetJsonRequests.clear()
}

export async function postJson<T = unknown, Body = unknown>(
  url: string,
  body?: Body,
  config?: ApiRequestConfig,
): Promise<T> {
  const api = await loadApiTransport()
  const { data } = config === undefined
    ? body === undefined
      ? await api.post<T>(url)
      : await api.post<T>(url, body)
    : await api.post<T>(url, body, config)
  return data
}

export function postJsonKeepalive<Body = unknown>(url: string, body?: Body): Promise<boolean> | null {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null

  const requestUrl = keepaliveApiRequestUrl(url)
  if (!requestUrl) return null

  const csrfToken = readCsrfToken()
  if (!csrfToken) return null

  let payload: string | undefined
  try {
    payload = body === undefined ? undefined : JSON.stringify(body)
  } catch {
    return null
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    [KRESCO_CSRF_HEADER]: csrfToken,
  }
  if (payload !== undefined) headers['Content-Type'] = 'application/json'

  try {
    return fetch(requestUrl, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers,
      body: payload,
    }).then((response) => response.ok).catch(() => false)
  } catch {
    return null
  }
}

export async function patchJson<T = unknown, Body = unknown>(
  url: string,
  body?: Body,
  config?: ApiRequestConfig,
): Promise<T> {
  const api = await loadApiTransport()
  const { data } = config === undefined
    ? await api.patch<T>(url, body)
    : await api.patch<T>(url, body, config)
  return data
}

export async function putJson<T = unknown, Body = unknown>(
  url: string,
  body?: Body,
  config?: ApiRequestConfig,
): Promise<T> {
  const api = await loadApiTransport()
  const { data } = config === undefined
    ? await api.put<T>(url, body)
    : await api.put<T>(url, body, config)
  return data
}

export async function deleteJson<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
  const api = await loadApiTransport()
  const { data } = config === undefined
    ? await api.delete<T>(url)
    : await api.delete<T>(url, config)
  return data
}

export const apiJsonClient = {
  async get<T = unknown>(url: string, config?: ApiRequestConfig) {
    return { data: await getJson<T>(url, config) }
  },
  async post<T = unknown, Body = unknown>(url: string, body?: Body, config?: ApiRequestConfig) {
    return { data: await postJson<T, Body>(url, body, config) }
  },
  async patch<T = unknown, Body = unknown>(url: string, body?: Body, config?: ApiRequestConfig) {
    return { data: await patchJson<T, Body>(url, body, config) }
  },
  async put<T = unknown, Body = unknown>(url: string, body?: Body, config?: ApiRequestConfig) {
    return { data: await putJson<T, Body>(url, body, config) }
  },
  async delete<T = unknown>(url: string, config?: ApiRequestConfig) {
    return { data: await deleteJson<T>(url, config) }
  },
}

function getJsonDedupeKey(url: string, config?: ApiRequestConfig) {
  if (config === undefined) return `GET ${url}`
  const serializedConfig = stableSerializeApiConfig(config)
  return serializedConfig ? `GET ${url} ${serializedConfig}` : null
}

function stableSerializeApiConfig(value: unknown): string | null {
  const seen = new WeakSet<object>()

  function normalize(input: unknown): unknown {
    if (input === undefined) return { $type: 'undefined' }
    if (input === null || typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input
    if (typeof input === 'bigint') return input.toString()
    if (typeof input === 'function' || typeof input === 'symbol') return null
    if (input instanceof Date) return input.toISOString()
    if (input instanceof URLSearchParams) return Array.from(input.entries()).sort(([left], [right]) => left.localeCompare(right))
    if (Array.isArray(input)) {
      const normalizedItems = input.map(normalize)
      return normalizedItems.some((item) => item === null) ? null : normalizedItems
    }
    if (typeof input === 'object') {
      if (seen.has(input)) return null
      seen.add(input)
      if (isIndependentRequestConfig(input)) return null

      const entries = Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => {
          const normalizedEntry = normalize(entryValue)
          return normalizedEntry === null ? null : [key, normalizedEntry]
        })

      if (entries.some((entry) => entry === null)) return null
      return Object.fromEntries(entries as Array<[string, unknown]>)
    }

    return null
  }

  const normalized = normalize(value)
  if (normalized === null) return null

  try {
    return JSON.stringify(normalized)
  } catch {
    return null
  }
}

function isIndependentRequestConfig(value: object) {
  const config = value as Record<string, unknown>
  return (
    'signal' in config
    || 'cancelToken' in config
    || 'onDownloadProgress' in config
    || 'onUploadProgress' in config
    || 'adapter' in config
    || 'transformRequest' in config
    || 'transformResponse' in config
  )
}

function keepaliveApiRequestUrl(url: string) {
  if (!url || url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) return null

  try {
    const apiBaseUrl = new URL(getApiBaseUrl(), window.location.origin)
    return new URL(url.replace(/^\/+/, ''), apiBaseUrl).href
  } catch {
    return null
  }
}
