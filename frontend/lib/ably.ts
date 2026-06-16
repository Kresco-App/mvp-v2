import * as Ably from 'ably'
import {
  collection,
  getFirestore,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from '@firebase/firestore'
import { getJson } from './apiClient'
import { firebasePublicAuthConfig, getFirebaseApp } from './firebaseAuth'

export type AblyTokenResponse = {
  token: string
  client_id: string
  expires_at: string
  capability: Record<string, string[]>
}

export type RealtimeSubscriptionsResponse = {
  notification_channels: string[]
}

let realtimeClient: Ably.Realtime | null = null
let realtimeMisconfiguredForSession = false
let firestoreMisconfiguredForSession = false

type RealtimeProvider = 'ably' | 'firestore' | 'disabled'

type RealtimeFallback = {
  intervalMs: number
  poll: () => void | Promise<void>
}

type RealtimeSubscriptionOptions = {
  channelName: string
  onMessage: (message: Ably.InboundMessage) => void
  fallback?: RealtimeFallback
  beforeSubscribe?: () => void | Promise<void>
}

type RealtimeFailureContext = {
  channelName?: string
  operation: string
}

function realtimeProviderFlag(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_PUBLIC_REALTIME_PROVIDER?.trim().toLowerCase() ?? ''
}

function isKrescoAblyRealtimeEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (realtimeMisconfiguredForSession) return false
  const flag = env.NEXT_PUBLIC_ABLY_ENABLED
  if (flag !== undefined) return flag === 'true'
  return env.NODE_ENV === 'production'
}

export function isKrescoFirestoreRealtimeConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !firestoreMisconfiguredForSession && firebasePublicAuthConfig(env) !== null
}

export function getKrescoRealtimeProvider(env: NodeJS.ProcessEnv = process.env): RealtimeProvider {
  const explicitProvider = realtimeProviderFlag(env)
  if (explicitProvider === 'off' || explicitProvider === 'none' || explicitProvider === 'disabled') {
    return 'disabled'
  }
  if (explicitProvider === 'ably') {
    return isKrescoAblyRealtimeEnabled(env) ? 'ably' : 'disabled'
  }
  if (explicitProvider === 'firestore') {
    return isKrescoFirestoreRealtimeConfigured(env) ? 'firestore' : 'disabled'
  }
  if (isKrescoFirestoreRealtimeConfigured(env)) return 'firestore'
  return isKrescoAblyRealtimeEnabled(env) ? 'ably' : 'disabled'
}

function createRealtimeFallbackPoller(
  fallback: RealtimeFallback | undefined,
  isStopped: () => boolean,
  failureContext: RealtimeFailureContext,
) {
  let fallbackTimer: number | null = null
  let pollInFlight = false

  const runPoll = async () => {
    if (!fallback || pollInFlight || isStopped()) return
    pollInFlight = true
    try {
      await fallback.poll()
    } catch (error) {
      reportRealtimeAsyncFailure(error, failureContext)
    } finally {
      pollInFlight = false
    }
  }

  const startFallback = fallback
    ? (runNow: boolean) => {
        if (fallbackTimer !== null || isStopped()) return
        if (runNow) void runPoll()
        fallbackTimer = window.setInterval(() => {
          void runPoll()
        }, fallback.intervalMs)
      }
    : undefined

  const stopFallback = () => {
    if (fallbackTimer === null) return
    window.clearInterval(fallbackTimer)
    fallbackTimer = null
  }

  return { runPoll, startFallback, stopFallback }
}

export function isKrescoRealtimeEnabled() {
  return getKrescoRealtimeProvider() !== 'disabled'
}

function isRealtimeMisconfigurationError(error: unknown) {
  const responseStatus = (error as { response?: { status?: unknown } })?.response?.status
  return responseStatus === 503
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Could not authenticate with Ably.'
}

function reportRealtimeAsyncFailure(error: unknown, context: RealtimeFailureContext) {
  if (typeof console !== 'undefined') {
    console.warn('Kresco realtime async failure', { ...context, error })
  }

  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kresco:realtime-error', {
      detail: {
        ...context,
        message: error instanceof Error ? error.message : String(error),
      },
    }))
  }
}

function firestoreDatabaseId() {
  return process.env.NEXT_PUBLIC_FIRESTORE_DATABASE?.trim() || '(default)'
}

