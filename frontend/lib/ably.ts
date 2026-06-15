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

  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
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
