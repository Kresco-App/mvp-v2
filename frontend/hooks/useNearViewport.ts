'use client'

import { useEffect, useRef, useState } from 'react'

type NearViewportOptions = {
  rootMargin?: string
}

type NearViewportObserverEntry = {
  observer: IntersectionObserver
  callbacksByElement: Map<Element, Set<() => void>>
}

const nearViewportObservers = new Map<string, NearViewportObserverEntry>()

export function useNearViewport<TElement extends Element>({
  rootMargin = '480px',
}: NearViewportOptions = {}) {
  const ref = useRef<TElement | null>(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    if (nearViewport) return undefined

    const node = ref.current
    if (!node || typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      setNearViewport(true)
      return undefined
    }

    return observeNearViewportElement(node, rootMargin, () => setNearViewport(true))
  }, [nearViewport, rootMargin])

  return { nearViewport, ref }
}

function observeNearViewportElement(node: Element, rootMargin: string, onNearViewport: () => void) {
  const observerEntry = getNearViewportObserverEntry(rootMargin)
  let callbacks = observerEntry.callbacksByElement.get(node)
  if (!callbacks) {
    callbacks = new Set()
    observerEntry.callbacksByElement.set(node, callbacks)
    observerEntry.observer.observe(node)
  }

  callbacks.add(onNearViewport)

  return () => {
    const activeCallbacks = observerEntry.callbacksByElement.get(node)
    if (!activeCallbacks) return

    activeCallbacks.delete(onNearViewport)
    if (activeCallbacks.size > 0) return

    observerEntry.callbacksByElement.delete(node)
    observerEntry.observer.unobserve(node)
    if (observerEntry.callbacksByElement.size === 0) {
      observerEntry.observer.disconnect()
      nearViewportObservers.delete(rootMargin)
    }
  }
}

function getNearViewportObserverEntry(rootMargin: string) {
  const existing = nearViewportObservers.get(rootMargin)
  if (existing) return existing

  const observerEntry: NearViewportObserverEntry = {
    callbacksByElement: new Map(),
    observer: new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting && entry.intersectionRatio <= 0) continue

        const callbacks = observerEntry.callbacksByElement.get(entry.target)
        if (!callbacks) continue

        observerEntry.callbacksByElement.delete(entry.target)
        observerEntry.observer.unobserve(entry.target)
        for (const callback of Array.from(callbacks)) callback()
        if (observerEntry.callbacksByElement.size === 0) {
          observerEntry.observer.disconnect()
          nearViewportObservers.delete(rootMargin)
        }
      }
    }, { rootMargin, threshold: 0 }),
  }
  nearViewportObservers.set(rootMargin, observerEntry)
  return observerEntry
}
