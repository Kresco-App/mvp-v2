import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  liveSessionChannelName,
  offeringNotificationsChannelName,
  professorInboxChannelName,
  userNotificationsChannelName,
  userPresenceChannelName,
} from '@/lib/ably'

const originalAblyEnabled = process.env.NEXT_PUBLIC_ABLY_ENABLED

function restoreAblyEnabled() {
  if (originalAblyEnabled === undefined) {
    delete process.env.NEXT_PUBLIC_ABLY_ENABLED
    return
  }
  process.env.NEXT_PUBLIC_ABLY_ENABLED = originalAblyEnabled
}

function stubBrowserTimers() {
  vi.stubGlobal('window', {
    clearInterval: globalThis.clearInterval.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    dispatchEvent: vi.fn(),
    setInterval: globalThis.setInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
  })
}

async function importAblyWithRealtimeMock(initialState: string, subscribeImpl?: () => Promise<void>) {
  const connectionListeners = new Set<(change: { current: string }) => void>()
  const channel = {
    subscribe: vi.fn(subscribeImpl ?? (() => new Promise<void>(() => undefined))),
    unsubscribe: vi.fn(),
  }
  const realtimeInstances: Array<{
    auth: { authorize: ReturnType<typeof vi.fn> }
    channels: { get: ReturnType<typeof vi.fn> }
    close: ReturnType<typeof vi.fn>
    connection: {
      off: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
      state: string
    }
    emitConnection: (current: string) => void
  }> = []

  class Realtime {
    auth = { authorize: vi.fn() }
    channels = { get: vi.fn(() => channel) }
    close = vi.fn()
    connection = {
      off: vi.fn((listener: (change: { current: string }) => void) => {
        connectionListeners.delete(listener)
      }),
      on: vi.fn((_events: string[], listener: (change: { current: string }) => void) => {
        connectionListeners.add(listener)
      }),
      state: initialState,
    }

    constructor() {
      realtimeInstances.push(this)
    }

    emitConnection(current: string) {
      this.connection.state = current
      Array.from(connectionListeners).forEach((listener) => listener({ current }))
    }
  }

  vi.doMock('ably', () => ({ Realtime }))

  return {
    channel,
    getRealtime: () => realtimeInstances[0],
    mod: await import('@/lib/ably'),
  }
}

afterEach(() => {
  restoreAblyEnabled()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('ably')
  vi.resetModules()
})

