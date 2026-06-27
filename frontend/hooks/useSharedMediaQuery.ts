'use client'

import { useEffect, useState } from 'react'

type MediaQuerySubscriber = (matches: boolean) => void

type MediaQuerySubscription = {
  callbacks: Set<MediaQuerySubscriber>
  listener: (event: MediaQueryListEvent) => void
  mediaQuery: MediaQueryList
}

const mediaQuerySubscriptions = new Map<string, MediaQuerySubscription>()

export function useSharedMediaQuery(query: string, initialMatches = false) {
  const [matches, setMatches] = useState(initialMatches)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    return subscribeToMediaQuery(query, setMatches)
  }, [query])

  return matches
}

function subscribeToMediaQuery(query: string, callback: MediaQuerySubscriber) {
  const subscription = getMediaQuerySubscription(query)
  callback(subscription.mediaQuery.matches)
  subscription.callbacks.add(callback)

  return () => {
    subscription.callbacks.delete(callback)
    if (subscription.callbacks.size > 0) return

    removeMediaQueryListener(subscription.mediaQuery, subscription.listener)
    mediaQuerySubscriptions.delete(query)
  }
}

function getMediaQuerySubscription(query: string) {
  const existing = mediaQuerySubscriptions.get(query)
  if (existing) return existing

  const mediaQuery = window.matchMedia(query)
  const subscription: MediaQuerySubscription = {
    callbacks: new Set(),
    listener: (event) => {
      for (const callback of Array.from(subscription.callbacks)) {
        callback(event.matches)
      }
    },
    mediaQuery,
  }
  addMediaQueryListener(mediaQuery, subscription.listener)
  mediaQuerySubscriptions.set(query, subscription)
  return subscription
}

function addMediaQueryListener(mediaQuery: MediaQueryList, listener: (event: MediaQueryListEvent) => void) {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener)
    return
  }

  mediaQuery.addListener?.(listener)
}

function removeMediaQueryListener(mediaQuery: MediaQueryList, listener: (event: MediaQueryListEvent) => void) {
  if (typeof mediaQuery.removeEventListener === 'function') {
    mediaQuery.removeEventListener('change', listener)
    return
  }

  mediaQuery.removeListener?.(listener)
}
