// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import React, { act } from 'react'
import { SWRConfig, type State } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiSWRConfig } from '@/lib/apiData'

const searchParams = new URLSearchParams()

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
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
  patchJson: mocks.apiPatch,
  postJson: mocks.apiPost,
}))

import ExerciseBankPage from '@/app/(dashboard)/exercise-bank/page'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  Array.from(searchParams.keys()).forEach((key) => searchParams.delete(key))
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (url === '/courses/subjects') {
      return [
        { id: 2, title: 'Physique', chapter_count: 2, lesson_count: 9 },
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
      return { exercise: exerciseDetail({ saved: true, reveal_count: 1, solution_body: '$x=1$.' }), xp_awarded: 0 }
    }
    if (url === '/exercises/10/saved') {
      expect(body).toEqual({ saved: true })
      return { exercise: exerciseDetail({ saved: true, notes: 'Server note after refresh.' }), xp_awarded: 0 }
    }
    if (url === '/exercises/10/self-grade') {
      expect(body).toEqual({ self_grade: 'partial' })
      return { exercise: exerciseDetail({ saved: true, reveal_count: 1, self_grade: 'partial', solution_body: '$x=1$.' }), xp_awarded: 0 }
    }
    throw new Error(`unexpected POST ${url}`)
  })
  mocks.apiPatch.mockImplementation(async (url: string, body?: unknown) => {
    if (url === '/exercises/10/notes') {
      expect(body).toEqual({ notes: 'Review this before bac week.' })
      return { exercise: exerciseDetail({ notes: 'Review this before bac week.' }), xp_awarded: 0 }
    }
    throw new Error(`unexpected PATCH ${url}`)
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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ExerciseBankPage', () => {
  it('keeps the permanent sidebar out of the eager Exercise Bank page bundle', () => {
    const source = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'exercise-bank', 'page.tsx'), 'utf8')

    expect(source).toContain("import dynamic from 'next/dynamic'")
    expect(source).toContain("import('@/components/figma/permanent-sidebar')")
    expect(source).toContain('function ExerciseBankSidebar')
    expect(source).not.toContain("import { PermanentSidebar }")
  })

  it('shows a retryable subject error instead of an empty subject state', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') throw new Error('subject catalog offline')
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Could not load subjects')
      expect(container.textContent).toContain('subject catalog offline')
    })
    expect(container.textContent).not.toContain('No published subjects are available yet.')
  })

  it('shows a retryable exercise list error instead of an empty filtered state', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') {
        return [{ id: 2, title: 'Physique', chapter_count: 1, lesson_count: 4 }]
      }
      if (url.startsWith('/exercises/subjects/2')) throw new Error('exercise list offline')
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Could not load exercises')
      expect(container.textContent).toContain('exercise list offline')
    })
    expect(container.textContent).not.toContain('No exercises match these filters.')
  })

  it('offers subjects from the subject catalog even when they have no published topics', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') {
        return [{ id: 5, title: 'Mathematics', chapter_count: 0, lesson_count: 0 }]
      }
      if (url === '/exercises/subjects/5?limit=50') {
        return {
          subject_id: 5,
          topic_id: null,
          total: 1,
          items: [exerciseListItem({ id: 50, subject_id: 5, topic_id: null, title: 'Subject-only exercise' })],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Mathematics')
      expect(container.textContent).toContain('0 topics available')
      expect(container.textContent).toContain('Subject-only exercise')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/exercises/subjects/5?limit=50')
  })

  it('preloads inactive subject exercise lists on intent before selection', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') {
        return [
          { id: 2, title: 'Physique', chapter_count: 1, lesson_count: 4 },
          { id: 5, title: 'Mathematics', chapter_count: 0, lesson_count: 0 },
        ]
      }
      if (url === '/exercises/subjects/2?limit=50') {
        return {
          subject_id: 2,
          topic_id: null,
          total: 1,
          items: [exerciseListItem({ subject_id: 2 })],
        }
      }
      if (url === '/exercises/subjects/5?limit=50') {
        return {
          subject_id: 5,
          topic_id: null,
          total: 1,
          items: [exerciseListItem({ id: 50, subject_id: 5, topic_id: null, title: 'Math warmup' })],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Physique')
      expect(container.textContent).toContain('Mathematics')
      expect(container.textContent).toContain('Linear equation')
    })
    mocks.apiGet.mockClear()

    act(() => {
      buttonByText(container, 'Mathematics')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/exercises/subjects/5?limit=50')
    })

    mocks.apiGet.mockClear()
    act(() => {
      buttonByText(container, 'Mathematics')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('offers reset from an empty filtered list', async () => {
    searchParams.set('subject', '2')
    searchParams.set('difficulty', 'hard')
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') {
        return [{ id: 2, title: 'Physique', chapter_count: 1, lesson_count: 4 }]
      }
      if (url === '/exercises/subjects/2?limit=50&difficulty=hard') {
        return {
          subject_id: 2,
          topic_id: null,
          total: 0,
          items: [],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('No exercises match these filters.')
      expect(container.textContent).toContain('Reset filters')
    })

    await clickButton(container, 'Reset filters')
    expect(mocks.routerReplace).toHaveBeenCalledWith('/exercise-bank?subject=2', { scroll: false })
  })

  it('sorts and searches exercise cards locally', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') return [{ id: 2, title: 'Physique', chapter_count: 1, lesson_count: 4 }]
      if (url === '/exercises/subjects/2?limit=50') {
        return {
          subject_id: 2,
          topic_id: null,
          total: 3,
          items: [
            exerciseListItem({ id: 10, title: 'Slow algebra', estimated_minutes: 12, order: 1 }),
            exerciseListItem({ id: 11, title: 'Bac function', slug: 'bac-function', difficulty: 'bac', estimated_minutes: 6, order: 2 }),
            exerciseListItem({ id: 12, title: 'Fast geometry', slug: 'fast-geometry', difficulty: 'easy', estimated_minutes: 4, order: 3 }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Slow algebra')
      expect(container.textContent).toContain('Bac function')
      expect(container.textContent).toContain('Fast geometry')
    })

    const sortSelect = container.querySelector('select[aria-label="Sort exercises"]') as HTMLSelectElement | null
    await act(async () => {
      setSelectValue(sortSelect!, 'time')
      sortSelect!.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    await waitFor(() => {
      const text = container.textContent ?? ''
      expect(text.indexOf('Fast geometry')).toBeLessThan(text.indexOf('Bac function'))
      expect(text.indexOf('Bac function')).toBeLessThan(text.indexOf('Slow algebra'))
    })
    expect(mocks.routerReplace).toHaveBeenCalledWith('/exercise-bank?subject=2&sort=time', { scroll: false })

    const searchInput = container.querySelector('input[aria-label="Search exercises"]') as HTMLInputElement | null
    vi.useFakeTimers()
    mocks.routerReplace.mockClear()
    await act(async () => {
      setInputValue(searchInput!, 'function')
      searchInput!.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(container.textContent).toContain('1 exercise(s) in the current filtered list.')
      expect(container.textContent).toContain('Bac function')
      expect(container.textContent).not.toContain('Slow algebra')
      expect(container.textContent).not.toContain('Fast geometry')
    })
    expect(mocks.routerReplace).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(220)
      await Promise.resolve()
    })
    expect(mocks.routerReplace).toHaveBeenCalledWith('/exercise-bank?subject=2&q=function&sort=time', { scroll: false })
  })

  it('loads exercises, syncs filters, reveals correction, and saves self-grade', async () => {
    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Physique')
      expect(container.textContent).toContain('Linear equation')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/exercises/subjects/2?limit=50')
    expect(exerciseDetailLoadCount(10)).toBe(0)

    act(() => {
      buttonByText(container, "s'exercer")?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(exerciseDetailLoadCount(10)).toBe(1)

    act(() => {
      buttonByText(container, "s'exercer")?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(exerciseDetailLoadCount(10)).toBe(1)

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

    const notesInput = container.querySelector('textarea[aria-label="Exercise private notes"]') as HTMLTextAreaElement | null
    await act(async () => {
      setTextareaValue(notesInput!, 'Review this before bac week.')
      notesInput!.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })

    await clickButton(container, 'Save')
    await waitFor(() => {
      expect(container.textContent).toContain('Saved')
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Exercise saved')
    })
    expect(mocks.apiPost).toHaveBeenCalledWith('/exercises/10/saved', { saved: true })
    expect(notesInput?.value).toBe('Review this before bac week.')

    await clickButton(container, 'Save notes')
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Notes saved')
    })
    expect(mocks.apiPatch).toHaveBeenCalledWith('/exercises/10/notes', { notes: 'Review this before bac week.' })

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
      expect(container.textContent).toContain('Saved')
    })
  })

  it('does not refetch exercise detail already in the SWR cache on card intent', async () => {
    const cache = new Map<string, State<unknown>>([
      ['/exercises/10', { data: exerciseDetail({ reveal_count: 0, solution_body: '$x=1$.' }) }],
    ])
    const { container } = renderExerciseBankPage(cache)

    await waitFor(() => {
      expect(container.textContent).toContain('Physique')
      expect(container.textContent).toContain('Linear equation')
    })
    mocks.apiGet.mockClear()

    act(() => {
      buttonByText(container, "s'exercer")?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })

    expect(mocks.apiGet).not.toHaveBeenCalledWith('/exercises/10')
  })

  it('syncs clean note drafts when the same exercise detail refreshes', async () => {
    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Linear equation')
    })
    await clickButton(container, "s'exercer")
    await waitFor(() => {
      expect(container.textContent).toContain('Solve $x+1=2$.')
    })

    await clickButton(container, 'Save')
    await waitFor(() => {
      const notesInput = container.querySelector('textarea[aria-label="Exercise private notes"]') as HTMLTextAreaElement | null
      expect(notesInput?.value).toBe('Server note after refresh.')
    })
  })

  it('explains and disables private notes for a free preview without subject access', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') return [{ id: 2, title: 'Physique', chapter_count: 2, lesson_count: 9 }]
      if (url.startsWith('/exercises/subjects/2')) {
        return { subject_id: 2, topic_id: null, total: 1, items: [exerciseListItem({ is_free_preview: true, access_reason: 'free_preview' })] }
      }
      if (url === '/exercises/10') {
        return exerciseDetail({ is_free_preview: true, access_reason: 'free_preview', can_save_notes: false })
      }
      throw new Error(`unexpected GET ${url}`)
    })

    const { container } = renderExerciseBankPage()
    await waitFor(() => expect(container.textContent).toContain('Linear equation'))
    await clickButton(container, "s'exercer")

    await waitFor(() => {
      expect(container.textContent).toContain('Unlock this subject to write and save private revision notes.')
    })
    const notesInput = container.querySelector('textarea[aria-label="Exercise private notes"]') as HTMLTextAreaElement | null
    expect(notesInput?.disabled).toBe(true)
    expect(mocks.apiPatch).not.toHaveBeenCalled()
  })

  it('keeps dirty notes when the user cancels leaving the detail view', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Linear equation')
    })
    await clickButton(container, "s'exercer")
    await waitFor(() => {
      expect(container.textContent).toContain('Solve $x+1=2$.')
    })

    const notesInput = container.querySelector('textarea[aria-label="Exercise private notes"]') as HTMLTextAreaElement | null
    await act(async () => {
      setTextareaValue(notesInput!, 'Do not lose this note.')
      notesInput!.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })

    await clickButton(container, 'Back to list')
    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved notes for this exercise. Discard them?')
    expect(container.textContent).toContain('Private notes')
    expect(notesInput?.value).toBe('Do not lose this note.')

    confirmSpy.mockReturnValue(true)
    await clickButton(container, 'Back to list')
    await waitFor(() => {
      expect(container.textContent).toContain('2 exercise(s) in the current filtered list.')
    })
    expect(container.textContent).not.toContain('Private notes')
  })

  it('does not render a previous exercise detail while a newly selected exercise is loading', async () => {
    let resolveSecondDetail: ((value: unknown) => void) | null = null
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') return [{ id: 2, title: 'Physique', chapter_count: 1, lesson_count: 4 }]
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
      if (url === '/courses/subjects') return [{ id: 2, title: 'Physique', chapter_count: 1, lesson_count: 4 }]
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

  it('removes an unsaved exercise from the active saved-only list', async () => {
    searchParams.set('subject', '2')
    searchParams.set('saved', 'true')
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/subjects') return [{ id: 2, title: 'Physique', chapter_count: 1, lesson_count: 4 }]
      if (url === '/exercises/subjects/2?limit=50&saved=true') {
        return {
          subject_id: 2,
          topic_id: null,
          total: 1,
          items: [exerciseListItem({ saved: true })],
        }
      }
      if (url === '/exercises/10') return exerciseDetail({ saved: true })
      throw new Error(`unexpected GET ${url}`)
    })
    mocks.apiPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/exercises/10/saved') {
        expect(body).toEqual({ saved: false })
        return { exercise: exerciseDetail({ saved: false }), xp_awarded: 0 }
      }
      throw new Error(`unexpected POST ${url}`)
    })
    const { container } = renderExerciseBankPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Linear equation')
    })
    await clickButton(container, "s'exercer")
    await waitFor(() => {
      expect(container.textContent).toContain('Solve $x+1=2$.')
      expect(container.textContent).toContain('Saved')
    })

    await clickButton(container, 'Saved')
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Exercise unsaved')
    })

    await clickButton(container, 'Back to list')
    await waitFor(() => {
      expect(container.textContent).toContain('0 exercise(s) in the current filtered list.')
      expect(container.textContent).toContain('No exercises match these filters.')
    })
    expect(container.textContent).not.toContain('Linear equation')
  })
})

function renderExerciseBankPage(cache = new Map<string, State<unknown>>()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { ...apiSWRConfig, provider: () => cache, dedupingInterval: 0, errorRetryCount: 0 } },
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

function buttonByText(container: HTMLElement, name: string, index = 0) {
  return Array.from(container.querySelectorAll('button')).filter((item) => item.textContent?.includes(name))[index]
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(textarea, value)
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

function exerciseDetailLoadCount(exerciseId: number) {
  return mocks.apiGet.mock.calls.filter(([url]) => url === `/exercises/${exerciseId}`).length
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
    can_save_notes: true,
    metadata_json: {},
    ...overrides,
  }
}
