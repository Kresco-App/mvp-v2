'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const FALLBACK_CLOSE_MS = 150

function readDropdownCloseDuration() {
  if (typeof window === 'undefined') return FALLBACK_CLOSE_MS
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0

  const rawValue = getComputedStyle(document.documentElement)
    .getPropertyValue('--dropdown-close-dur')
    .trim()
  const parsed = Number.parseFloat(rawValue)

  if (!Number.isFinite(parsed)) return FALLBACK_CLOSE_MS
  return rawValue.endsWith('s') && !rawValue.endsWith('ms') ? parsed * 1000 : parsed
}

export function useDropdownTransition() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const openFrameRef = useRef<number | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef({ mounted: false, open: false })

  useEffect(() => {
    stateRef.current = { mounted, open }
  }, [mounted, open])

  const clearPendingWork = useCallback(() => {
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current)
      openFrameRef.current = null
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openDropdown = useCallback(() => {
    clearPendingWork()
    setMounted(true)
    setClosing(false)
    setOpen(false)
    openFrameRef.current = requestAnimationFrame(() => {
      setOpen(true)
      openFrameRef.current = null
    })
  }, [clearPendingWork])

  const closeDropdown = useCallback(() => {
    if (!stateRef.current.mounted && !stateRef.current.open) return

    clearPendingWork()
    setOpen(false)
    setClosing(true)

    closeTimerRef.current = setTimeout(() => {
      setClosing(false)
      setMounted(false)
      closeTimerRef.current = null
    }, readDropdownCloseDuration())
  }, [clearPendingWork])

  const toggleDropdown = useCallback(() => {
    if (open) {
      closeDropdown()
    } else {
      openDropdown()
    }
  }, [closeDropdown, open, openDropdown])

  useEffect(() => clearPendingWork, [clearPendingWork])

  return {
    closeDropdown,
    dropdownStateClassName: open ? 'is-open' : closing ? 'is-closing' : '',
    isOpen: open,
    openDropdown,
    shouldRenderDropdown: mounted,
    toggleDropdown,
  }
}
