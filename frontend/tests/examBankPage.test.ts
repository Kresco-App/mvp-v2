// @vitest-environment jsdom

import React, { act } from 'react'
import { SWRConfig } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiSWRConfig } from '@/lib/apiData'

const searchParams = new URLSearchParams('q=waves')

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  routerReplace: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/exam-bank',
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => searchParams,
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

vi.mock('@/components/figma', () => ({
  SkeletonBlock: (props: React.HTMLAttributes<HTMLDivElement>) => React.createElement('div', props),
}))

import ExamBankPage from '@/app/(dashboard)/exam-bank/page'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  document.body.innerHTML = ''
  searchParams.delete('q')
  searchParams.delete('progress_status')
  searchParams.delete('saved')
  searchParams.delete('problem')
  searchParams.set('q', 'waves')
  mocks.apiGet.mockResolvedValue(examListResponse())
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
  vi.useRealTimers()
})

describe('exam bank page', () => {
  it('hydrates search state from the URL and syncs query updates back to the router', async () => {
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })

    const input = container.querySelector('input[aria-label="Search exam bank"]') as HTMLInputElement | null
    expect(input?.value).toBe('waves')
    expect(mocks.apiGet).toHaveBeenCalledWith('/exam-bank?q=waves')

    await act(async () => {
      setInputValue(input!, 'limits')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
      vi.advanceTimersByTime(280)
      await flushPromises()
    })

    expect(mocks.routerReplace).toHaveBeenCalledWith('/exam-bank?q=limits', { scroll: false })
    expect(mocks.apiGet).toHaveBeenLastCalledWith('/exam-bank?q=limits')
  })

  it('syncs the progress filter to the router and Exam Bank API', async () => {
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })

    const progressSelect = container.querySelector('select[aria-label="Filter exam bank by progress"]') as HTMLSelectElement | null
    expect(progressSelect?.value).toBe('')

    await act(async () => {
      setSelectValue(progressSelect!, 'completed')
      progressSelect!.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/exam-bank?q=waves&progress_status=completed', { scroll: false })
      expect(mocks.apiGet).toHaveBeenLastCalledWith('/exam-bank?q=waves&progress_status=completed')
    })

    const savedSelect = container.querySelector('select[aria-label="Filter exam bank by saved state"]') as HTMLSelectElement | null
    expect(savedSelect?.value).toBe('all')
  })

  it('hydrates saved filters from the URL and requests the matching Exam Bank API key', async () => {
    searchParams.set('saved', 'false')
    const first = renderExamBankPage()

    await waitFor(() => {
      const savedSelect = first.container.querySelector('select[aria-label="Filter exam bank by saved state"]') as HTMLSelectElement | null
      expect(savedSelect?.value).toBe('unsaved')
      expect(mocks.apiGet).toHaveBeenCalledWith('/exam-bank?q=waves&saved=false')
    })

    act(() => {
      mountedRoot?.root.unmount()
    })
    first.container.remove()
    mountedRoot = null
    vi.clearAllMocks()
    searchParams.set('saved', 'true')
    const second = renderExamBankPage()

    await waitFor(() => {
      const savedSelect = second.container.querySelector('select[aria-label="Filter exam bank by saved state"]') as HTMLSelectElement | null
      expect(savedSelect?.value).toBe('saved')
      expect(mocks.apiGet).toHaveBeenCalledWith('/exam-bank?q=waves&saved=true')
    })
  })

  it('opens a problem detail view with part enonce and correction data', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/exam-bank?q=waves') return examListResponse()
      if (url === '/exam-bank/problems/11') return examProblemDetail()
      throw new Error(`unexpected GET ${url}`)
    })
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })

    await clickButton(container, 'Open problem')

    await waitFor(() => {
      expect(container.textContent).toContain('Problem 1')
      expect(container.textContent).toContain('Part A')
      expect(container.textContent).toContain('Study the wave graph.')
      expect(container.textContent).toContain('Use the period from the graph.')
      expect(container.textContent).toContain('Resource video part')
      expect(container.textContent).toContain('Locked part')
      expect(container.textContent).toContain('Subject locked. Unlock this subject')
      expect(container.textContent).toContain('Open video')
    })
    expect(container.textContent).not.toContain('Hidden locked part body')
    expect(container.querySelector('a[href="https://video.example/resource-correction"]')).not.toBeNull()
    expect(mocks.routerReplace).toHaveBeenCalledWith('/exam-bank?q=waves&problem=11', { scroll: false })
    expect(mocks.apiGet).toHaveBeenCalledWith('/exam-bank/problems/11')
    expect(mocks.apiPost).toHaveBeenCalledWith('/exam-bank/problems/11/progress', { status: 'opened' })

    await clickButton(container, 'Save')
    await waitFor(() => {
      expect(container.textContent).toContain('Saved')
    })
    expect(mocks.apiPost).toHaveBeenCalledWith('/exam-bank/problems/11/progress', { saved: true })

    await clickButton(container, 'Mark completed')
    await waitFor(() => {
      expect(container.textContent).toContain('Completed')
    })
    expect(mocks.apiPost).toHaveBeenCalledWith('/exam-bank/problems/11/progress', { status: 'completed' })
  })

  it('hides cached unlocked detail while the same problem detail revalidates', async () => {
    let detailCalls = 0
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/exam-bank?q=waves') return examListResponse()
      if (url === '/exam-bank/problems/11') {
        detailCalls += 1
        if (detailCalls === 1) return examProblemDetail({ statement: 'Unlocked cached statement.' })
        return new Promise(() => undefined)
      }
      throw new Error(`unexpected GET ${url}`)
    })
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })
    await clickButton(container, 'Open problem')
    await waitFor(() => {
      expect(container.textContent).toContain('Unlocked cached statement.')
    })
    await clickButton(container, 'Back to exam list')
    await clickButton(container, 'Open problem')

    expect(container.textContent).not.toContain('Unlocked cached statement.')
    expect(detailCalls).toBe(2)
  })

  it('revalidates the list after auto-opening a problem from a not-started filter', async () => {
    searchParams.set('progress_status', 'not_started')
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/exam-bank?q=waves&progress_status=not_started') return examListResponse()
      if (url === '/exam-bank/problems/11') return examProblemDetail()
      throw new Error(`unexpected GET ${url}`)
    })
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })
    await clickButton(container, 'Open problem')
    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('/exam-bank/problems/11/progress', { status: 'opened' })
    })

    expect(mocks.apiGet).toHaveBeenCalledWith('/exam-bank?q=waves&progress_status=not_started')
    await waitFor(() => {
      expect(mocks.apiGet.mock.calls.filter(([url]) => url === '/exam-bank?q=waves&progress_status=not_started')).toHaveLength(2)
    })
  })
})

function renderExamBankPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { ...apiSWRConfig, provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0 } },
        React.createElement(ExamBankPage),
      ),
    )
  })

  return { container, root }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
}

function setSelectValue(input: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

async function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
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
        await flushPromises()
      })
    }
  }
  throw lastError
}

function examListResponse() {
  return {
    subject_id: null,
    topic_id: null,
    items: [examResult()],
    total: 1,
  }
}

function examResult() {
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
        progress_status: 'not_started',
        saved: false,
      },
    ],
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
        id: 102,
        exam_problem_id: 11,
        topic_id: 5,
        video_resource_id: 44,
        part_label: 'Part B',
        title: 'Resource video part',
        statement_body: 'Use the attached video resource.',
        written_solution_body: '',
        written_solution_url: '',
        correction_video_url: '',
        order: 2,
        difficulty: 'bac',
        concept_slugs: ['waves'],
        metadata_json: {},
        can_access: true,
        video_resource: {
          id: 44,
          title: 'Resource correction video',
          provider: 'external',
          provider_resource_id: 'resource-video',
          url: 'https://video.example/resource-correction',
        },
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
