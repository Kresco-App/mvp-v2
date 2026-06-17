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
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
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
  delete window.VdoPlayer
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

  it('renders SectionQuiz empty state without submitting when no questions are available', () => {
    const onComplete = vi.fn()
    const { container } = renderComponent(React.createElement(SectionQuiz, {
      data: { questions: [] },
      passScore: 70,
      onComplete,
    }))

    expect(container.textContent).toContain('Aucun quiz disponible')
    expect(container.textContent).toContain('Ce quiz ne contient aucune question')
    expect(buttonByText(container, 'Voir le resultat')).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows SectionQuiz submit failure and retries with the saved answer draft', async () => {
    const onComplete = vi.fn()
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce({
        score: 100,
        passed: true,
        correctCount: 1,
        totalCount: 1,
      })
    const { container } = renderComponent(React.createElement(SectionQuiz, {
      data: {
        questions: [
          { text: 'Only question?', options: [{ text: 'A' }, { text: 'B' }] },
        ],
      },
      passScore: 70,
      onComplete,
    }))

    act(() => {
      buttonByText(container, 'A')?.click()
    })
    await act(async () => {
      buttonByText(container, 'Voir le resultat')?.click()
      await flushPromises()
    })

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenLastCalledWith({ 0: 0 })
    expect(container.textContent).toContain('Impossible de valider le quiz')
    expect(container.textContent).toContain('Only question?')
    expect(buttonByText(container, "Reessayer l'envoi")?.hasAttribute('disabled')).toBe(false)

    await act(async () => {
      buttonByText(container, "Reessayer l'envoi")?.click()
      await flushPromises()
    })

    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith({ 0: 0 })
    expect(container.textContent).toContain('Quiz reussi')
  })

  it('renders the VdoCipher iframe and reports completion from provider events', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: { otp: 'provider-otp', playback_info: 'provider-playback' } })
    mocks.apiPost.mockResolvedValue({ data: {} })
    const fakeVideo = document.createElement('video')
    Object.defineProperty(fakeVideo, 'duration', { value: 120, configurable: true })
    const getInstance = vi.fn(() => ({
      video: fakeVideo,
      destroy: vi.fn(),
    }))
    window.VdoPlayer = { getInstance }
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
    await waitFor(() => {
      expect(getInstance).toHaveBeenCalledTimes(1)
    })
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://player.vdocipher.com/v2/?otp=provider-otp&playbackInfo=provider-playback&player=&',
    )

    await act(async () => {
      fakeVideo.dispatchEvent(new Event('ended'))
      await flushPromises()
    })

    expect(mocks.apiPost).toHaveBeenCalledWith('/courses/topic-items/42/complete', {
      watched_seconds: 120,
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('lets VideoPlayer provider completion retry after a failed save', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: { otp: 'provider-otp', playback_info: 'provider-playback' } })
    mocks.apiPost
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce({ data: {} })
    const fakeVideo = document.createElement('video')
    Object.defineProperty(fakeVideo, 'duration', { value: 120, configurable: true })
    const getInstance = vi.fn(() => ({
      video: fakeVideo,
      destroy: vi.fn(),
    }))
    window.VdoPlayer = { getInstance }
    const onComplete = vi.fn()
    renderComponent(React.createElement(VideoPlayer, {
      lessonId: 42,
      durationSeconds: 120,
      onProgress: vi.fn(),
      onComplete,
    }))

    await waitFor(() => {
      expect(getInstance).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      fakeVideo.dispatchEvent(new Event('ended'))
      await flushPromises()
    })

    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not save video completion.')

    await act(async () => {
      fakeVideo.dispatchEvent(new Event('ended'))
      await flushPromises()
    })

    expect(mocks.apiPost).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('seeks VdoCipher playback to the resume checkpoint and flushes latest progress on pagehide', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: { otp: 'mock-otp-token', playback_info: 'mock-playback' } })
    mocks.apiPost.mockResolvedValue({ data: {} })
    const fakeVideo = document.createElement('video')
    Object.defineProperty(fakeVideo, 'duration', { value: 120, configurable: true })
    const getInstance = vi.fn(() => ({
      video: fakeVideo,
      destroy: vi.fn(),
    }))
    window.VdoPlayer = { getInstance }

    renderComponent(React.createElement(VideoPlayer, {
      lessonId: 42,
      durationSeconds: 120,
      resumeSeconds: 47,
      onProgress: vi.fn(),
      onComplete: vi.fn(),
    }))

    await waitFor(() => {
      expect(getInstance).toHaveBeenCalledTimes(1)
      expect(fakeVideo.currentTime).toBe(47)
    })

    fakeVideo.currentTime = 63
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await flushPromises()
    })

    expect(mocks.apiPost).toHaveBeenCalledWith('/courses/topic-items/42/progress', {
      watched_seconds: 63,
    })
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
