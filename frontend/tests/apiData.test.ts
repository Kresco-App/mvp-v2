import { describe, expect, it, vi } from 'vitest'

import {
  apiDataErrorMessage,
  apiErrorStatus,
  apiSWRConfig,
  shouldRetryApiError,
} from '@/lib/apiData'

describe('API SWR data policy', () => {
  it('retries transient failures but not auth, forbidden, validation, or not-found responses', () => {
    expect(shouldRetryApiError({ response: { status: 500 } })).toBe(true)
    expect(shouldRetryApiError({ response: { status: 503 } })).toBe(true)
    expect(shouldRetryApiError(new Error('network down'))).toBe(true)

    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetryApiError({ response: { status } })).toBe(false)
    }
  })

  it('caps retry scheduling through the shared SWR config', () => {
    vi.useFakeTimers()
    const revalidate = vi.fn()
    type RetryConfig = { errorRetryCount: number; errorRetryInterval: number }
    const config: RetryConfig = { errorRetryCount: 2, errorRetryInterval: 25 }
    const onErrorRetry = apiSWRConfig.onErrorRetry as (
      error: unknown,
      key: string,
      config: RetryConfig,
      revalidate: (options: { retryCount: number }) => void,
      opts: { retryCount: number; dedupe: boolean },
    ) => void

    onErrorRetry(
      { response: { status: 500 } },
      '/api/example',
      config,
      revalidate,
      { retryCount: 1, dedupe: true },
    )
    vi.advanceTimersByTime(25)
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 1 })

    revalidate.mockClear()
    onErrorRetry(
      { response: { status: 500 } },
      '/api/example',
      config,
      revalidate,
      { retryCount: 2, dedupe: true },
    )
    vi.advanceTimersByTime(25)
    expect(revalidate).not.toHaveBeenCalled()

    revalidate.mockClear()
    onErrorRetry(
      { response: { status: 401 } },
      '/api/example',
      config,
      revalidate,
      { retryCount: 0, dedupe: true },
    )
    vi.advanceTimersByTime(25)
    expect(revalidate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('revalidates SWR data on focus so 401s can recover after auth refresh', () => {
    expect(apiSWRConfig.revalidateOnFocus).toBe(true)
  })

  it('formats API data errors without leaking implementation details', () => {
    expect(apiErrorStatus({ response: { status: 503 } })).toBe(503)
    expect(apiDataErrorMessage({ response: { data: { detail: 'Controlled failure' }, status: 500 } }, 'Fallback')).toBe('Controlled failure')
    expect(apiDataErrorMessage({ response: { status: 500 } }, 'Fallback')).toBe('Fallback (500)')
    expect(apiDataErrorMessage(new Error('Network failed'), 'Fallback')).toBe('Network failed')
  })
})
