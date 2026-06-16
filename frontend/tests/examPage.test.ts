// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExamPage from '@/app/(dashboard)/exam/[subjectId]/page'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  retryExamData: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ subjectId: '42' }),
  useRouter: () => ({ back: mocks.routerBack, push: mocks.routerPush }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

vi.mock('@/lib/axios', () => ({
  default: {
    post: mocks.apiPost,
  },
}))

vi.mock('@/lib/examData', () => ({
  NO_EXAM_QUIZ_MESSAGE: 'Aucun quiz disponible pour cette matiere.',
  useExamQuizData: () => ({
    quiz: {
      id: 7,
      title: 'Timer exam',
      pass_score: 80,
      questions: [
        {
          id: 101,
          text: 'Choose the stable timer answer.',
          order: 1,
          options: [
            { id: 201, text: 'First option' },
            { id: 202, text: 'Second option' },
          ],
        },
      ],
    },
    noQuiz: false,
    error: null,
    loading: false,
    isValidating: false,
    mutate: mocks.retryExamData,
  }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-04T12:00:00Z'))
  vi.clearAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
  mocks.apiPost.mockResolvedValue({
    data: { score: 100, passed: true, correct: 1, total: 1, pass_score: 80, xp_earned: 0 },
  })
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
  localStorage.clear()
})

describe('ExamPage timer', () => {
  it('keeps draft storage and validation helpers outside the page component', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'app/(dashboard)/exam/[subjectId]/page.tsx'), 'utf8')
    const draftSource = readFileSync(resolve(process.cwd(), 'lib/examDraft.ts'), 'utf8')

    expect(pageSource).toContain('useExamDraft({')
    expect(pageSource).not.toContain('window.localStorage')
    expect(pageSource).not.toContain('function readExamDraft')
    expect(draftSource).toContain("EXAM_DRAFT_STORAGE_PREFIX = 'kresco:exam-draft:v1'")
    expect(draftSource).toContain('sameQuestionOrder')
    expect(draftSource).toContain('sanitizeDraftAnswers')
  })

  it('keeps the countdown cadence when answer changes re-render the page', async () => {
    const { container } = renderExamPage()

    clickButton(container, 'Commencer')

    await act(async () => {
      vi.advanceTimersByTime(900)
    })

    clickButton(container, 'First option')

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(container.textContent).toContain('44:59')
    expect(container.textContent).toContain('1/1 repondu(s)')
  })

  it('restores answers and remaining wall-clock time after a remount', async () => {
    const { container } = renderExamPage()

    clickButton(container, 'Commencer')

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    clickButton(container, 'First option')
    unmountExamPage()

    const restored = renderExamPage()

    expect(restored.container.textContent).toContain('44:55')
    expect(restored.container.textContent).toContain('1/1 repondu(s)')
    const selectedOption = Array.from(restored.container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('First option'))
    expect(selectedOption?.className).toContain('border-kresco')
  })

  it('submits a restored attempt when wall-clock time has expired', async () => {
    localStorage.setItem('kresco:exam-draft:v1:42:7', JSON.stringify({
      subjectId: '42',
      quizId: 7,
      questionIds: [101],
      answers: { 101: 202 },
      currentIdx: 0,
      started: true,
      startedAt: Date.now() - (45 * 60 * 1000),
      submitted: false,
      result: null,
    }))

    renderExamPage()

    await act(async () => {
      await Promise.resolve()
    })

    expect(mocks.apiPost).toHaveBeenCalledWith('/quizzes/7/submit', { answers: { 101: 202 } })
  })
})

function renderExamPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(ExamPage))
  })

  return { container, root }
}

function unmountExamPage() {
  if (!mountedRoot) return
  act(() => {
    mountedRoot?.root.unmount()
  })
  mountedRoot.container.remove()
  mountedRoot = null
}

function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
