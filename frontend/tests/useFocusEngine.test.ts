// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFocusEngine, type FocusState } from '@/hooks/useFocusEngine'

const STORAGE_KEY = 'kresco_focus_engine'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []
let latestEngine: ReturnType<typeof useFocusEngine> | null = null

function FocusEngineProbe() {
  latestEngine = useFocusEngine()
  return null
}

function renderProbe() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(FocusEngineProbe))
  })
}

function savedFocusState({
  state,
  elapsedSeconds,
  totalSeconds = 100,
  startedAt,
  version = 1,
  ownerId = 'tab-a',
}: {
  state: FocusState
  elapsedSeconds: number
  totalSeconds?: number
  startedAt: number | null
  version?: number
  ownerId?: string | null
}) {
  return {
    version,
    ownerId,
    preset: 'sprint',
    customMinutes: 30,
    totalSeconds,
    elapsedSeconds,
    state,
    streak: 2,
    tabWarnings: 1,
    startedAt,
    pausedAt: state === 'paused' ? Date.now() : null,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-28T08:00:00.000Z'))
  localStorage.clear()
  document.body.innerHTML = ''
  latestEngine = null
  mountedRoots = []
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  mountedRoots = []
  latestEngine = null
  localStorage.clear()
  vi.useRealTimers()
})

describe('useFocusEngine persistence', () => {
  it('hydrates a saved running timer as running and reconciles elapsed wall time', () => {
    const now = Date.now()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(savedFocusState({
        state: 'running',
        elapsedSeconds: 40,
        startedAt: now - 5_000,
      })),
    )

    renderProbe()

    expect(latestEngine?.state).toBe('running')
    expect(latestEngine?.elapsedSeconds).toBe(45)
    expect(latestEngine?.streak).toBe(2)
    expect(latestEngine?.tabWarnings).toBe(1)
  })

  it('hydrates an overdue running timer as finished', () => {
    const now = Date.now()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(savedFocusState({
        state: 'running',
        elapsedSeconds: 95,
        startedAt: now - 10_000,
      })),
    )

    renderProbe()

    expect(latestEngine?.state).toBe('finished')
    expect(latestEngine?.elapsedSeconds).toBe(100)
  })

  it('keeps paused timers paused', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(savedFocusState({
        state: 'paused',
        elapsedSeconds: 25,
        startedAt: Date.now() - 5_000,
      })),
    )

    renderProbe()

    expect(latestEngine?.state).toBe('paused')
    expect(latestEngine?.elapsedSeconds).toBe(25)
  })

  it('applies newer storage updates from another tab', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(savedFocusState({
        state: 'paused',
        elapsedSeconds: 25,
        startedAt: Date.now() - 5_000,
        version: 3,
        ownerId: 'tab-a',
      })),
    )

    renderProbe()
    expect(latestEngine?.state).toBe('paused')

    const externalState = JSON.stringify(savedFocusState({
      state: 'running',
      elapsedSeconds: 40,
      startedAt: Date.now() - 2_000,
      version: 10,
      ownerId: 'tab-b',
    }))

    act(() => {
      localStorage.setItem(STORAGE_KEY, externalState)
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: externalState,
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href,
      }))
    })

    expect(latestEngine?.state).toBe('running')
    expect(latestEngine?.elapsedSeconds).toBe(42)
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    expect(persisted.version).toBe(11)
    expect(persisted.ownerId).toEqual(expect.any(String))
    expect(persisted.state).toBe('running')
    expect(persisted.elapsedSeconds).toBe(42)
  })

  it('does not overwrite a newer stored version with a stale local write', () => {
    renderProbe()

    const newerState = JSON.stringify(savedFocusState({
      state: 'paused',
      elapsedSeconds: 12,
      startedAt: Date.now() - 1_000,
      version: 9,
      ownerId: 'tab-b',
    }))

    act(() => {
      localStorage.setItem(STORAGE_KEY, newerState)
    })

    act(() => {
      latestEngine?.toggleMute()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe(newerState)
  })
})
