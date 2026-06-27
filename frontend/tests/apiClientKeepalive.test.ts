// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { postJsonKeepalive } from '@/lib/apiClient'
import { KRESCO_CSRF_HEADER, writeCsrfToken } from '@/lib/authSession'

beforeEach(() => {
  sessionStorage.clear()
  writeCsrfToken(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  writeCsrfToken(null)
  sessionStorage.clear()
})

describe('apiClient keepalive transport', () => {
  it('posts same-app API requests through fetch keepalive with the stored CSRF token', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response))
    vi.stubGlobal('fetch', fetchMock)
    writeCsrfToken('csrf-token')

    const request = postJsonKeepalive('/courses/topic-items/42/progress', { watched_seconds: 63 })

    await expect(request).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${window.location.origin}/api/courses/topic-items/42/progress`,
      {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          [KRESCO_CSRF_HEADER]: 'csrf-token',
        },
        body: JSON.stringify({ watched_seconds: 63 }),
      },
    )
  })

  it('falls back to the normal transport when keepalive cannot safely attach CSRF', () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response))
    vi.stubGlobal('fetch', fetchMock)

    expect(postJsonKeepalive('/courses/topic-items/42/progress', { watched_seconds: 63 })).toBeNull()
    expect(postJsonKeepalive('https://example.com/progress', { watched_seconds: 63 })).toBeNull()
    expect(postJsonKeepalive('//example.com/progress', { watched_seconds: 63 })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
