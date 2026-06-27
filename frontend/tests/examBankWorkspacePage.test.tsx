// @vitest-environment jsdom

import React, { act } from 'react'
import { SWRConfig, type State } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiSWRConfig } from '@/lib/apiData'

const searchParams = new URLSearchParams('problem=11')

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  routerReplace: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ examId: '1' }),
  usePathname: () => '/exam-bank/1',
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => searchParams,
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  motion: {
    div: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.apiGet,
  postJson: mocks.apiPost,
}))

vi.mock('@/components/figma/skeletons', () => ({
  FigmaVideoWorkspaceSkeleton: () => React.createElement('div', { role: 'status' }, 'Loading workspace'),
}))

vi.mock('@/components/figma/workspace', () => ({
  LessonBody: ({ children }: { children?: React.ReactNode }) => React.createElement('article', null, children),
  VideoFrameState: ({ title, message }: { title: string; message: string }) => (
    React.createElement('section', { role: 'status' }, title, message)
  ),
  VideoPlayerFrame: ({ videoId }: { videoId?: string }) => (
    React.createElement('iframe', { title: 'Kresco lesson video', src: `https://www.youtube-nocookie.com/embed/${videoId}` })
  ),
  VideoLearningWorkspace: ({
    breadcrumb,
    children,
    primaryContent,
    rail,
    tabs,
    title,
    onTabSelect,
  }: {
    breadcrumb?: string
    children?: React.ReactNode
    primaryContent?: React.ReactNode
    rail?: {
      heading?: string
      completed?: number
      total?: number
      value?: number
      sections?: Array<{ id: string | number; title: string; copy: string; items?: Array<{ id?: string | number; label: string; meta?: string }> }>
      onItemPreload?: (item: { id?: string | number; label: string }) => void
      onItemSelect?: (item: { id?: string | number; label: string }) => void
    }
    tabs?: Array<{ id?: string | number; label: string; active?: boolean }>
    title?: string
    onTabSelect?: (tab: { id?: string | number; label: string }) => void
  }) => React.createElement(
    'div',
    { 'data-testid': 'workspace' },
    React.createElement('p', null, breadcrumb),
    React.createElement('h1', null, title),
    React.createElement('div', { 'data-testid': 'primary-video' }, primaryContent),
    React.createElement('nav', { 'aria-label': 'Workspace tabs' }, tabs?.map((tab) => (
      React.createElement('button', { key: tab.id, type: 'button', 'aria-label': tab.label, onClick: () => onTabSelect?.(tab) }, tab.label)
    ))),
    React.createElement('aside', null,
      React.createElement('strong', null, rail?.heading),
      React.createElement('span', null, `${rail?.completed}/${rail?.total} - ${rail?.value}%`),
      rail?.sections?.map((section) => React.createElement(
        'section',
        { key: section.id },
        React.createElement('h2', null, section.title),
        React.createElement('p', null, section.copy),
        section.items?.map((item) => (
          React.createElement(
            'button',
            {
              key: item.id,
              type: 'button',
              onClick: () => rail.onItemSelect?.(item),
              onFocus: () => rail.onItemPreload?.(item),
              onPointerEnter: () => rail.onItemPreload?.(item),
            },
            item.label,
            item.meta,
          )
        )),
      )),
    ),
    children,
  ),
}))

import ExamWorkspacePage from '@/app/(dashboard)/exam-bank/[examId]/page'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  window.localStorage.clear()
  searchParams.delete('problem')
  searchParams.set('problem', '11')
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (url === '/exam-bank') return examListResponse()
    if (url === '/exam-bank/problems/11') return examProblemDetail()
    if (url === '/exam-bank/problems/12') return examProblemDetail({ id: 12, title: 'Problem 2', statement: 'Mechanics statement.' })
    throw new Error(`unexpected GET ${url}`)
  })
  mocks.apiPost.mockImplementation(async (_url: string, body?: { status?: string; saved?: boolean }) => ({
    exam_problem_id: 11,
    status: body?.status ?? 'opened',
    saved: body?.saved ?? false,
    opened_at: '2026-01-01T00:00:00Z',
    completed_at: body?.status === 'completed' ? '2026-01-01T00:01:00Z' : null,
    last_activity_at: '2026-01-01T00:01:00Z',
  }))
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
})

