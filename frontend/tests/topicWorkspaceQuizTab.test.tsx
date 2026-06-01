// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TabPanel } from '@/components/topic-workspace/TopicWorkspacePanels'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', props),
}))

vi.mock('@/components/animated/registry', () => ({
  AnimatedContentRenderer: () => React.createElement('div', null, 'Animated renderer'),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
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

describe('topic workspace quiz tab', () => {
  it('loads recent attempts and renders per-question correctness summaries', async () => {
    mocks.getJson.mockResolvedValueOnce([
      {
        id: 91,
        attempt_number: 3,
        score: 50,
        passed: false,
        correct: 1,
        total: 2,
        pass_score: 70,
        submitted_at: '2026-06-01T10:30:00Z',
        grading: {
          questions: [
            { id: 'q1', type: 'multiple_choice', correct: true, answered: true },
            { id: 'q2', type: 'fill_in_blank', correct: false, answered: false },
          ],
        },
      },
    ])

    const { container } = renderQuizTab({
      id: 11,
      questions: [
        { id: 'q1', type: 'multiple_choice', prompt: 'Pick A', options: ['A', 'B'] },
        { id: 'q2', type: 'fill_in_blank', prompt: 'Explain' },
      ],
    })

    await waitFor(() => {
      expect(mocks.getJson).toHaveBeenCalledWith('/courses/tabs/11/quiz/attempts')
      expect(container.textContent).toContain('Recent attempts')
      expect(container.textContent).toContain('Attempt 3')
      expect(container.textContent).toContain('Score 50%')
      expect(container.textContent).toContain('Q1 Correct')
      expect(container.textContent).toContain('Q2 No answer')
    })
  })

  it('supports submit, retry, and reset for the learner loop', async () => {
    mocks.getJson.mockResolvedValueOnce([])
    mocks.postJson.mockResolvedValueOnce({
      score: 100,
      passed: true,
      correct: 1,
      total: 1,
      pass_score: 70,
      xp_earned: 20,
      grading: {
        questions: [
          { id: 'q1', type: 'fill_in_blank', correct: true, answered: true },
        ],
      },
      attempt: {
        id: 101,
        attempt_number: 1,
        score: 100,
        passed: true,
        correct: 1,
        total: 1,
        pass_score: 70,
        submitted_at: '2026-06-01T11:00:00Z',
        grading: {
          questions: [
            { id: 'q1', type: 'fill_in_blank', correct: true, answered: true },
          ],
        },
      },
    })

    const { container } = renderQuizTab({
      id: 22,
      questions: [{ id: 'q1', type: 'fill_in_blank', prompt: 'State the law' }],
    })

    await waitFor(() => {
      expect(container.textContent).toContain('No attempts yet.')
    })

    const input = getInput(container, 'Fill the blank')
    act(() => {
      input.value = 'Faraday'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      getButton(container, 'Submit quiz').click()
      await flushPromises()
    })

    expect(mocks.postJson).toHaveBeenCalledWith('/courses/tabs/22/quiz/submit', {
      answers: { q1: 'Faraday' },
    })
    expect(container.textContent).toContain('Quiz passed')
    expect(container.textContent).toContain('Attempt 1')
    expect(container.textContent).toContain('Retry quiz')
    expect(container.textContent).toContain('Reset answers')

    act(() => {
      getButton(container, 'Retry quiz').click()
    })
    expect(container.textContent).not.toContain('Quiz passed')

    act(() => {
      getButton(container, 'Reset answers').click()
    })
    expect(input.value).toBe('')
  })
})

function renderQuizTab({
  id,
  questions,
}: {
  id: number
  questions: Array<Record<string, unknown>>
}) {
  const tab = {
    id,
    label: 'Quiz',
    tab_type: 'quiz',
    content: '',
    config_json: { questions },
    renderer_key: '',
    order: 1,
  }
  const item = {
    id: 7,
    topic_id: 42,
    section_id: 5,
    title: 'Quiz item',
    description: 'Checkpoint',
    item_type: 'checkpoint_quiz',
    renderer_key: '',
    duration_seconds: 0,
    progress_status: 'not_started',
    tabs: [tab],
  }

  return renderComponent(React.createElement(TabPanel, {
    tab,
    item,
    topicId: 42,
    onNoteSaved: vi.fn(),
    onItemComplete: vi.fn(),
  }))
}

function renderComponent(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(element)
  })

  return { container, root }
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  return button
}

function getInput(container: HTMLElement, ariaLabel: string) {
  const input = Array.from(container.querySelectorAll('input')).find((item) => item.getAttribute('aria-label') === ariaLabel)
  if (!(input instanceof HTMLInputElement)) throw new Error(`input not found: ${ariaLabel}`)
  return input
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
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
  }
  throw lastError
}
