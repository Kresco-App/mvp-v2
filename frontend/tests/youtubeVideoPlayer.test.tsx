// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import YouTubeVideoPlayer, { buildYouTubePlayerVars } from '@/components/YouTubeVideoPlayer'

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(() => Promise.resolve({})),
  toastError: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  postJson: mocks.postJson,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type PlayerOptions = {
  videoId: string
  host: string
  playerVars: Record<string, string | number>
  events: {
    onReady: () => void
    onStateChange: (event: { data: number }) => void
    onError: () => void
  }
}

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null
let capturedOptions: PlayerOptions | null = null
let currentTime = 0
let duration = 100
let destroyMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  document.body.innerHTML = ''
  capturedOptions = null
  currentTime = 0
  duration = 100
  destroyMock = vi.fn()
  window.YT = {
    Player: vi.fn(function (_element: HTMLElement, options: PlayerOptions) {
      capturedOptions = options
      return {
        getCurrentTime: () => currentTime,
        getDuration: () => duration,
        destroy: destroyMock,
      }
    }),
  }
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
  delete window.YT
  delete window.onYouTubeIframeAPIReady
  vi.useRealTimers()
})

describe('YouTubeVideoPlayer', () => {
  it('constructs privacy-enhanced API player options', () => {
    expect(buildYouTubePlayerVars()).toMatchObject({
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      enablejsapi: 1,
      origin: window.location.origin,
    })
  })

  it('reports progress and completion from YouTube player state', async () => {
    const onProgress = vi.fn()
    const onComplete = vi.fn()

    renderPlayer({ onProgress, onComplete })

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      capturedOptions?.events.onReady()
    })

    currentTime = 91
    act(() => {
      capturedOptions?.events.onStateChange({ data: 1 })
    })

    expect(capturedOptions?.videoId).toBe('dQw4w9WgXcQ')
    expect(capturedOptions?.host).toBe('https://www.youtube-nocookie.com')
    expect(onProgress).toHaveBeenCalledWith(91, 0.91)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(mocks.postJson).toHaveBeenCalledWith('/courses/topic-items/101/complete', {
      watched_seconds: 100,
    })
  })

  it('saves watched seconds while playback is active', async () => {
    const onProgress = vi.fn()

    renderPlayer({ onProgress })
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      capturedOptions?.events.onReady()
    })

    currentTime = 12
    act(() => {
      capturedOptions?.events.onStateChange({ data: 1 })
    })
    currentTime = 42
    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(onProgress).toHaveBeenLastCalledWith(42, 0.42)
    expect(mocks.postJson).toHaveBeenCalledWith('/courses/topic-items/101/complete', {
      watched_seconds: 42,
    })
  })

  it('destroys the YouTube player on unmount', async () => {
    renderPlayer({})
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      mountedRoot?.root.unmount()
    })

    expect(destroyMock).toHaveBeenCalledTimes(1)
  })
})

function renderPlayer(props: {
  onProgress?: (currentSeconds: number, progress: number) => void
  onComplete?: () => void
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(YouTubeVideoPlayer, {
      lessonId: 101,
      videoId: 'dQw4w9WgXcQ',
      durationSeconds: 100,
      ...props,
    }))
  })

  return { container, root }
}
