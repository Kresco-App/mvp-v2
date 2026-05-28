// @vitest-environment jsdom

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiSWRConfig } from '@/lib/apiData'
import {
  examQuizDiscoverySWRKey,
  loadExamQuiz,
  useExamQuizData,
} from '@/lib/examData'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mountedRoots = []
  document.body.innerHTML = ''
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

describe('exam SWR data', () => {
  it('builds discovery keys defensively', () => {
    expect(examQuizDiscoverySWRKey(12)).toEqual(['exam-quiz-discovery', '12'])
    expect(examQuizDiscoverySWRKey('')).toBeNull()
  })

  it('loads the discovered subject quiz without probing every lesson', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/quizzes/subjects/42/discovery') {
        return {
          data: {
            subjectId: 42,
            lessonId: 12,
            quiz: quizFixture(12, 'Limits exam'),
          },
        }
      }
      throw new Error(`unexpected url ${url}`)
    })

    const discovery = await loadExamQuiz(42)

    expect(discovery).toMatchObject({
      subjectId: '42',
      lessonId: 12,
      quiz: expect.objectContaining({ title: 'Limits exam' }),
    })
    expect(mocks.apiGet.mock.calls.map((call) => call[0])).toEqual(['/quizzes/subjects/42/discovery'])
  })

  it('does not expose a previous subject quiz after the route subject id changes', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/quizzes/subjects/1/discovery') {
        return { data: { subjectId: '1', lessonId: 101, quiz: quizFixture(101, 'Subject one quiz') } }
      }
      if (url === '/quizzes/subjects/2/discovery') return new Promise(() => undefined)
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderExamHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('quiz: Subject one quiz')
      expect(container.textContent).toContain('loading: no')
    })

    await act(async () => {
      getButton(container, 'Go subject 2').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('quiz: none')
    expect(container.textContent).toContain('loading: yes')
  })
})

function ExamHarness() {
  const [subjectId, setSubjectId] = useState('1')
  const { quiz, noQuiz, loading } = useExamQuizData(subjectId)

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `quiz: ${quiz?.title ?? 'none'}`),
    React.createElement('p', null, `no quiz: ${noQuiz ? 'yes' : 'no'}`),
    React.createElement('p', null, `loading: ${loading ? 'yes' : 'no'}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setSubjectId('2'),
      },
      'Go subject 2',
    ),
  )
}

function renderExamHarness() {
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
          provider: () => new Map(),
          dedupingInterval: 0,
          errorRetryCount: 0,
        },
      },
      React.createElement(ExamHarness),
    ))
  })

  return { container, root }
}

function quizFixture(id: number, title: string) {
  return {
    id,
    title,
    pass_score: 80,
    questions: [
      {
        id: 1,
        text: 'What is the limit?',
        order: 1,
        options: [
          { id: 10, text: '0' },
          { id: 11, text: '1' },
        ],
      },
    ],
  }
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
