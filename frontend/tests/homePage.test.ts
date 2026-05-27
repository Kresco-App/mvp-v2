// @vitest-environment jsdom

import React, { act } from 'react'
import { SWRConfig } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomePage from '@/app/(dashboard)/home/page'
import { apiSWRConfig } from '@/lib/apiData'
import { useAuthStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const topic = {
  id: 42,
  subject_title: 'Math',
  title: 'Limits and continuity',
  description: 'Core Bac topic',
  item_count: 5,
  completed_count: 2,
  progress_pct: 40,
  concepts: [],
  can_access: true,
}

const subject = {
  id: 1,
  title: 'Math',
  description: 'Mathematics',
  progress_pct: 40,
}

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoots = []
  useAuthStore.setState({
    user: {
      id: 1,
      email: 'student@kresco.local',
      full_name: 'Kresco Student',
      role: 'student',
    },
    token: 'cookie-session',
    isHydrated: true,
  })
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

describe('Home page SWR data behavior', () => {
  it('loads home data through shared SWR keys and renders the existing dashboard states', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return { data: [topic] }
      if (url === '/courses/subjects') return { data: [subject] }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderHomePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Limits and continuity')
      expect(container.textContent).toContain('Math')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/topics')
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/subjects')
  })

  it('keeps auth state intact and retries from an API failure to data', async () => {
    let topicCalls = 0
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') {
        topicCalls += 1
        if (topicCalls === 1) {
          throw { response: { status: 500, data: { detail: 'Controlled topics failure' } } }
        }
        return { data: [topic] }
      }
      if (url === '/courses/subjects') return { data: [subject] }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderHomePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Dashboard data could not be refreshed.')
    })
    expect(mocks.toastError).toHaveBeenCalledWith('Controlled topics failure')
    expect(useAuthStore.getState().user?.email).toBe('student@kresco.local')

    await act(async () => {
      getButton(container, 'Retry dashboard data').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Limits and continuity')
    })
    expect(topicCalls).toBe(2)
    expect(useAuthStore.getState().user?.email).toBe('student@kresco.local')
  })

  it('reports the same API failure again after a successful recovery', async () => {
    let topicShouldFail = true
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') {
        if (topicShouldFail) {
          throw { response: { status: 500, data: { detail: 'Repeated topics failure' } } }
        }
        return { data: [topic] }
      }
      if (url === '/courses/subjects') return { data: [subject] }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderHomePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Dashboard data could not be refreshed.')
    })
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenLastCalledWith('Repeated topics failure')

    topicShouldFail = false
    await act(async () => {
      getButton(container, 'Retry dashboard data').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitFor(() => {
      expect(container.textContent).toContain('Limits and continuity')
      expect(container.textContent).not.toContain('Dashboard data could not be refreshed.')
    })

    topicShouldFail = true
    await act(async () => {
      await window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledTimes(2)
    })
    expect(mocks.toastError).toHaveBeenLastCalledWith('Repeated topics failure')
  })

  it('can reuse cached dashboard data across remounts with the same SWR cache', async () => {
    const cache = new Map()
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return { data: [topic] }
      if (url === '/courses/subjects') return { data: [subject] }
      throw new Error(`unexpected url ${url}`)
    })

    const first = renderHomePage(cache)
    await waitFor(() => {
      expect(first.container.textContent).toContain('Limits and continuity')
    })
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)

    act(() => {
      first.root.unmount()
    })
    first.container.remove()
    mountedRoots = mountedRoots.filter((entry) => entry.root !== first.root)

    mocks.apiGet.mockImplementation(() => new Promise(() => undefined))
    const second = renderHomePage(cache, { revalidateIfStale: false })

    expect(second.container.textContent).toContain('Limits and continuity')
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })
})

function renderHomePage(cache = new Map(), swrOverrides: Record<string, unknown> = {}) {
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
          dedupingInterval: 0,
          errorRetryCount: 0,
          ...swrOverrides,
        },
      },
      React.createElement(HomePage),
    ))
  })

  return { container, root }
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  return button
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
