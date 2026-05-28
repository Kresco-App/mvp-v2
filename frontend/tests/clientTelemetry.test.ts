// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reportClientError, reportUnknownClientError } from '@/lib/clientTelemetry'

describe('client telemetry reporting', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.documentElement.dataset.release = '0123456789abcdef'
  })

  it('sends bounded frontend error reports with sendBeacon when available', async () => {
    const sendBeacon = vi.fn(() => true)
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })

    reportClientError({
      source: 'next-segment-error',
      message: 'route failed',
      route: '/topics/1',
      digest: 'digest-123',
      stack: 'stack',
    })

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, body] = sendBeacon.mock.calls[0] as unknown as [string, Blob]
    expect(url).toBe('/api/client-errors')
    expect(body).toBeInstanceOf(Blob)
    expect(JSON.parse(await (body as Blob).text())).toMatchObject({
      source: 'next-segment-error',
      message: 'route failed',
      route: '/topics/1',
      digest: 'digest-123',
      release_sha: '0123456789abcdef',
    })
  })

  it('falls back to keepalive fetch when beacon is unavailable', () => {
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }))

    reportUnknownClientError('unhandled-rejection', new Error('promise failed'))

    expect(fetchMock).toHaveBeenCalledWith('/api/client-errors', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    }))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      source: 'unhandled-rejection',
      message: 'promise failed',
    })
  })
})
