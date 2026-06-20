// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PomodoroTimer from '@/components/zed/PomodoroTimer'
import type { useFocusEngine } from '@/hooks/useFocusEngine'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  document.body.innerHTML = ''
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
  vi.restoreAllMocks()
})

describe('PomodoroTimer', () => {
  it('keeps the running timer visible in the light Zed header', () => {
    const { container } = renderTimer({ state: 'running', remainingSeconds: 1500, progress: 0.4 })

    const time = getByAriaLabel(container, 'Temps restant')
    expect(time.textContent).toBe('25:00')
    expect(time.className).toContain('text-indigo-700')
    expect(getByAriaLabel(container, 'Mettre le minuteur en pause')).not.toBeNull()
  })

  it('labels the mute control according to its current state', () => {
    const { container } = renderTimer({ isMuted: true })

    expect(getByAriaLabel(container, 'Activer le son')).not.toBeNull()
  })
})

function renderTimer(overrides: Partial<ReturnType<typeof useFocusEngine>> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  const engine: ReturnType<typeof useFocusEngine> = {
    preset: 'sprint',
    state: 'idle',
    totalSeconds: 1500,
    elapsedSeconds: 0,
    remainingSeconds: 1500,
    progress: 0,
    streak: 0,
    tabWarnings: 0,
    tabStatus: 'focused',
    isMuted: false,
    selectPreset: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    toggleMute: vi.fn(),
    ...overrides,
  }

  act(() => {
    root.render(React.createElement(PomodoroTimer, { engine }))
  })

  return { container, root }
}

function getByAriaLabel(container: HTMLElement, label: string) {
  const element = container.querySelector(`[aria-label="${label}"]`)
  if (!(element instanceof HTMLElement)) throw new Error(`${label} not found`)
  return element
}
