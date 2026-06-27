// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PermanentSidebar } from '@/components/figma/permanent-sidebar'
import { apiSWRConfig } from '@/lib/apiData'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    priority?: boolean
    unoptimized?: boolean
  }) => {
    void _fill
    void _priority
    void _unoptimized
    return React.createElement('img', props)
  },
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

vi.mock('@/lib/lazyToast', () => ({
  showToastError: mocks.toastError,
  showToastSuccess: mocks.toastSuccess,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
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
})

describe('PermanentSidebar data behavior', () => {
  it('loads sidebar summary through SWR and reuses cached data across remounts', async () => {
    const cache = new Map()
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/progress/sidebar-summary') return { data: sidebarSummary() }
      throw new Error(`unexpected url ${url}`)
    })

    const first = renderSidebar(cache)

    await waitFor(() => {
      expect(first.container.textContent).toContain('Warm quest')
      expect(first.container.textContent).toContain('Fast Student')
    })
    const sectionSlots = first.container.querySelectorAll('aside[aria-label="Permanent sidebar"] > div')
    expect(sectionSlots[0]?.getAttribute('style')).toContain('content-visibility: auto')
    expect(sectionSlots[0]?.getAttribute('style')).toContain('contain-intrinsic-size: auto 305px')
    expect(mocks.apiGet).toHaveBeenCalledWith('/progress/sidebar-summary')
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)

    unmountSidebar(first.root)
    mocks.apiGet.mockImplementation(() => new Promise(() => undefined))

    const second = renderSidebar(cache)

    expect(second.container.textContent).toContain('Warm quest')
    expect(second.container.textContent).toContain('Fast Student')
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
  })
})

function renderSidebar(cache = new Map()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(
      SWRConfig,
      {
        value: {
          ...apiSWRConfig,
          provider: () => cache,
          errorRetryCount: 0,
        },
      },
      React.createElement(PermanentSidebar, { sections: ['quests', 'leaderboard'] }),
    ))
  })

  return { container, root }
}

function unmountSidebar(root: Root) {
  const entry = mountedRoots.find((item) => item.root === root)
  if (!entry) return
  act(() => {
    entry.root.unmount()
  })
  entry.container.remove()
  mountedRoots = mountedRoots.filter((item) => item.root !== root)
}

function sidebarSummary() {
  return {
    quests: [{ id: 10, title: 'Warm quest', progress: 1, target: 2 }],
    leaderboard_entries: [{ rank: 1, user_id: 20, full_name: 'Fast Student', total_xp: 900 }],
  }
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 30; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
  }
  throw lastError
}
