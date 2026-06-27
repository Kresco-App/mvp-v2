// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act } from 'react'
import { SWRConfig, type State } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CoursesPage from '@/app/(dashboard)/courses/page'
import { apiSWRConfig } from '@/lib/apiData'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  routerReplace: vi.fn(),
  searchParams: new URLSearchParams(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/courses',
  useRouter: () => ({
    replace: mocks.routerReplace,
  }),
  useSearchParams: () => mocks.searchParams,
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

const topic = {
  id: 42,
  subject_id: 2,
  subject_title: 'Mathematics',
  slug: 'limits-and-continuity',
  title: 'Limits and continuity',
  description: 'Core Bac topic',
  is_free_preview: false,
  item_count: 5,
  completed_count: 2,
  progress_pct: 40,
  concepts: [],
  can_access: true,
}

const algebraTopic = {
  ...topic,
  id: 77,
  slug: 'algebra-systems',
  title: 'Algebra systems',
  description: 'Linear systems practice',
  completed_count: 0,
  progress_pct: 0,
}

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.searchParams = new URLSearchParams()
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
  vi.useRealTimers()
})

describe('Courses page data behavior', () => {
  it('defers offscreen subject section cards until the section nears the viewport', () => {
    const source = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'courses', 'page.tsx'), 'utf8')

    expect(source).toContain("import { useNearViewport } from '@/hooks/useNearViewport'")
    expect(source).toContain('const CourseSubjectSection = memo(function CourseSubjectSection')
    expect(source).toContain('useNearViewport<HTMLElement>({ rootMargin: COURSE_SECTION_ROOT_MARGIN })')
    expect(source).toContain('const shouldRenderCards = eager || nearViewport')
    expect(source).toContain('data-course-section-placeholder')
    expect(source).toContain('[content-visibility:auto] [contain-intrinsic-size:0_780px]')
  })

  it('preloads topic workspace data on course card intent before navigation', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return { data: [topic] }
      if (url === '/courses/topics/42/workspace') return { data: { topic_id: 42, items: [] } }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderCoursesPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Limits and continuity')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/topics')
    mocks.apiGet.mockClear()

    const topicLink = getLink(container, '/topics/42', 'Limits and continuity')
    const topicCard = topicLink.closest('.group')
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

  it('does not refetch a topic workspace that is already in the SWR cache', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return { data: [topic] }
      throw new Error(`unexpected url ${url}`)
    })
    const cache = new Map<string, State<unknown>>([
      ['/courses/topics/42/workspace', { data: { topic_id: 42, items: [] } }],
    ])

    const { container } = renderCoursesPage(cache)

    await waitFor(() => {
      expect(container.textContent).toContain('Limits and continuity')
    })
    mocks.apiGet.mockClear()

    const topicLink = getLink(container, '/topics/42', 'Limits and continuity')
    const topicCard = topicLink.closest('.group')
    act(() => {
      topicCard?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    expect(mocks.apiGet).not.toHaveBeenCalledWith('/courses/topics/42/workspace')
  })

  it('closes the subject filter dropdown with Escape and restores trigger focus', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return { data: [topic] }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderCoursesPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Limits and continuity')
    })

    const subjectTrigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')
    expect(subjectTrigger?.getAttribute('aria-label')).toBe('Filter courses by subject')
    expect(subjectTrigger).not.toBeNull()

    act(() => {
      subjectTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const listbox = container.querySelector<HTMLElement>('[role="listbox"]')
    expect(listbox).not.toBeNull()

    vi.useFakeTimers()
    act(() => {
      listbox?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(subjectTrigger?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(subjectTrigger)

    await act(async () => {
      vi.advanceTimersByTime(160)
      await Promise.resolve()
    })
    vi.useRealTimers()

    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('keeps search controls responsive while deferred catalog results catch up', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return { data: [topic, algebraTopic] }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderCoursesPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Limits and continuity')
      expect(container.textContent).toContain('Algebra systems')
    })

    const input = getSearchInput(container)
    vi.useFakeTimers()
    mocks.routerReplace.mockClear()
    setInputValue(input, 'algebra')

    expect(input.value).toBe('algebra')
    expect(mocks.routerReplace).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(220)
      await Promise.resolve()
    })
    vi.useRealTimers()

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/courses?q=algebra', { scroll: false })
      expect(container.textContent).toContain('Algebra systems')
      expect(container.textContent).not.toContain('Limits and continuity')
    })
  })
})

function renderCoursesPage(cache = new Map<string, State<unknown>>(), swrOverrides: Record<string, unknown> = {}) {
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
      React.createElement(CoursesPage),
    ))
  })

  return { container, root }
}

function getLink(container: HTMLElement, href: string, text: string) {
  const link = Array.from(container.querySelectorAll(`a[href="${href}"]`))
    .find((item) => item.textContent?.includes(text))
  if (!link) throw new Error(`link not found: ${href}`)
  return link
}

function getSearchInput(container: HTMLElement) {
  const input = Array.from(container.querySelectorAll('input[type="search"]'))
    .find((item) => item.getAttribute('placeholder') === 'Search courses') as HTMLInputElement | undefined
  if (!input) throw new Error('course search input not found')
  return input
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
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
