import * as Ably from 'ably'
import api from './axios'

export type AblyTokenResponse = {
  token: string
  client_id: string
  expires_at: string
  capability: Record<string, string[]>
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

export function isKrescoRealtimeEnabled() {
  return process.env.NEXT_PUBLIC_ABLY_ENABLED !== 'false'
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Could not authenticate with Ably.'
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
          const { data } = await api.get<AblyTokenResponse>('/realtime/ably-token')
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
    } catch {
      startFallback?.(true)
    } finally {
      subscribing = false
    }
  }

  const handleConnectionState: Ably.connectionEventCallback = (change) => {
    if (change.current === 'connected') {
      void ensureSubscribed()
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
  void ensureSubscribed()

  return () => {
    stopped = true
    stopFallback()
    realtime.connection.off(handleConnectionState)
    channel.unsubscribe(onMessage)
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

export function liveSessionChannelName(liveSessionId: number | string) {
  return `kresco:live:${liveSessionId}`
}