function getKrescoFirestore() {
  const config = firebasePublicAuthConfig()
  if (!config || firestoreMisconfiguredForSession) return null

  const app = getFirebaseApp(config)
  const databaseId = firestoreDatabaseId()
  if (databaseId && databaseId !== '(default)') return getFirestore(app, databaseId)
  return getFirestore(app)
}

export function firestoreChannelDocumentId(channel: string) {
  const cleanChannel = channel.trim()
  if (!cleanChannel) {
    throw new Error('Realtime channel is required')
  }
  return encodeURIComponent(cleanChannel).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  })
}

function firestoreTimestampMillis(value: unknown) {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis
    if (typeof toMillis === 'function') return toMillis.call(value)
  }
  return Date.now()
}

function firestoreDocToRealtimeMessage(doc: QueryDocumentSnapshot): Ably.InboundMessage {
  const data = doc.data()
  return {
    id: doc.id,
    name: typeof data.name === 'string' ? data.name : '',
    data: data.data,
    timestamp: firestoreTimestampMillis(data.createdAt),
  } as Ably.InboundMessage
}

function isFirestoreMisconfigurationError(error: unknown) {
  const code = (error as { code?: unknown })?.code
  return code === 'permission-denied' || code === 'unauthenticated' || code === 'failed-precondition'
}

function subscribeKrescoFirestore({
  channelName,
  onMessage,
  fallback,
  beforeSubscribe,
}: RealtimeSubscriptionOptions) {
  let stopped = false
  let unsubscribe: Unsubscribe | null = null
  let sawInitialSnapshot = false
  const { runPoll, startFallback, stopFallback } = createRealtimeFallbackPoller(
    fallback,
    () => stopped,
    { channelName, operation: 'firestore-fallback-poll' },
  )

  const firestore = getKrescoFirestore()
  if (!firestore) {
    startFallback?.(false)
    return () => {
      stopped = true
      stopFallback()
    }
  }

  const startSubscription = async () => {
    try {
      await beforeSubscribe?.()
      if (stopped) return
      const eventsQuery = query(
        collection(firestore, 'realtimeChannels', firestoreChannelDocumentId(channelName), 'events'),
        orderBy('createdAt'),
        limitToLast(25),
      )
      unsubscribe = onSnapshot(
        eventsQuery,
        (snapshot) => {
          if (stopped) return
          stopFallback()
          if (!sawInitialSnapshot) {
            sawInitialSnapshot = true
            void runPoll()
            return
          }
          for (const change of snapshot.docChanges()) {
            if (change.type === 'added') {
              onMessage(firestoreDocToRealtimeMessage(change.doc))
            }
          }
        },
        (error) => {
          reportRealtimeAsyncFailure(error, { channelName, operation: 'firestore-listen' })
          if (isFirestoreMisconfigurationError(error)) {
            firestoreMisconfiguredForSession = true
          }
          startFallback?.(true)
        },
      )
    } catch (error) {
      reportRealtimeAsyncFailure(error, { channelName, operation: 'firestore-subscribe' })
      startFallback?.(true)
    }
  }

  void startSubscription()

  return () => {
    stopped = true
    stopFallback()
    unsubscribe?.()
  }
}

function subscribeKrescoFirestoreChannels({
  channelNames,
  onMessage,
  beforeSubscribe,
  fallback,
}: {
  channelNames: string[]
  onMessage: (message: Ably.InboundMessage) => void
  beforeSubscribe?: () => void | Promise<void>
  fallback?: RealtimeFallback
}) {
  const uniqueChannelNames = Array.from(new Set(channelNames.map((name) => name.trim()).filter(Boolean)))
  if (uniqueChannelNames.length === 0) {
    let stopped = false
    const { startFallback, stopFallback } = createRealtimeFallbackPoller(
      fallback,
      () => stopped,
      { operation: 'firestore-empty-channel-fallback-poll' },
    )
    startFallback?.(false)
    return () => {
      stopped = true
      stopFallback()
    }
  }

  const cleanups = uniqueChannelNames.map((channelName) => subscribeKrescoFirestore({
    channelName,
    onMessage,
    beforeSubscribe,
    fallback,
  }))

  return () => {
    cleanups.forEach((cleanup) => cleanup())
  }
}

export function getKrescoRealtime(): Ably.Realtime | null {
  if (typeof window === 'undefined') {
    throw new Error('Ably realtime client is only available in the browser.')
  }

  if (getKrescoRealtimeProvider() !== 'ably') return null

  if (!realtimeClient) {
    realtimeClient = new Ably.Realtime({
      authCallback: async (_tokenParams, callback) => {
        try {
          const data = await getJson<AblyTokenResponse>('/realtime/ably-token')
          callback(null, data.token)
        } catch (error) {
          if (isRealtimeMisconfigurationError(error)) {
            realtimeMisconfiguredForSession = true
            const client = realtimeClient
            realtimeClient = null
            client?.close()
          }
          callback(authErrorMessage(error), null)
        }
      },
    })
  }

  return realtimeClient
}

