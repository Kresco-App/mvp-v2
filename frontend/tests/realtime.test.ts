import { afterEach, describe, expect, it, vi } from 'vitest'

const originalRealtimeProvider = process.env.NEXT_PUBLIC_REALTIME_PROVIDER
const originalFirestoreDatabase = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE

function restoreEnv() {
  if (originalRealtimeProvider === undefined) delete process.env.NEXT_PUBLIC_REALTIME_PROVIDER
  else process.env.NEXT_PUBLIC_REALTIME_PROVIDER = originalRealtimeProvider

  if (originalFirestoreDatabase === undefined) delete process.env.NEXT_PUBLIC_FIRESTORE_DATABASE
  else process.env.NEXT_PUBLIC_FIRESTORE_DATABASE = originalFirestoreDatabase
}

type SnapshotCallback = (snapshot: {
  docChanges: () => Array<{ type: string; doc: { id: string; data: () => Record<string, unknown> } }>
}) => void

function mockFirebaseRealtime({ configured = true } = {}) {
  const unsubscribe = vi.fn()
  const snapshots: SnapshotCallback[] = []
  const collectionMock = vi.fn((...args: unknown[]) => ({ kind: 'collection', args }))
  const firestore = {}

  vi.doMock('@/lib/firebaseConfig', () => ({
    firebasePublicAuthConfig: vi.fn(() => (configured
      ? {
        apiKey: 'api-key',
        appId: 'app-id',
        authDomain: 'kresco.firebaseapp.com',
        projectId: 'kresco',
      }
      : null)),
  }))
  vi.doMock('@/lib/firebaseApp', () => ({
    getFirebaseApp: vi.fn(() => ({ name: 'kresco-web' })),
  }))
  vi.doMock('@firebase/firestore', () => ({
    collection: collectionMock,
    getFirestore: vi.fn(() => firestore),
    limitToLast: vi.fn((count: number) => ({ kind: 'limitToLast', count })),
    onSnapshot: vi.fn((_query: unknown, next: SnapshotCallback) => {
      snapshots.push(next)
      return unsubscribe
    }),
    orderBy: vi.fn((field: string) => ({ kind: 'orderBy', field })),
    query: vi.fn((...args: unknown[]) => ({ kind: 'query', args })),
  }))

  return { collectionMock, firestore, snapshots, unsubscribe }
}

afterEach(() => {
  restoreEnv()
  vi.clearAllMocks()
  vi.resetModules()
  vi.useRealTimers()
  vi.doUnmock('@/lib/apiClient')
  vi.doUnmock('@/lib/firebaseApp')
  vi.doUnmock('@/lib/firebaseConfig')
  vi.doUnmock('@firebase/firestore')
})

