// @vitest-environment jsdom

import React, { act } from 'react'
import { SWRConfig } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiSWRConfig } from '@/lib/apiData'

const searchParams = new URLSearchParams()

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  routerReplace: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/exercise-bank',
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

import ExerciseBankPage from '@/app/(dashboard)/exercise-bank/page'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  searchParams.forEach((_value, key) => searchParams.delete(key))
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (url === '/courses/topics') {
      return [
        { id: 1, subject_id: 2, subject_title: 'Physique', title: 'Ondes' },
        { id: 2, subject_id: 2, subject_title: 'Physique', title: 'Optique' },
      ]
    }
    if (url.startsWith('/exercises/subjects/2')) {
      return {
        subject_id: 2,
        topic_id: null,
        total: 2,
        items: [exerciseListItem(), exerciseListItem({ id: 11, title: 'Quadratic equation', slug: 'quadratic-equation' })],
      }
    }
    if (url === '/exercises/10') return exerciseDetail({ reveal_count: 0, solution_body: '$x=1$.' })
    if (url === '/exercises/11') return exerciseDetail({ id: 11, title: 'Quadratic equation', slug: 'quadratic-equation', statement_body: 'Solve $x^2=1$.' })
    throw new Error(`unexpected GET ${url}`)
  })
  mocks.apiPost.mockImplementation(async (url: string, body?: unknown) => {
    if (url === '/exercises/10/reveal') {
      return { exercise: exerciseDetail({ reveal_count: 1, solution_body: '$x=1$.' }), xp_awarded: 0 }
    }
    if (url === '/exercises/10/self-grade') {
      expect(body).toEqual({ self_grade: 'partial' })
      return { exercise: exerciseDetail({ reveal_count: 1, self_grade: 'partial', solution_body: '$x=1$.' }), xp_awarded: 0 }
    }
    throw new Error(`unexpected POST ${url}`)
  })
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
  }
  mountedRoot = null
})

describe('ExerciseBankPage', () => {
  it('loads exercises, syncs filters, reveals correction, and saves self-grade', async () => {
    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Physique')
      expect(container.textContent).toContain('Linear equation')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/exercises/subjects/2?limit=50')

    const difficultySelect = container.querySelector('select[aria-label="Difficulty"]') as HTMLSelectElement | null
    await act(async () => {
      setSelectValue(difficultySelect!, 'medium')
      difficultySelect!.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(mocks.routerReplace).toHaveBeenCalledWith('/exercise-bank?subject=2&difficulty=medium', { scroll: false })

    await clickButton(container, "s'exercer")
    await waitFor(() => {
      expect(container.textContent).toContain('Try the exercise first')
      expect(container.textContent).toContain('Solve $x+1=2$.')
    })

    await clickButton(container, 'Reveal correction')
    await waitFor(() => {
      expect(container.textContent).toContain('$x=1$.')
    })

    await clickButton(container, 'Partiel')
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Self-grade saved')
    })

    await clickButton(container, 'Back to list')
    await waitFor(() => {
      expect(container.textContent).toContain('Partiel')
    })
  })

  it('does not render a previous exercise detail while a newly selected exercise is loading', async () => {
    let resolveSecondDetail: ((value: unknown) => void) | null = null
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return [{ id: 1, subject_id: 2, subject_title: 'Physique', title: 'Ondes' }]
      if (url.startsWith('/exercises/subjects/2')) {
        return {
          subject_id: 2,
          topic_id: null,
          total: 2,
          items: [exerciseListItem(), exerciseListItem({ id: 11, title: 'Quadratic equation', slug: 'quadratic-equation' })],
        }
      }
      if (url === '/exercises/10') return exerciseDetail({ statement_body: 'Old statement' })
      if (url === '/exercises/11') {
        return new Promise((resolve) => {
          resolveSecondDetail = resolve
        })
      }
      throw new Error(`unexpected GET ${url}`)
    })
    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Linear equation')
      expect(container.textContent).toContain('Quadratic equation')
    })
    await clickButton(container, "s'exercer")
    await waitFor(() => {
      expect(container.textContent).toContain('Old statement')
    })
    await clickButton(container, 'Back to list')
    await clickButton(container, "s'exercer", 1)

    expect(container.textContent).not.toContain('Old statement')

    await act(async () => {
      resolveSecondDetail?.(exerciseDetail({ id: 11, title: 'Quadratic equation', slug: 'quadratic-equation', statement_body: 'New statement' }))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(container.textContent).toContain('New statement')
    })
  })

  it('does not render previous filter results while a new exercise list is loading', async () => {
    let resolveFilteredList: ((value: unknown) => void) | null = null
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/topics') return [{ id: 1, subject_id: 2, subject_title: 'Physique', title: 'Ondes' }]
      if (url === '/exercises/subjects/2?limit=50') {
        return {
          subject_id: 2,
          topic_id: null,
          total: 1,
          items: [exerciseListItem({ title: 'Visible before filter' })],
        }
      }
      if (url === '/exercises/subjects/2?limit=50&difficulty=hard') {
        return new Promise((resolve) => {
          resolveFilteredList = resolve
        })
      }
      throw new Error(`unexpected GET ${url}`)
    })
    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Visible before filter')
    })
    const difficultySelect = container.querySelector('select[aria-label="Difficulty"]') as HTMLSelectElement | null
    await act(async () => {
      setSelectValue(difficultySelect!, 'hard')
      difficultySelect!.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).not.toContain('Visible before filter')

    await act(async () => {
      resolveFilteredList?.({
        subject_id: 2,
        topic_id: null,
        total: 1,
        items: [exerciseListItem({ id: 12, title: 'Hard exercise', slug: 'hard-exercise', difficulty: 'hard' })],
      })
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(container.textContent).toContain('Hard exercise')
    })
  })
})

function renderExerciseBankPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { ...apiSWRConfig, provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0 } },
        React.createElement(ExerciseBankPage),
      ),
    )
  })

  return { container, root }
}

async function clickButton(container: HTMLElement, name: string, index = 0) {
  const buttons = Array.from(container.querySelectorAll('button')).filter((item) => item.textContent?.includes(name))
  const button = buttons[index]
  if (!button) throw new Error(`button not found: ${name}`)
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
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

function exerciseListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    subject_id: 2,
    topic_id: 1,
    title: 'Linear equation',
    slug: 'linear-equation',
    summary: 'Basic equation',
    difficulty: 'medium',
    estimated_minutes: 10,
    order: 1,
    concept_slugs: ['linear-equations'],
    is_free_preview: false,
    self_grade: 'not_started',
    saved: false,
    has_solution_body: true,
    has_solution_video: false,
    asset_count: 0,
    can_access: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function exerciseDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...exerciseListItem(),
    statement_body: 'Solve $x+1=2$.',
    solution_body: '',
    solution_video_url: '',
    assets: [],
    reveal_count: 0,
    first_revealed_at: null,
    last_revealed_at: null,
    self_grade_history: [],
    notes: '',
    metadata_json: {},
    ...overrides,
  }
}