export function closeKrescoRealtime() {
  realtimeClient?.close()
  realtimeClient = null
}

export async function refreshKrescoRealtimeAuthorization() {
  await realtimeClient?.auth.authorize()
}

export function subscribeKrescoRealtime({
  channelName,
  onMessage,
  fallback,
  beforeSubscribe,
}: RealtimeSubscriptionOptions) {
  if (getKrescoRealtimeProvider() === 'firestore') {
    return subscribeKrescoFirestore({ channelName, onMessage, fallback, beforeSubscribe })
  }

  let stopped = false
  let subscribing = false
  let subscribed = false
  let subscribeRetryTimer: number | null = null
  const subscribeRetryMs = Math.min(Math.max(fallback?.intervalMs ?? 5000, 1000), 5000)
  const { runPoll, startFallback, stopFallback } = createRealtimeFallbackPoller(
    fallback,
    () => stopped,
    { channelName, operation: 'fallback-poll' },
  )

  const realtime = getKrescoRealtime()
  if (!realtime) {
    startFallback?.(false)
    return () => {
      stopped = true
      stopFallback()
    }
  }

  const stopSubscribeRetry = () => {
    if (subscribeRetryTimer === null) return
    window.clearTimeout(subscribeRetryTimer)
    subscribeRetryTimer = null
  }

  const scheduleSubscribeRetry = () => {
    if (stopped || subscribed || subscribeRetryTimer !== null) return
    subscribeRetryTimer = window.setTimeout(() => {
      subscribeRetryTimer = null
      void ensureSubscribed().catch((error) => {
        reportRealtimeAsyncFailure(error, { channelName, operation: 'subscribe-retry' })
        startFallback?.(true)
        scheduleSubscribeRetry()
      })
    }, subscribeRetryMs)
  }

  const channel = realtime.channels.get(channelName)
  const ensureSubscribed = async () => {
    if (subscribing || subscribed || stopped) return
    subscribing = true
    try {
      await beforeSubscribe?.()
      if (stopped) return
      await channel.subscribe(onMessage)
      if (stopped) {
        channel.unsubscribe(onMessage)
        return
      }
      subscribed = true
      stopSubscribeRetry()
      stopFallback()
      void runPoll()
    } catch (error) {
      reportRealtimeAsyncFailure(error, { channelName, operation: 'subscribe' })
      startFallback?.(true)
      scheduleSubscribeRetry()
    } finally {
      subscribing = false
    }
  }

  const handleConnectionState: Ably.connectionEventCallback = (change) => {
    if (change.current === 'connected') {
      void ensureSubscribed().catch((error) => {
        reportRealtimeAsyncFailure(error, { channelName, operation: 'resubscribe' })
      })
      stopFallback()
      void runPoll()
      return
    }
    if (change.current === 'suspended' || change.current === 'failed') {
      startFallback?.(true)
    }
  }

  realtime.connection.on(['connected', 'suspended', 'failed'], handleConnectionState)
  if (realtime.connection.state === 'suspended' || realtime.connection.state === 'failed') {
    startFallback?.(true)
  }
  void ensureSubscribed().catch((error) => {
    reportRealtimeAsyncFailure(error, { channelName, operation: 'subscribe' })
  })

  return () => {
    stopped = true
    stopSubscribeRetry()
    stopFallback()
    realtime.connection.off(handleConnectionState)
    channel.unsubscribe(onMessage)
  }
}

export async function listKrescoRealtimeSubscriptions() {
  return getJson<RealtimeSubscriptionsResponse>('/realtime/subscriptions')
}

