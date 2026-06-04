import * as Ably from 'ably'
import { getJson } from './apiClient'

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

export function isKrescoRealtimeEnabled() {
  return process.env.NEXT_PUBLIC_ABLY_ENABLED !== 'false'
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Could not authenticate with Ably.'
}

function reportRealtimeAsyncFailure(error: unknown, context: RealtimeFailureContext) {
  if (typeof console !== 'undefined') {
    console.warn('Kresco realtime async failure', { ...context, error })
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kresco:realtime-error', {
      detail: {
        ...context,
        message: error instanceof Error ? error.message : String(error),
      },
    }))
  }
}

export function getKrescoRealtime(): Ably.Realtime | null {
  if (typeof window === 'undefined') {
    throw new Error('Ably realtime client is only available in the browser.')
  }

  if (!isKrescoRealtimeEnabled()) return null

  if (!realtimeClient) {
    realtimeClient = new Ably.Realtime({
      authCallback: async (_tokenParams, callback) => {
        try {
          const data = await getJson<AblyTokenResponse>('/realtime/ably-token')
          callback(null, data.token)
        } catch (error) {
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
  let stopped = false
  let fallbackTimer: number | null = null
  let pollInFlight = false
  let subscribing = false
  let subscribed = false

  const startFallback = fallback
    ? (runNow: boolean) => {
        if (fallbackTimer || stopped) return
        if (runNow) void runPoll()
        fallbackTimer = window.setInterval(() => {
          void runPoll()
        }, fallback.intervalMs)
      }
    : undefined

  const stopFallback = () => {
    if (!fallbackTimer) return
    window.clearInterval(fallbackTimer)
    fallbackTimer = null
  }

  const runPoll = async () => {
    if (!fallback || pollInFlight || stopped) return
    pollInFlight = true
    try {
      await fallback.poll()
    } finally {
      pollInFlight = false
    }
  }

  const realtime = getKrescoRealtime()
  if (!realtime) {
    startFallback?.(false)
    return () => {
      stopped = true
      stopFallback()
    }
  }

  const channel = realtime.channels.get(channelName)
  const ensureSubscribed = async () => {
    if (subscribing || subscribed || stopped) return
    subscribing = true
    try {
      await beforeSubscribe?.()
      if (stopped) return
      await channel.subscribe(onMessage)
      subscribed = true
      stopFallback()
      void runPoll()
    } catch (error) {
      reportRealtimeAsyncFailure(error, { channelName, operation: 'subscribe' })
      startFallback?.(true)
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
  let stopped = false
  let fallbackTimer: number | null = null
  let pollInFlight = false
  const subscribedChannels: Array<{ unsubscribe: (listener?: (message: Ably.InboundMessage) => void) => void }> = []
  const uniqueChannelNames = Array.from(new Set(channelNames.map((name) => name.trim()).filter(Boolean)))

  const runPoll = async () => {
    if (!fallback || pollInFlight || stopped) return
    pollInFlight = true
    try {
      await fallback.poll()
    } finally {
      pollInFlight = false
    }
  }

  const startFallback = fallback
    ? (runNow: boolean) => {
        if (fallbackTimer || stopped) return
        if (runNow) void runPoll()
        fallbackTimer = window.setInterval(() => {
          void runPoll()
        }, fallback.intervalMs)
      }
    : undefined

  const stopFallback = () => {
    if (!fallbackTimer) return
    window.clearInterval(fallbackTimer)
    fallbackTimer = null
  }

  const realtime = getKrescoRealtime()
  if (!realtime || uniqueChannelNames.length === 0) {
    startFallback?.(false)
    return () => {
      stopped = true
      stopFallback()
    }
  }

  const handleConnectionState: Ably.connectionEventCallback = (change) => {
    if (change.current === 'connected') {
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

  void (async () => {
    await beforeSubscribe?.()
    if (stopped) return
    for (const channelName of uniqueChannelNames) {
      if (stopped) return
      const channel = realtime.channels.get(channelName)
      await channel.subscribe(onMessage)
      subscribedChannels.push(channel)
    }
    stopFallback()
    void runPoll()
  })().catch((error) => {
    reportRealtimeAsyncFailure(error, { operation: 'subscribe-channels' })
    startFallback?.(true)
  })

  return () => {
    stopped = true
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
