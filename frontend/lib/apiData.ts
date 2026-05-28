import type { SWRConfiguration } from 'swr'
import { getJson } from '@/lib/apiClient'

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422])
export const API_DATA_ERROR_RETRY_COUNT = 2
export const API_DATA_ERROR_RETRY_INTERVAL_MS = 1500

export async function apiSWRFetcher<T = unknown>(url: string): Promise<T> {
  return getJson<T>(url)
}

export function apiErrorStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown }; status?: unknown })?.response?.status
    ?? (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : undefined
}

export function shouldRetryApiError(error: unknown) {
  const status = apiErrorStatus(error)
  if (status && NON_RETRYABLE_STATUSES.has(status)) return false
  return true
}

export function apiDataErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as { response?: { data?: { detail?: unknown; message?: unknown }; status?: number } }
  const detail = maybeError?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  const message = maybeError?.response?.data?.message
  if (typeof message === 'string' && message.trim()) return message
  const status = apiErrorStatus(error)
  if (status) return `${fallback} (${status})`
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export const apiSWRConfig: SWRConfiguration = {
  fetcher: apiSWRFetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 5000,
  errorRetryCount: API_DATA_ERROR_RETRY_COUNT,
  errorRetryInterval: API_DATA_ERROR_RETRY_INTERVAL_MS,
  onErrorRetry: (error, _key, config, revalidate, { retryCount }) => {
    if (!shouldRetryApiError(error)) return
    const maxRetries = config.errorRetryCount ?? API_DATA_ERROR_RETRY_COUNT
    if (retryCount >= maxRetries) return

    setTimeout(() => {
      revalidate({ retryCount })
    }, config.errorRetryInterval ?? API_DATA_ERROR_RETRY_INTERVAL_MS)
  },
}
