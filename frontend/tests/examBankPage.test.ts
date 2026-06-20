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

  it('renders compact exam cards grouped by subject with session and progress', async () => {
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })

    expect(container.textContent).toContain('Bac exams')
    expect(container.textContent).toContain('Anglais')
    expect(container.textContent).toContain('Mathematics')
    expect(container.textContent).toContain('Physics')
    expect(container.textContent).toContain('2 exams')
    expect(container.textContent).toContain('2024')
    expect(container.textContent).toContain('Session normale')
    expect(container.textContent).toContain('Rattrapage')
    expect(container.textContent).toContain('1/4 complete')
    expect(container.textContent).toContain('2/4 complete')
    expect(container.querySelector('[aria-label="Problem completion status"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Solve it.')
  })

  it('links exam cards to the first problem in the workspace route', async () => {
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })

    const link = Array.from(container.querySelectorAll('a')).find((item) => item.getAttribute('href') === '/exam-bank/1?problem=11')
    expect(link?.getAttribute('href')).toBe('/exam-bank/1?problem=11')
    expect(mocks.apiGet).not.toHaveBeenCalledWith('/exam-bank/problems/11')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('redirects legacy problem query links into the workspace route', async () => {
    searchParams.delete('q')
    searchParams.set('problem', '11')
    renderExamBankPage()

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/exam-bank/1?problem=11', { scroll: false })
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
    items: [
      examResult(),
      examResult({
        id: 2,
        subject_id: 2,
        subject_title: 'Mathematics',
        title: '2023 Retake',
        year: 2023,
        session: 'Rattrapage',
        problemOffset: 20,
        problemStatuses: ['completed', 'completed', 'opened', 'not_started'],
      }),
      examResult({
        id: 3,
        subject_id: 3,
        subject_title: 'Physics',
        title: '2025 Normal',
        year: 2025,
        session: 'Session normale',
        problemOffset: 30,
        problemStatuses: ['opened', 'not_started', 'not_started', 'not_started'],
      }),
      examResult({
        id: 4,
        subject_id: 4,
        subject_title: 'Anglais',
        title: '2025 Normal',
        year: 2025,
        session: 'Session normale',
        problemOffset: 40,
        problemStatuses: ['not_started'],
      }),
    ],
    total: 4,
  }
}

function examResult(overrides: {
  id?: number
  subject_id?: number
  subject_title?: string
  title?: string
  year?: number
  session?: string
  problemOffset?: number
  problemStatuses?: string[]
} = {}) {
  const problemOffset = overrides.problemOffset ?? 10
  const problemStatuses = overrides.problemStatuses ?? ['completed', 'opened', 'not_started', 'not_started']

  return {
    id: overrides.id ?? 1,
    subject_id: overrides.subject_id ?? 2,
    subject_title: overrides.subject_title ?? 'Mathematics',
    title: overrides.title ?? '2024 Exam',
    year: overrides.year ?? 2024,
    session: overrides.session ?? 'Main',
    statement_url: '/statements/1.pdf',
    problems: problemStatuses.map((status, index) => ({
      id: problemOffset + index + 1,
      title: `Problem ${index + 1}`,
      statement: index === 0 ? 'Solve it.' : `Problem ${index + 1} statement.`,
      written_solution: '',
      written_solution_url: '',
      difficulty: 'Medium',
      concept_slugs: ['algebra'],
      progress_status: status,
      saved: index === 1,
    })),
  }
}