describe('exam workspace page', () => {
  it('renders a topic-style workspace with problem video, rail, written, solutions, and resources', async () => {
    const { container } = renderExamWorkspacePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Mathematics: Problem 1')
      expect(container.textContent).toContain('Exam problems')
      expect(container.textContent).toContain('0/2 - 0%')
      expect(container.querySelector('iframe[title="Kresco lesson video"]')?.getAttribute('src')).toContain('yt-problem-1')
    })

    expect(mocks.apiPost).toHaveBeenCalledWith('/exam-bank/problems/11/progress', { status: 'opened' })
    expect(examBankListLoadCount()).toBe(1)
    expect(container.textContent).toContain('Solve it.')
    expect(container.textContent).toContain('Study the wave graph.')
    expect(container.textContent).not.toContain('Hidden locked part body')

    expect(problemDetailLoadCount(12)).toBe(0)
    act(() => {
      buttonByText(container, 'Problem 2')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(problemDetailLoadCount(12)).toBe(1)
    act(() => {
      buttonByText(container, 'Problem 2')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(problemDetailLoadCount(12)).toBe(1)

    await clickButton(container, 'Solutions')
    await waitFor(() => {
      expect(container.textContent).toContain('Main correction.')
      expect(container.textContent).toContain('Use the period from the graph.')
    })

    await clickButton(container, 'Resources')
    await waitFor(() => {
      expect(container.querySelector('a[href="/statements/1.pdf"]')).not.toBeNull()
      expect(container.querySelector('a[href="/topics/5"]')).not.toBeNull()
    })

    await clickButton(container, 'Notes')
    let textarea: HTMLTextAreaElement | null = null
    await waitFor(() => {
      textarea = container.querySelector('textarea[aria-label="Exam problem notes"]') as HTMLTextAreaElement | null
      expect(textarea).not.toBeNull()
    })
    vi.useFakeTimers()
    try {
      await act(async () => {
        setTextareaValue(textarea!, 'Redo the period calculation.')
        textarea!.dispatchEvent(new Event('input', { bubbles: true }))
        await flushPromises()
      })
      expect(window.localStorage.getItem('kresco:exam-problem-note:v1:11')).toBeNull()

      window.dispatchEvent(new Event('pagehide'))

      expect(window.localStorage.getItem('kresco:exam-problem-note:v1:11')).toBe('Redo the period calculation.')
      expect(window.localStorage.getItem('kresco-exam-problem-note:11')).toBeNull()
    } finally {
      vi.useRealTimers()
    }

    await clickButton(container, 'Save problem')
    expect(mocks.apiPost).toHaveBeenCalledWith('/exam-bank/problems/11/progress', { saved: true })
    expect(examBankListLoadCount()).toBe(1)

    await clickButton(container, 'Problem 2')
    expect(mocks.routerReplace).toHaveBeenCalledWith('/exam-bank/1?problem=12', { scroll: false })
  })

  it('does not refetch problem details already in the SWR cache on rail preload intent', async () => {
    const cache = new Map<string, State<unknown>>([
      ['/exam-bank/problems/12', { data: examProblemDetail({ id: 12, title: 'Cached problem 2', statement: 'Cached mechanics statement.' }) }],
    ])
    const { container } = renderExamWorkspacePage(cache)

    await waitFor(() => {
      expect(container.textContent).toContain('Mathematics: Problem 1')
      expect(buttonByText(container, 'Problem 2')).toBeDefined()
    })
    mocks.apiGet.mockClear()

    act(() => {
      buttonByText(container, 'Problem 2')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })

    expect(mocks.apiGet).not.toHaveBeenCalledWith('/exam-bank/problems/12')
  })

  it('suppresses unsafe stored resource and embed urls', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/exam-bank') return examListResponse({ statement_url: 'javascript:alert(1)' })
      if (url === '/exam-bank/problems/11') {
        return examProblemDetail({
          written_solution_url: 'javascript:alert(2)',
          video_resource: {
            id: 88,
            title: 'Unsafe provider',
            provider: 'custom',
            provider_resource_id: '',
            url: 'https://evil.example/embed',
          },
          parts: [
            {
              id: 101,
              exam_problem_id: 11,
              topic_id: 5,
              video_resource_id: null,
              part_label: 'Part A',
              title: 'Wave reading',
              statement_body: 'Study the wave graph.',
              written_solution_body: 'Use the period from the graph.',
              written_solution_url: '',
              correction_video_url: 'javascript:alert(3)',
              order: 1,
              difficulty: 'bac',
              concept_slugs: ['waves'],
              metadata_json: {},
              can_access: true,
            },
          ],
        })
      }
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExamWorkspacePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Video not ready')
      expect(container.querySelector('iframe[src*="evil.example"]')).toBeNull()
    })

    await clickButton(container, 'Resources')
    await waitFor(() => {
      expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
      expect(container.querySelector('a[href*="evil.example"]')).toBeNull()
      expect(container.querySelector('a[href="/topics/5"]')).not.toBeNull()
    })
  })

  it('reuses restored note drafts when returning to an already opened problem', async () => {
    const firstProblemNoteKey = 'kresco:exam-problem-note:v1:11'
    const secondProblemNoteKey = 'kresco:exam-problem-note:v1:12'
    window.localStorage.setItem(firstProblemNoteKey, 'Cached note for problem 1')
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

    try {
      const { container } = renderExamWorkspacePage()

      await waitFor(() => {
        expect(container.textContent).toContain('Mathematics: Problem 1')
      })

      expect(storageGetCount(getItemSpy, firstProblemNoteKey)).toBe(1)

      await clickButton(container, 'Problem 2')
      await waitFor(() => {
        expect(container.textContent).toContain('Problem 2')
      })

      expect(storageGetCount(getItemSpy, secondProblemNoteKey)).toBe(1)

      await clickButton(container, 'Problem 1')
      await waitFor(() => {
        expect(container.textContent).toContain('Mathematics: Problem 1')
      })

      expect(storageGetCount(getItemSpy, firstProblemNoteKey)).toBe(1)
    } finally {
      getItemSpy.mockRestore()
    }
  })
})