describe('Firestore realtime facade', () => {
  it('builds stable channel names', async () => {
    const {
      liveSessionChannelName,
      offeringNotificationsChannelName,
      professorInboxChannelName,
      userNotificationsChannelName,
      userPresenceChannelName,
    } = await import('@/lib/realtime')

    expect(userNotificationsChannelName(123)).toBe('kresco:user:123:notifications')
    expect(userPresenceChannelName(123)).toBe('kresco:user:123:presence')
    expect(professorInboxChannelName(123)).toBe('kresco:professor:123:inbox')
    expect(offeringNotificationsChannelName(456)).toBe('kresco:offering:456:notifications')
    expect(liveSessionChannelName(789)).toBe('kresco:live:789')
  })

  it('uses Firestore only when Firebase public config is present', async () => {
    vi.resetModules()
    mockFirebaseRealtime({ configured: false })

    const { getKrescoRealtimeProvider, isKrescoRealtimeEnabled } = await import('@/lib/realtime')

    expect(getKrescoRealtimeProvider()).toBe('disabled')
    expect(isKrescoRealtimeEnabled()).toBe(false)
  })

  it('subscribes to Firestore channel event documents', async () => {
    process.env.NEXT_PUBLIC_REALTIME_PROVIDER = 'firestore'
    process.env.NEXT_PUBLIC_FIRESTORE_DATABASE = '(default)'
    vi.resetModules()
    const { collectionMock, firestore, snapshots, unsubscribe } = mockFirebaseRealtime()

    const { subscribeKrescoRealtime } = await import('@/lib/realtime')
    const onMessage = vi.fn()
    const cleanup = subscribeKrescoRealtime({
      channelName: 'kresco:user:1:notifications',
      onMessage,
    })

    await waitFor(() => {
      expect(collectionMock).toHaveBeenCalledWith(
        firestore,
        'realtimeChannels',
        'kresco%3Auser%3A1%3Anotifications',
        'events',
      )
    })
    expect(snapshots).toHaveLength(1)

    snapshots[0]({ docChanges: () => [] })
    snapshots[0]({
      docChanges: () => [{
        type: 'added',
        doc: {
          id: 'event-1',
          data: () => ({
            name: 'live.interaction.created',
            data: { id: 123 },
            createdAt: { toMillis: () => 456 },
          }),
        },
      }],
    })

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: { id: 123 },
      id: 'event-1',
      name: 'live.interaction.created',
      timestamp: 456,
    }))

    cleanup()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('deduplicates multi-channel Firestore subscriptions and cleans them up', async () => {
    process.env.NEXT_PUBLIC_REALTIME_PROVIDER = 'firestore'
    vi.resetModules()
    const { collectionMock, unsubscribe } = mockFirebaseRealtime()

    const { subscribeKrescoRealtimeChannels } = await import('@/lib/realtime')
    const cleanup = subscribeKrescoRealtimeChannels({
      channelNames: ['kresco:test:a', 'kresco:test:b', 'kresco:test:a'],
      onMessage: vi.fn(),
    })

    await waitFor(() => {
      expect(collectionMock).toHaveBeenCalledTimes(2)
    })
    cleanup()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('falls back to polling when Firebase realtime is not configured', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    mockFirebaseRealtime({ configured: false })

    const { subscribeKrescoRealtime } = await import('@/lib/realtime')
    const poll = vi.fn()
    const cleanup = subscribeKrescoRealtime({
      channelName: 'kresco:user:1:notifications',
      onMessage: vi.fn(),
      fallback: {
        intervalMs: 1000,
        poll,
      },
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)

    cleanup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('pauses fallback polling while the document is hidden and catches up when visible', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const visibility = mockDocumentVisibility(true)
    mockFirebaseRealtime({ configured: false })

    const { subscribeKrescoRealtime } = await import('@/lib/realtime')
    const poll = vi.fn()
    const cleanup = subscribeKrescoRealtime({
      channelName: 'kresco:user:1:notifications',
      onMessage: vi.fn(),
      fallback: {
        intervalMs: 1000,
        poll,
      },
    })

    try {
      await vi.advanceTimersByTimeAsync(3000)
      expect(poll).not.toHaveBeenCalled()

      visibility.setHidden(false)
      visibility.dispatchVisibilityChange()
      await vi.advanceTimersByTimeAsync(0)
      expect(poll).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1000)
      expect(poll).toHaveBeenCalledTimes(2)

      visibility.setHidden(true)
      visibility.dispatchVisibilityChange()
      await vi.advanceTimersByTimeAsync(3000)
      expect(poll).toHaveBeenCalledTimes(2)

      cleanup()
      visibility.setHidden(false)
      visibility.dispatchVisibilityChange()
      await vi.advanceTimersByTimeAsync(1000)
      expect(poll).toHaveBeenCalledTimes(2)
    } finally {
      cleanup()
      visibility.restore()
    }
  })

  it('shares one fallback poller across multi-channel subscriptions', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    mockFirebaseRealtime({ configured: false })

    const { subscribeKrescoRealtimeChannels } = await import('@/lib/realtime')
    const poll = vi.fn()
    const cleanup = subscribeKrescoRealtimeChannels({
      channelNames: ['kresco:test:a', 'kresco:test:b'],
      onMessage: vi.fn(),
      fallback: {
        intervalMs: 1000,
        poll,
      },
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)

    cleanup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('loads authorized notification channel subscriptions from the backend', async () => {
    const getJson = vi.fn(async () => ({
      notification_channels: ['kresco:user:1:notifications'],
    }))
    vi.doMock('@/lib/apiClient', () => ({ getJson }))
    vi.resetModules()

    const { listKrescoRealtimeSubscriptions } = await import('@/lib/realtime')

    await expect(listKrescoRealtimeSubscriptions()).resolves.toEqual({
      notification_channels: ['kresco:user:1:notifications'],
    })
    expect(getJson).toHaveBeenCalledWith('/realtime/subscriptions')
  })
})

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 30; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await vi.dynamicImportSettled()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  throw lastError
}

function mockDocumentVisibility(initialHidden: boolean) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const listeners = new Set<() => void>()
  const documentMock = {
    hidden: initialHidden,
    addEventListener: vi.fn((eventName: string, listener: () => void) => {
      if (eventName === 'visibilitychange') listeners.add(listener)
    }),
    removeEventListener: vi.fn((eventName: string, listener: () => void) => {
      if (eventName === 'visibilitychange') listeners.delete(listener)
    }),
  }

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentMock,
  })

  return {
    setHidden(hidden: boolean) {
      documentMock.hidden = hidden
    },
    dispatchVisibilityChange() {
      listeners.forEach((listener) => listener())
    },
    restore() {
      if (previousDescriptor) {
        Object.defineProperty(globalThis, 'document', previousDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'document')
      }
    },
  }
}
