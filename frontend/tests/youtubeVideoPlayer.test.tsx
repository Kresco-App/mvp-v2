// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import YouTubeVideoPlayer, { buildYouTubePlayerVars } from '@/components/YouTubeVideoPlayer'

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(() => Promise.resolve({})),
  postJsonKeepalive: vi.fn(() => null),
  toastError: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  postJson: mocks.postJson,
  postJsonKeepalive: mocks.postJsonKeepalive,
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
let seekToMock = vi.fn()
const originalDocumentHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  setDocumentHidden(false)
  document.body.innerHTML = ''
  capturedOptions = null
  currentTime = 0
  duration = 100
  destroyMock = vi.fn()
  seekToMock = vi.fn((seconds: number) => {
    currentTime = seconds
  })
  window.YT = {
    Player: vi.fn(function (_element: HTMLElement, options: PlayerOptions) {
      capturedOptions = options
      return {
        getCurrentTime: () => currentTime,
        getDuration: () => duration,
        seekTo: seekToMock,
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
  restoreDocumentHidden()
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

  it('defers YouTube iframe API startup until the player is near the viewport', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'YouTubeVideoPlayer.tsx'), 'utf8')

    expect(source).toContain("import { useNearViewport } from '@/hooks/useNearViewport'")
    expect(source).toContain('const { nearViewport, ref: viewportRef } = useNearViewport<HTMLDivElement>()')
    expect(source).toContain('if (!nearViewport) return undefined')
    expect(source).toContain('<div ref={viewportRef}')
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
    expect(mocks.postJson).toHaveBeenCalledWith('/courses/topic-items/101/progress', {
      watched_seconds: 42,
    })
  })

  it('pauses progress interval writes while hidden and catches up when visible again', async () => {
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
    await act(async () => {
      setDocumentHidden(true)
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(mocks.postJson).toHaveBeenCalledWith('/courses/topic-items/101/progress', {
      watched_seconds: 42,
    })

    mocks.postJson.mockClear()
    currentTime = 75
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000)
    })

    expect(mocks.postJson).not.toHaveBeenCalled()

    await act(async () => {
      setDocumentHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(onProgress).toHaveBeenLastCalledWith(75, 0.75)
    expect(mocks.postJson).toHaveBeenCalledWith('/courses/topic-items/101/progress', {
      watched_seconds: 75,
    })

    mocks.postJson.mockClear()
    currentTime = 88
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })

    expect(mocks.postJson).toHaveBeenCalledWith('/courses/topic-items/101/progress', {
      watched_seconds: 88,
    })
  })

  it('seeks to the resume checkpoint when the player is ready', async () => {
    renderPlayer({ resumeSeconds: 37 })
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      capturedOptions?.events.onReady()
    })

    expect(seekToMock).toHaveBeenCalledWith(37, true)
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
  resumeSeconds?: number
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

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  })
}

function restoreDocumentHidden() {
  if (originalDocumentHidden) {
    Object.defineProperty(document, 'hidden', originalDocumentHidden)
    return
  }

  delete (document as unknown as { hidden?: boolean }).hidden
}
