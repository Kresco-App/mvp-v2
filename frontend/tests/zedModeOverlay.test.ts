// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ZedModeOverlay from '@/components/zed/ZedModeOverlay'

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const MockMotionDiv = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => React.createElement('div', { ...props, ref }, children),
  )
  MockMotionDiv.displayName = 'MockMotionDiv'
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: {
      div: MockMotionDiv,
    },
  }
})

vi.mock('next/dynamic', async () => {
  const React = await import('react')
  return {
    default: () => function DynamicMock() {
      return React.createElement('div', { 'data-testid': 'pdf-viewer' })
    },
  }
})

vi.mock('@/hooks/useFocusEngine', () => ({
  useFocusEngine: () => ({
    state: 'paused',
    tabStatus: 'focused',
  }),
}))

vi.mock('@/components/KrescoMascot', async () => {
  const React = await import('react')
  return {
    default: () => React.createElement('div', { 'data-testid': 'mascot' }),
  }
})

vi.mock('@/components/zed/PomodoroTimer', async () => {
  const React = await import('react')
  return {
    default: () => React.createElement('div', { 'data-testid': 'pomodoro' }),
  }
})

vi.mock('@/components/zed/ScientificCalculator', async () => {
  const React = await import('react')
  return {
    default: () => React.createElement('div', { 'data-testid': 'calculator' }),
  }
})

vi.mock('@/components/zed/RappelsCours', async () => {
  const React = await import('react')
  return {
    default: () => React.createElement('div', { 'data-testid': 'rappels' }),
  }
})

vi.mock('@/components/zed/Scratchpad', async () => {
  const React = await import('react')
  return {
    default: () => React.createElement('div', { 'data-testid': 'scratchpad' }),
  }
})

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  localStorage.clear()
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

function renderOverlay() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(ZedModeOverlay, { onClose: vi.fn() }))
  })

  return { container, root }
}

describe('ZedModeOverlay', () => {
  it('defers localStorage hydration until after the initial render', () => {
    localStorage.setItem('kresco_zed_split', '61')
    localStorage.setItem(
      'kresco_zed_pins',
      JSON.stringify([{ id: 'pin-1', content: 'Note', type: 'text' }]),
    )
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    vi.useFakeTimers()

    try {
      renderOverlay()

      expect(getItemSpy).not.toHaveBeenCalled()
      expect(setItemSpy).not.toHaveBeenCalled()

      act(() => {
        vi.runOnlyPendingTimers()
      })

      expect(getItemSpy).toHaveBeenCalledWith('kresco_zed_split')
      expect(getItemSpy).toHaveBeenCalledWith('kresco_zed_pins')
      expect(setItemSpy).not.toHaveBeenCalledWith('kresco_zed_pins', '[]')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up active resize listeners when unmounted mid-drag', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { container, root } = renderOverlay()

    const separator = container.querySelector('[aria-label="Redimensionner le panneau Zed"]')
    expect(separator).not.toBeNull()

    act(() => {
      separator?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500 }))
    })

    const mouseMoveHandler = addEventListenerSpy.mock.calls.find(([type]) => type === 'mousemove')?.[1]
    const mouseUpHandler = addEventListenerSpy.mock.calls.find(([type]) => type === 'mouseup')?.[1]
    expect(mouseMoveHandler).toEqual(expect.any(Function))
    expect(mouseUpHandler).toEqual(expect.any(Function))

    act(() => {
      root.unmount()
    })

    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', mouseMoveHandler)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', mouseUpHandler)
  })
})
