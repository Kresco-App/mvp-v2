// @vitest-environment jsdom

import React, { act } from 'react'
import { SWRConfig, type State } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SubjectDetailPage from '@/app/(dashboard)/home/[subjectId]/page'
import { apiSWRConfig } from '@/lib/apiData'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ subjectId: '2' }),
}))

vi.mock('next/image', () => ({
  default: ({ fill: _fill, priority: _priority, unoptimized: _unoptimized, ...props }: Record<string, unknown>) => {
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

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const subject = {
  id: 2,
  title: 'Mathematics',
  description: 'Bac math path',
  thumbnail_url: '',
}

const topic = {
  id: 42,
  title: 'Limits and continuity',
  description: 'Core topic',
  item_count: 5,
  completed_count: 2,
  progress_pct: 40,
  can_access: true,
}

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

describe('Subject detail page data behavior', () => {
  it('uses shared SWR subject keys and reuses cached subject detail data across remounts', async () => {
    const cache = new Map<string, State<unknown>>()
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects/2') return { data: subject }
      if (url === '/courses/subjects/2/topics') return { data: [topic] }
      if (url === '/courses/topics/42/workspace') return { data: { topic_id: 42, items: [] } }
      throw new Error(`unexpected url ${url}`)
    })

    const first = renderSubjectPage(cache)

    await waitFor(() => {
      expect(first.container.textContent).toContain('Mathematics')
      expect(first.container.textContent).toContain('Limits and continuity')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/subjects/2')
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/subjects/2/topics')
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)

    unmountSubjectPage(first.root)
    mocks.apiGet.mockImplementation(() => new Promise(() => undefined))

    const second = renderSubjectPage(cache, { revalidateIfStale: false })

    expect(second.container.textContent).toContain('Mathematics')
    expect(second.container.textContent).toContain('Limits and continuity')
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

  it('preloads topic workspace data on topic card focus before navigation', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects/2') return { data: subject }
      if (url === '/courses/subjects/2/topics') return { data: [topic] }
      if (url === '/courses/topics/42/workspace') return { data: { topic_id: 42, items: [] } }
      throw new Error(`unexpected url ${url}`)
    })

    const page = renderSubjectPage()

    await waitFor(() => {
      expect(page.container.textContent).toContain('Limits and continuity')
    })
    mocks.apiGet.mockClear()

    const topicLink = Array.from(page.container.querySelectorAll('a[href="/topics/42"]'))
      .find((link) => link.textContent?.includes('Limits and continuity'))
    expect(topicLink).not.toBeNull()
    const topicCard = topicLink?.closest('.group')
    expect(topicCard).not.toBeNull()
    act(() => {
      topicCard?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/courses/topics/42/workspace')
    })

    mocks.apiGet.mockClear()
    act(() => {
      topicCard?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('preloads the subject exam discovery on exam link intent before navigation', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects/2') return { data: subject }
      if (url === '/courses/subjects/2/topics') return { data: [topic] }
      if (url === '/quizzes/subjects/2/discovery') return { data: { subjectId: '2', quiz: null } }
      throw new Error(`unexpected url ${url}`)
    })

    const page = renderSubjectPage()

    await waitFor(() => {
      expect(page.container.textContent).toContain('Mock exam')
    })
    mocks.apiGet.mockClear()

    const examLink = Array.from(page.container.querySelectorAll('a[href="/exam/2"]'))[0]
    expect(examLink).not.toBeNull()
    act(() => {
      examLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/quizzes/subjects/2/discovery')
    })

    mocks.apiGet.mockClear()
    act(() => {
      examLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('does not refetch a topic workspace already in the SWR cache', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects/2') return { data: subject }
      if (url === '/courses/subjects/2/topics') return { data: [topic] }
      throw new Error(`unexpected url ${url}`)
    })
    const cache = new Map<string, State<unknown>>([
      ['/courses/topics/42/workspace', { data: { topic_id: 42, items: [] } }],
    ])

    const page = renderSubjectPage(cache)

    await waitFor(() => {
      expect(page.container.textContent).toContain('Limits and continuity')
    })
    mocks.apiGet.mockClear()

    const topicLink = Array.from(page.container.querySelectorAll('a[href="/topics/42"]'))
      .find((link) => link.textContent?.includes('Limits and continuity'))
    const topicCard = topicLink?.closest('.group')
    act(() => {
      topicCard?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    expect(mocks.apiGet).not.toHaveBeenCalledWith('/courses/topics/42/workspace')
  })
})

function renderSubjectPage(cache = new Map<string, State<unknown>>(), swrOverrides: Record<string, unknown> = {}) {
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
      React.createElement(SubjectDetailPage),
    ))
  })

  return { container, root }
}

function unmountSubjectPage(root: Root) {
  const entry = mountedRoots.find((item) => item.root === root)
  if (!entry) return
  act(() => {
    entry.root.unmount()
  })
  entry.container.remove()
  mountedRoots = mountedRoots.filter((item) => item.root !== root)
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