describe('Ably channel naming', () => {
  it('keeps backend and frontend channel names aligned', () => {
    expect(userNotificationsChannelName(42)).toBe('kresco:user:42:notifications')
    expect(userPresenceChannelName(42)).toBe('kresco:user:42:presence')
    expect(professorInboxChannelName(7)).toBe('kresco:professor:7:inbox')
    expect(offeringNotificationsChannelName(99)).toBe('kresco:offering:99:notifications')
    expect(liveSessionChannelName(123)).toBe('kresco:live:123')
  })

  it('does not silently swallow async subscription failures', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/ably.ts'), 'utf8')

    expect(source).toContain('reportRealtimeAsyncFailure')
    expect(source).not.toContain('.catch(() => undefined)')
  })

  it('keeps local realtime opt-in when the public flag is omitted', async () => {
    delete process.env.NEXT_PUBLIC_ABLY_ENABLED
    vi.resetModules()

    const { isKrescoRealtimeEnabled } = await import('@/lib/ably')

    expect(isKrescoRealtimeEnabled()).toBe(false)
  })

  it('disables realtime retries for the session after token service misconfiguration', async () => {
    process.env.NEXT_PUBLIC_ABLY_ENABLED = 'true'
    stubBrowserTimers()
    vi.resetModules()

    const closeMock = vi.fn()
    type AuthCallback = (
      tokenParams: unknown,
      callback: (error: string | null, token: string | null) => void,
    ) => Promise<void>
    const authCallbackRef: { current?: AuthCallback } = {}
    vi.doMock('@/lib/apiClient', () => ({
      getJson: vi.fn(() => Promise.reject({ response: { status: 503 } })),
    }))
    vi.doMock('ably', () => ({
      Realtime: class {
        auth = { authorize: vi.fn() }
        channels = { get: vi.fn() }
        close = closeMock
        connection = { off: vi.fn(), on: vi.fn(), state: 'connecting' }

        constructor(options: { authCallback: AuthCallback }) {
          authCallbackRef.current = options.authCallback
        }
      },
    }))

    const { getKrescoRealtime, isKrescoRealtimeEnabled } = await import('@/lib/ably')
    expect(getKrescoRealtime()).not.toBeNull()

    const registeredAuthCallback = authCallbackRef.current
    if (!registeredAuthCallback) throw new Error('Ably auth callback was not registered')
    await registeredAuthCallback({}, vi.fn())

    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(isKrescoRealtimeEnabled()).toBe(false)
    expect(getKrescoRealtime()).toBeNull()
  })

  it('supports fallback polling for multi-channel subscriptions', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/ably.ts'), 'utf8')
    const helperStart = source.indexOf('export function subscribeKrescoRealtimeChannels')
    const helperSource = source.slice(helperStart)

    expect(helperSource).toContain('fallback?: RealtimeFallback')
    expect(helperSource).toContain('startFallback?.(false)')
    expect(helperSource).toContain('startFallback?.(true)')
    expect(helperSource).toContain("change.current === 'suspended' || change.current === 'failed'")
    expect(helperSource).toContain('scheduleSubscribeRetry')
    expect(helperSource).toContain('subscribedChannelNames')
    expect(helperSource).toContain("operation: 'subscribe-channel'")
    expect(helperSource).toContain("operation: 'subscribe-channels-retry'")
  })

  it('runs fallback polling without an immediate call when realtime is disabled', async () => {
    vi.useFakeTimers()
    stubBrowserTimers()
    process.env.NEXT_PUBLIC_ABLY_ENABLED = 'false'
    vi.resetModules()

    const { subscribeKrescoRealtime } = await import('@/lib/ably')
    const poll = vi.fn()
    const cleanup = subscribeKrescoRealtime({
      channelName: 'kresco:test',
      fallback: { intervalMs: 1000, poll },
      onMessage: vi.fn(),
    })

    expect(poll).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)

    cleanup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('runs fallback immediately on suspended multi-channel realtime and stops it on reconnect', async () => {
    vi.useFakeTimers()
    stubBrowserTimers()
    process.env.NEXT_PUBLIC_ABLY_ENABLED = 'true'
    vi.resetModules()

    const { getRealtime, mod } = await importAblyWithRealtimeMock('suspended', () => Promise.resolve())
    const poll = vi.fn()
    const cleanup = mod.subscribeKrescoRealtimeChannels({
      channelNames: ['kresco:test:a', 'kresco:test:b'],
      fallback: { intervalMs: 1000, poll },
      onMessage: vi.fn(),
    })

    expect(poll).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(2)

    const realtime = getRealtime()
    realtime.emitConnection('connected')
    expect(poll).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(3)

    cleanup()
    realtime.emitConnection('failed')
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('retries failed multi-channel subscriptions', async () => {
    vi.useFakeTimers()
    stubBrowserTimers()
    process.env.NEXT_PUBLIC_ABLY_ENABLED = 'true'
    vi.resetModules()

    let subscribeCalls = 0
    const { channel, mod } = await importAblyWithRealtimeMock('connected', () => {
      subscribeCalls += 1
      return subscribeCalls === 2
        ? Promise.reject(new Error('subscribe failed'))
        : Promise.resolve()
    })
    const poll = vi.fn()
    const cleanup = mod.subscribeKrescoRealtimeChannels({
      channelNames: ['kresco:test:a', 'kresco:test:b'],
      fallback: { intervalMs: 1000, poll },
      onMessage: vi.fn(),
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(channel.subscribe).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1000)

    expect(channel.subscribe).toHaveBeenCalledTimes(3)

    cleanup()
  })

  it('retries failed single-channel subscriptions while fallback polling covers the gap', async () => {
    vi.useFakeTimers()
    stubBrowserTimers()
    process.env.NEXT_PUBLIC_ABLY_ENABLED = 'true'
    vi.resetModules()

    let subscribeCalls = 0
    const { channel, mod } = await importAblyWithRealtimeMock('connected', () => {
      subscribeCalls += 1
      return subscribeCalls === 1
        ? Promise.reject(new Error('subscribe failed'))
        : Promise.resolve()
    })
    const poll = vi.fn()
    const cleanup = mod.subscribeKrescoRealtime({
      channelName: 'kresco:test',
      fallback: { intervalMs: 1000, poll },
      onMessage: vi.fn(),
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(channel.subscribe).toHaveBeenCalledTimes(1)
    expect(poll).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()

    expect(channel.subscribe).toHaveBeenCalledTimes(2)
    const pollCountAfterRetry = poll.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(pollCountAfterRetry)

    cleanup()
  })

  it('unsubscribes when single-channel cleanup wins an in-flight subscribe', async () => {
    vi.useFakeTimers()
    stubBrowserTimers()
    process.env.NEXT_PUBLIC_ABLY_ENABLED = 'true'
    vi.resetModules()

    const subscribeControl: { resolve: () => void } = {
      resolve: () => {
        throw new Error('subscribe resolver was not captured')
      },
    }
    const { channel, mod } = await importAblyWithRealtimeMock('connected', () => new Promise<void>((resolve) => {
      subscribeControl.resolve = resolve
    }))
    const onMessage = vi.fn()
    const cleanup = mod.subscribeKrescoRealtime({
      channelName: 'kresco:test',
      onMessage,
    })

    await Promise.resolve()
    expect(channel.subscribe).toHaveBeenCalledTimes(1)
    cleanup()
    subscribeControl.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(channel.unsubscribe).toHaveBeenCalledTimes(2)
    expect(channel.unsubscribe).toHaveBeenNthCalledWith(1, onMessage)
    expect(channel.unsubscribe).toHaveBeenNthCalledWith(2, onMessage)
  })

  it('cleans up single-channel realtime listeners and subscriptions', async () => {
    vi.useFakeTimers()
    stubBrowserTimers()
    process.env.NEXT_PUBLIC_ABLY_ENABLED = 'true'
    vi.resetModules()

    const { channel, getRealtime, mod } = await importAblyWithRealtimeMock('connected')
    const onMessage = vi.fn()
    const poll = vi.fn()
    const cleanup = mod.subscribeKrescoRealtime({
      channelName: 'kresco:test',
      fallback: { intervalMs: 1000, poll },
      onMessage,
    })

    cleanup()

    const realtime = getRealtime()
    expect(realtime.connection.off).toHaveBeenCalledTimes(1)
    expect(channel.unsubscribe).toHaveBeenCalledWith(onMessage)

    realtime.emitConnection('failed')
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).not.toHaveBeenCalled()
  })
})
