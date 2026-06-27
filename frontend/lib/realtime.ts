import type { Firestore, QueryDocumentSnapshot, Unsubscribe } from '@firebase/firestore'

import { getJson } from './apiClient'
import { getFirebaseApp } from './firebaseApp'
import { firebasePublicAuthConfig } from './firebaseConfig'

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
  initialPoll?: boolean
}

type RealtimeSubscriptionOptions = {
  channelName: string
  onMessage: (message: RealtimeMessage) => void
  fallback?: RealtimeFallback
  fallbackController?: RealtimeFallbackController
  beforeSubscribe?: () => void | Promise<void>
}

type RealtimeFailureContext = {
  channelName?: string
  operation: string
}

type RealtimeFallbackController = ReturnType<typeof createRealtimeFallbackPoller>
type FirestoreSdk = typeof import('@firebase/firestore')

let firestoreMisconfiguredForSession = false
let firestoreSdkPromise: Promise<FirestoreSdk> | null = null

function loadFirestoreSdk() {
  firestoreSdkPromise ??= import('@firebase/firestore')
  return firestoreSdkPromise
}

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
  let removeVisibilityListener: (() => void) | null = null

  const runPoll = async () => {
    if (!fallback || pollInFlight || isStopped() || isRealtimeDocumentHidden()) return
    pollInFlight = true
    try {
      await fallback.poll()
    } catch (error) {
      reportRealtimeAsyncFailure(error, failureContext)
    } finally {
      pollInFlight = false
    }
  }

  const startInterval = () => {
    if (!fallback || fallbackTimer !== null || isStopped() || isRealtimeDocumentHidden()) return
    fallbackTimer = globalThis.setInterval(() => {
      void runPoll()
    }, fallback.intervalMs)
  }

  const stopInterval = () => {
    if (fallbackTimer === null) return
    globalThis.clearInterval(fallbackTimer)
    fallbackTimer = null
  }

  const handleVisibilityChange = () => {
    if (isStopped()) return
    if (isRealtimeDocumentHidden()) {
      stopInterval()
      return
    }

    startInterval()
    void runPoll()
  }

  const ensureVisibilityListener = () => {
    if (!fallback || removeVisibilityListener) return
    removeVisibilityListener = subscribeRealtimeVisibilityChange(handleVisibilityChange)
  }

  const startFallback = fallback
    ? (runNow: boolean) => {
        if (isStopped()) return
        ensureVisibilityListener()
        if (runNow) void runPoll()
        startInterval()
      }
    : undefined

  const stopFallback = () => {
    stopInterval()
    removeVisibilityListener?.()
    removeVisibilityListener = null
  }

  return { runPoll, startFallback, stopFallback }
}

function isRealtimeDocumentHidden() {
  return typeof document !== 'undefined' && document.hidden
}

function subscribeRealtimeVisibilityChange(listener: () => void) {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return () => {}
  }

  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
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

function getKrescoFirestore(
  firestoreSdk: FirestoreSdk,
  config: NonNullable<ReturnType<typeof firebasePublicAuthConfig>>,
): Firestore {
  const app = getFirebaseApp(config)
  const databaseId = firestoreDatabaseId()
  if (databaseId && databaseId !== '(default)') return firestoreSdk.getFirestore(app, databaseId)
  return firestoreSdk.getFirestore(app)
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
  fallbackController,
  beforeSubscribe,
}: RealtimeSubscriptionOptions) {
  let stopped = false
  let unsubscribe: Unsubscribe | null = null
  let sawInitialSnapshot = false
  const localFallbackController = fallbackController ?? createRealtimeFallbackPoller(
    fallback,
    () => stopped,
    { channelName, operation: 'firestore-fallback-poll' },
  )
  const { runPoll, startFallback, stopFallback } = localFallbackController

  const firebaseConfig = firebasePublicAuthConfig()
  if (!firebaseConfig || firestoreMisconfiguredForSession) {
    startFallback?.(false)
    return () => {
      stopped = true
      if (!fallbackController) stopFallback()
    }
  }

  const startSubscription = async () => {
    try {
      await beforeSubscribe?.()
      if (stopped) return
      const firestoreSdk = await loadFirestoreSdk()
      if (stopped) return
      const firestore = getKrescoFirestore(firestoreSdk, firebaseConfig)
      const eventsQuery = firestoreSdk.query(
        firestoreSdk.collection(firestore, 'realtimeChannels', firestoreChannelDocumentId(channelName), 'events'),
        firestoreSdk.orderBy('createdAt'),
        firestoreSdk.limitToLast(25),
      )
      unsubscribe = firestoreSdk.onSnapshot(
        eventsQuery,
        (snapshot) => {
          if (stopped) return
          stopFallback()
          if (!sawInitialSnapshot) {
            sawInitialSnapshot = true
            if (fallback?.initialPoll !== false) void runPoll()
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
    if (!fallbackController) stopFallback()
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

  let stopped = false
  const fallbackController = fallback
    ? createRealtimeFallbackPoller(
      fallback,
      () => stopped,
      { operation: 'firestore-channel-group-fallback-poll' },
    )
    : undefined
  const cleanups = uniqueChannelNames.map((channelName) => subscribeKrescoFirestore({
    channelName,
    onMessage,
    beforeSubscribe,
    fallback,
    fallbackController,
  }))

  return () => {
    stopped = true
    fallbackController?.stopFallback()
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
