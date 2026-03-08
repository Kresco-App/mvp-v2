'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export type FocusPreset = 'sprint' | 'deep_work' | 'bac_blanc' | 'custom'
export type FocusState = 'idle' | 'running' | 'paused' | 'break' | 'finished'
export type TabStatus = 'focused' | 'away'

interface FocusPresetConfig {
  label: string
  minutes: number
  breakMinutes: number
}

export const PRESETS: Record<Exclude<FocusPreset, 'custom'>, FocusPresetConfig> = {
  sprint:    { label: 'Sprint',     minutes: 25,  breakMinutes: 5 },
  deep_work: { label: 'Deep Work',  minutes: 50,  breakMinutes: 10 },
  bac_blanc: { label: 'Bac Blanc',  minutes: 240, breakMinutes: 15 },
}

const STORAGE_KEY = 'kresco_focus_engine'

interface PersistedState {
  preset: FocusPreset
  customMinutes: number
  totalSeconds: number
  elapsedSeconds: number
  state: FocusState
  streak: number
  tabWarnings: number
  startedAt: number | null
  pausedAt: number | null
}

function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function saveState(state: PersistedState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function useFocusEngine() {
  const saved = loadState()

  const [preset, setPreset] = useState<FocusPreset>(saved?.preset ?? 'sprint')
  const [customMinutes, setCustomMinutes] = useState(saved?.customMinutes ?? 30)
  const [totalSeconds, setTotalSeconds] = useState(saved?.totalSeconds ?? PRESETS.sprint.minutes * 60)
  const [elapsedSeconds, setElapsedSeconds] = useState(saved?.elapsedSeconds ?? 0)
  const [state, setState] = useState<FocusState>(saved?.state === 'running' ? 'paused' : saved?.state ?? 'idle')
  const [streak, setStreak] = useState(saved?.streak ?? 0)
  const [tabWarnings, setTabWarnings] = useState(saved?.tabWarnings ?? 0)
  const [tabStatus, setTabStatus] = useState<TabStatus>('focused')
  const [isMuted, setIsMuted] = useState(false)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startedAtRef = useRef<number | null>(saved?.startedAt ?? null)

  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)
  const progress = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0

  // Persist state
  useEffect(() => {
    saveState({
      preset,
      customMinutes,
      totalSeconds,
      elapsedSeconds,
      state,
      streak,
      tabWarnings,
      startedAt: startedAtRef.current,
      pausedAt: state === 'paused' ? Date.now() : null,
    })
  }, [preset, customMinutes, totalSeconds, elapsedSeconds, state, streak, tabWarnings])

  // Timer tick
  useEffect(() => {
    if (state === 'running') {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => {
          const next = prev + 1
          if (next >= totalSeconds) {
            setState('finished')
            setStreak(s => s + 1)
            if (intervalRef.current) clearInterval(intervalRef.current)
          }
          return Math.min(next, totalSeconds)
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [state, totalSeconds])

  // Page Visibility API — track tab switches
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        setTabStatus('away')
        if (state === 'running') {
          setTabWarnings(w => w + 1)
        }
      } else {
        setTabStatus('focused')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [state])

  const selectPreset = useCallback((p: FocusPreset, mins?: number) => {
    if (state === 'running') return
    setPreset(p)
    if (p === 'custom' && mins) {
      setCustomMinutes(mins)
      setTotalSeconds(mins * 60)
    } else if (p !== 'custom') {
      setTotalSeconds(PRESETS[p].minutes * 60)
    }
    setElapsedSeconds(0)
    setState('idle')
  }, [state])

  const start = useCallback(() => {
    startedAtRef.current = Date.now()
    setState('running')
  }, [])

  const pause = useCallback(() => {
    setState('paused')
  }, [])

  const resume = useCallback(() => {
    setState('running')
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setElapsedSeconds(0)
    setTabWarnings(0)
    startedAtRef.current = null
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted(m => !m)
  }, [])

  return {
    // State
    preset,
    state,
    totalSeconds,
    elapsedSeconds,
    remainingSeconds,
    progress,
    streak,
    tabWarnings,
    tabStatus,
    isMuted,
    // Actions
    selectPreset,
    start,
    pause,
    resume,
    reset,
    toggleMute,
  }
}
