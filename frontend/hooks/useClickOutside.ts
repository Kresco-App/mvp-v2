'use client'

import { useEffect, useRef, type RefObject } from 'react'

type OutsideEventName = 'click' | 'mousedown' | 'pointerdown' | 'touchstart'
type OutsideEvent = MouseEvent | PointerEvent | TouchEvent

type ClickOutsideOptions = {
  enabled?: boolean
  eventName?: OutsideEventName
}

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClickOutside: (event: OutsideEvent) => void,
  { enabled = true, eventName = 'pointerdown' }: ClickOutsideOptions = {},
) {
  const handlerRef = useRef(onClickOutside)

  useEffect(() => {
    handlerRef.current = onClickOutside
  }, [onClickOutside])

  useEffect(() => {
    if (!enabled) return

    function handleEvent(event: OutsideEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!ref.current || ref.current.contains(target)) return
      handlerRef.current(event)
    }

    document.addEventListener(eventName, handleEvent)
    return () => document.removeEventListener(eventName, handleEvent)
  }, [enabled, eventName, ref])
}

export function useEscapeKey(
  onEscape: (event: KeyboardEvent) => void,
  enabled = true,
) {
  const handlerRef = useRef(onEscape)

  useEffect(() => {
    handlerRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handlerRef.current(event)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}

export function useDismissable<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onDismiss: () => void,
  {
    enabled = true,
    eventName = 'pointerdown',
    closeOnEscape = true,
  }: ClickOutsideOptions & { closeOnEscape?: boolean } = {},
) {
  useClickOutside(ref, onDismiss, { enabled, eventName })
  useEscapeKey(() => onDismiss(), enabled && closeOnEscape)
}
