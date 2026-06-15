import { useEffect } from 'react'
import {
  listKrescoRealtimeSubscriptions,
  subscribeKrescoRealtimeChannels,
  userNotificationsChannelName,
} from '@/lib/ably'

type NotificationChannelsSubscriptionOptions = {
  userId: number | string | null | undefined
  onMessage: (isActive: () => boolean) => void
  fallbackPoll?: (isActive: () => boolean) => void | Promise<void>
  fallbackIntervalMs?: number
}

export function useNotificationChannelsSubscription({
  userId,
  onMessage,
  fallbackPoll,
  fallbackIntervalMs = 5000,
}: NotificationChannelsSubscriptionOptions) {
  useEffect(() => {
    if (!userId) return

    const fallbackUserChannel = userNotificationsChannelName(userId)
    let cleanup = () => {}
    let stopped = false
    const isActive = () => !stopped
    const refresh = () => {
      onMessage(isActive)
    }
    const fallback = fallbackPoll
      ? {
        intervalMs: fallbackIntervalMs,
        poll: () => fallbackPoll(isActive),
      }
      : undefined

    void listKrescoRealtimeSubscriptions()
      .then(({ notification_channels }) => {
        if (stopped) return
        cleanup = subscribeKrescoRealtimeChannels({
          channelNames: notification_channels,
          onMessage: refresh,
          fallback,
        })
      })
      .catch(() => {
        if (stopped) return
        cleanup = subscribeKrescoRealtimeChannels({
          channelNames: [fallbackUserChannel],
          onMessage: refresh,
          fallback,
        })
      })

    return () => {
      stopped = true
      cleanup()
    }
  }, [fallbackIntervalMs, fallbackPoll, onMessage, userId])
}
