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

export type RealtimeMessage = {
  id?: string
  name: string
  data: unknown
  timestamp?: number
}

export type RealtimeSubscriptionsResponse = {
  notification_channels: string[]
}

type RealtimeProvider = 'firestore' | 'disabled'

type RealtimeFallback = {
  intervalMs: number
  poll: () => void | Promise<void>
}

type RealtimeSubscriptionOptions = {
  channelName: string
  onMessage: (message: RealtimeMessage) => void
  fallback?: RealtimeFallback
  beforeSubscribe?: () => void | Promise<void>
}

type RealtimeFailureContext = {
  channelName?: string
  operation: string
}

let firestoreMisconfiguredForSession = false

function realtimeProviderFlag(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_PUBLIC_REALTIME_PROVIDER?.trim().toLowerCase() ?? ''
}

export function isKrescoFirestoreRealtimeConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !firestoreMisconfiguredForSession && firebasePublicAuthConfig(env) !== null
}

export function getKrescoRealtimeProvider(env: NodeJS.ProcessEnv = process.env): RealtimeProvider {
  const explicitProvider = realtimeProviderFlag(env)
  if (explicitProvider === 'off' || explicitProvider === 'none' || explicitProvider === 'disabled') {
    return 'disabled'
  }
  return isKrescoFirestoreRealtimeConfigured(env) ? 'firestore' : 'disabled'
}

function createRealtimeFallbackPoller(
  fallback: RealtimeFallback | undefined,
  isStopped: () => boolean,
  failureContext: RealtimeFailureContext,
) {
  let fallbackTimer: ReturnType<typeof setInterval> | null = null
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
        fallbackTimer = globalThis.setInterval(() => {
          void runPoll()
        }, fallback.intervalMs)
      }
    : undefined

  const stopFallback = () => {
    if (fallbackTimer === null) return
    globalThis.clearInterval(fallbackTimer)
    fallbackTimer = null
  }

  return { runPoll, startFallback, stopFallback }
}

export function isKrescoRealtimeEnabled() {
  return getKrescoRealtimeProvider() !== 'disabled'
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

function firestoreDocToRealtimeMessage(doc: QueryDocumentSnapshot): RealtimeMessage {
  const data = doc.data()
  return {
    id: doc.id,
    name: typeof data.name === 'string' ? data.name : '',
    data: data.data,
    timestamp: firestoreTimestampMillis(data.createdAt),
  }
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
  onMessage: (message: RealtimeMessage) => void
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

export async function refreshKrescoRealtimeAuthorization() {}

export function subscribeKrescoRealtime({
  channelName,
  onMessage,
  fallback,
  beforeSubscribe,
}: RealtimeSubscriptionOptions) {
  return subscribeKrescoFirestore({ channelName, onMessage, fallback, beforeSubscribe })
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
  onMessage: (message: RealtimeMessage) => void
  beforeSubscribe?: () => void | Promise<void>
  fallback?: RealtimeFallback
}) {
  return subscribeKrescoFirestoreChannels({ channelNames, onMessage, beforeSubscribe, fallback })
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
