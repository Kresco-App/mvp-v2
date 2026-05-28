// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SectionQuiz from '@/components/SectionQuiz'
import VideoPlayer from '@/components/VideoPlayer'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  isLocalDemoVideoStream: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('@/lib/devFeatures', () => ({
  isLocalDemoVideoStream: mocks.isLocalDemoVideoStream,
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
  mocks.isLocalDemoVideoStream.mockReturnValue(false)
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

describe('core learning component rendering', () => {
  it('drives SectionQuiz from answer selection through completion', async () => {
    const onComplete = vi.fn().mockResolvedValue({
      score: 100,
      passed: true,
      correctCount: 2,
      totalCount: 2,
    })
    const { container } = renderComponent(React.createElement(SectionQuiz, {
      data: {
        questions: [
          { text: 'First question?', options: [{ text: 'A' }, { text: 'B' }] },
          { text: 'Second question?', options: [{ text: 'C' }, { text: 'D' }] },
        ],
      },
      passScore: 70,
      onComplete,
    }))

    expect(container.textContent).toContain('Question 1 sur 2')
    expect(buttonByText(container, 'Continuer')?.hasAttribute('disabled')).toBe(true)

    act(() => {
      buttonByText(container, 'B')?.click()
    })
    expect(buttonByText(container, 'Continuer')?.hasAttribute('disabled')).toBe(false)

    act(() => {
      buttonByText(container, 'Continuer')?.click()
    })
    expect(container.textContent).toContain('Question 2 sur 2')

    act(() => {
      buttonByText(container, 'C')?.click()
    })
    await act(async () => {
      buttonByText(container, 'Voir le resultat')?.click()
      await flushPromises()
    })

    expect(onComplete).toHaveBeenCalledWith({ 0: 1, 1: 0 })
    expect(container.textContent).toContain('Quiz reussi')
    expect(container.textContent).toContain('100%')
  })

  it('renders VideoPlayer demo stream and reports completion from the UI', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: { otp: 'mock-otp-token' } })
    mocks.apiPost.mockResolvedValue({ data: {} })
    mocks.isLocalDemoVideoStream.mockReturnValue(true)
    const onComplete = vi.fn()
    const { container } = renderComponent(React.createElement(VideoPlayer, {
      lessonId: 42,
      durationSeconds: 120,
      onProgress: vi.fn(),
      onComplete,
    }))

    expect(container.textContent).toContain('Chargement de la video')
    await act(async () => {
      await flushPromises()
    })

    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/topic-items/42/stream')
    expect(container.textContent).toContain('Apercu video local')

    await act(async () => {
      buttonByText(container, 'Marquer comme terminee')?.click()
      await flushPromises()
    })

    expect(mocks.apiPost).toHaveBeenCalledWith('/courses/topic-items/42/complete', {
      watched_seconds: 120,
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Lecon marquee comme terminee !')
  })

})

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

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.textContent?.includes(text)
  )) ?? null
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