export function subscribeKrescoRealtimeChannels({
  channelNames,
  onMessage,
  beforeSubscribe,
  fallback,
}: {
  channelNames: string[]
  onMessage: (message: Ably.InboundMessage) => void
  beforeSubscribe?: () => void | Promise<void>
  fallback?: RealtimeFallback
}) {
  if (getKrescoRealtimeProvider() === 'firestore') {
    return subscribeKrescoFirestoreChannels({ channelNames, onMessage, beforeSubscribe, fallback })
  }

  let stopped = false
  let subscribing = false
  let subscribeRetryTimer: number | null = null
  const subscribedChannels: Array<{ unsubscribe: (listener?: (message: Ably.InboundMessage) => void) => void }> = []
  const subscribedChannelNames = new Set<string>()
  const uniqueChannelNames = Array.from(new Set(channelNames.map((name) => name.trim()).filter(Boolean)))
  const subscribeRetryMs = Math.min(Math.max(fallback?.intervalMs ?? 5000, 1000), 5000)
  const hasPendingChannels = () => subscribedChannelNames.size < uniqueChannelNames.length
  const { runPoll, startFallback, stopFallback } = createRealtimeFallbackPoller(
    fallback,
    () => stopped,
    { operation: 'fallback-poll' },
  )

  const realtime = getKrescoRealtime()
  if (!realtime || uniqueChannelNames.length === 0) {
    startFallback?.(false)
    return () => {
      stopped = true
      stopFallback()
    }
  }

  const stopSubscribeRetry = () => {
    if (!subscribeRetryTimer) return
    window.clearTimeout(subscribeRetryTimer)
    subscribeRetryTimer = null
  }

  const scheduleSubscribeRetry = () => {
    if (stopped || subscribeRetryTimer || !hasPendingChannels()) return
    subscribeRetryTimer = window.setTimeout(() => {
      subscribeRetryTimer = null
      void ensureSubscribed().catch((error) => {
        reportRealtimeAsyncFailure(error, { operation: 'subscribe-channels-retry' })
        startFallback?.(true)
        scheduleSubscribeRetry()
      })
    }, subscribeRetryMs)
  }

  const ensureSubscribed = async () => {
    if (subscribing || stopped || !hasPendingChannels()) return
    subscribing = true
    try {
      try {
        await beforeSubscribe?.()
      } catch (error) {
        reportRealtimeAsyncFailure(error, { operation: 'before-subscribe-channels' })
        startFallback?.(true)
        scheduleSubscribeRetry()
        return
      }
      if (stopped) return
      for (const channelName of uniqueChannelNames) {
        if (stopped) return
        if (subscribedChannelNames.has(channelName)) continue
        const channel = realtime.channels.get(channelName)
        try {
          await channel.subscribe(onMessage)
          if (stopped) {
            channel.unsubscribe(onMessage)
            return
          }
          subscribedChannels.push(channel)
          subscribedChannelNames.add(channelName)
        } catch (error) {
          reportRealtimeAsyncFailure(error, { channelName, operation: 'subscribe-channel' })
        }
      }
      if (hasPendingChannels()) {
        startFallback?.(true)
        scheduleSubscribeRetry()
        return
      }
      stopSubscribeRetry()
      stopFallback()
      void runPoll()
    } finally {
      subscribing = false
    }
  }

  const handleConnectionState: Ably.connectionEventCallback = (change) => {
    if (change.current === 'connected') {
      void ensureSubscribed().catch((error) => {
        reportRealtimeAsyncFailure(error, { operation: 'subscribe-channels' })
        startFallback?.(true)
        scheduleSubscribeRetry()
      })
      void runPoll()
      if (!hasPendingChannels()) stopFallback()
      return
    }
    if (change.current === 'suspended' || change.current === 'failed') {
      startFallback?.(true)
    }
  }

  realtime.connection.on(['connected', 'suspended', 'failed'], handleConnectionState)
  if (realtime.connection.state === 'suspended' || realtime.connection.state === 'failed') {
    startFallback?.(true)
  }

  void ensureSubscribed().catch((error) => {
    reportRealtimeAsyncFailure(error, { operation: 'subscribe-channels' })
    startFallback?.(true)
    scheduleSubscribeRetry()
  })

  return () => {
    stopped = true
    stopSubscribeRetry()
    stopFallback()
    realtime.connection.off(handleConnectionState)
    subscribedChannels.forEach((channel) => channel.unsubscribe(onMessage))
  }
}

export function userNotificationsChannelName(userId: number | string) {
  return `kresco:user:${userId}:notifications`
}

export function userPresenceChannelName(userId: number | string) {
  return `kresco:user:${userId}:presence`
}

export function professorInboxChannelName(professorUserId: number | string) {
  return `kresco:professor:${professorUserId}:inbox`
}

export function offeringNotificationsChannelName(courseOfferingId: number | string) {
  return `kresco:offering:${courseOfferingId}:notifications`
}

export function liveSessionChannelName(liveSessionId: number | string) {
  return `kresco:live:${liveSessionId}`
}
