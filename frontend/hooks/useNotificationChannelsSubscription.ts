import { useEffect } from 'react'

type RealtimeModule = typeof import('@/lib/realtime')

type NotificationChannelsSubscriptionOptions = {
  userId: number | string | null | undefined
  onMessage: (isActive: () => boolean) => void
  fallbackPoll?: (isActive: () => boolean) => void | Promise<void>
  fallbackIntervalMs?: number
}

let realtimeModulePromise: Promise<RealtimeModule> | null = null

function loadRealtimeModule() {
  realtimeModulePromise ??= import('@/lib/realtime')
  return realtimeModulePromise
}

function fallbackUserNotificationsChannelName(userId: number | string) {
  return `kresco:user:${userId}:notifications`
}

export function useNotificationChannelsSubscription({
  userId,
  onMessage,
  fallbackPoll,
  fallbackIntervalMs = 5000,
}: NotificationChannelsSubscriptionOptions) {
  useEffect(() => {
    if (!userId) return

    const fallbackUserChannel = fallbackUserNotificationsChannelName(userId)
    let cleanup = () => {}
    let stopped = false
    const isActive = () => !stopped
    const refresh = () => {
      onMessage(isActive)
    }
    const fallback = fallbackPoll
      ? {
        intervalMs: fallbackIntervalMs,
        initialPoll: false,
        poll: () => fallbackPoll(isActive),
      }
      : undefined

    void loadRealtimeModule()
      .then(async ({ listKrescoRealtimeSubscriptions, subscribeKrescoRealtimeChannels }) => {
        let channelNames = [fallbackUserChannel]
        try {
          const subscriptions = await listKrescoRealtimeSubscriptions()
          channelNames = subscriptions.notification_channels
        } catch {
          channelNames = [fallbackUserChannel]
        }

        if (stopped) return
        cleanup = subscribeKrescoRealtimeChannels({
          channelNames,
          onMessage: refresh,
          fallback,
        })
      })
      .catch(() => undefined)

    return () => {
      stopped = true
      cleanup()
    }
  }, [fallbackIntervalMs, fallbackPoll, onMessage, userId])
}