function renderExamWorkspacePage(cache = new Map<string, State<unknown>>()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { ...apiSWRConfig, provider: () => cache, dedupingInterval: 0, errorRetryCount: 0 } },
        React.createElement(ExamWorkspacePage),
      ),
    )
  })

  return { container, root }
}

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(input, value)
}

async function clickButton(container: HTMLElement, name: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((item) => item.getAttribute('aria-label') === name)
    ?? buttons.find((item) => item.textContent?.trim() === name)
    ?? buttons.find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  await act(async () => {
    button.click()
    await flushPromises()
  })
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes(text))
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 40; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await flushPromises()
      })
    }
  }
  throw lastError
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function examBankListLoadCount() {
  return mocks.apiGet.mock.calls.filter(([url]) => url === '/exam-bank').length
}

function problemDetailLoadCount(problemId: number) {
  return mocks.apiGet.mock.calls.filter(([url]) => url === `/exam-bank/problems/${problemId}`).length
}

function storageGetCount(spy: ReturnType<typeof vi.spyOn<Storage, 'getItem'>>, key: string) {
  return spy.mock.calls.filter(([requestedKey]) => requestedKey === key).length
}

function examListResponse(overrides: Record<string, unknown> = {}) {
  return {
    subject_id: null,
    topic_id: null,
    items: [examResult(overrides)],
    total: 1,
  }
}

function examResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subject_id: 2,
    subject_title: 'Mathematics',
    title: '2024 Exam',
    year: 2024,
    session: 'Main',
    statement_url: '/statements/1.pdf',
    problems: [
      {
        id: 11,
        title: 'Problem 1',
        statement: 'Solve it.',
        written_solution: '',
        written_solution_url: '',
        difficulty: 'Medium',
        concept_slugs: ['algebra'],
        progress_status: 'completed',
        saved: false,
      },
      {
        id: 12,
        title: 'Problem 2',
        statement: 'Second problem.',
        written_solution: '',
        written_solution_url: '',
        difficulty: 'Medium',
        concept_slugs: ['mechanics'],
        progress_status: 'not_started',
        saved: false,
      },
    ],
    ...overrides,
  }
}

function examProblemDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    exam_id: 1,
    topic_id: 5,
    title: 'Problem 1',
    statement: 'Solve it.',
    written_solution: 'Main correction.',
    written_solution_url: '',
    difficulty: 'Medium',
    concept_slugs: ['waves'],
    video_resource: {
      id: 88,
      title: 'Problem correction video',
      provider: 'youtube',
      provider_resource_id: 'yt-problem-1',
    },
    exam_title: '2024 Exam',
    subject_title: 'Mathematics',
    year: 2024,
    session: 'Main',
    can_access: true,
    progress_status: 'not_started',
    saved: false,
    parts: [
      {
        id: 101,
        exam_problem_id: 11,
        topic_id: 5,
        video_resource_id: null,
        part_label: 'Part A',
        title: 'Wave reading',
        statement_body: 'Study the wave graph.',
        written_solution_body: 'Use the period from the graph.',
        written_solution_url: '',
        correction_video_url: 'https://video.example/correction',
        order: 1,
        difficulty: 'bac',
        concept_slugs: ['waves'],
        metadata_json: {},
        can_access: true,
      },
      {
        id: 103,
        exam_problem_id: 11,
        topic_id: 5,
        video_resource_id: null,
        part_label: 'Part C',
        title: 'Locked part',
        statement_body: 'Hidden locked part body',
        written_solution_body: 'Hidden locked solution',
        written_solution_url: '',
        correction_video_url: '',
        order: 3,
        difficulty: 'bac',
        concept_slugs: ['waves'],
        metadata_json: {},
        can_access: false,
        locked_reason: 'subject_access_required',
      },
    ],
    ...overrides,
  }
}
