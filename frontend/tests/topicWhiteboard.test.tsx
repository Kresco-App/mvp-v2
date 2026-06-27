// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTopicWhiteboard } from '@/hooks/useTopicWhiteboard'
import {
  clearTopicInteractionCache,
  flushPendingTopicInteractionSessionCacheWrites,
  topicInteractionSessionStorageKey,
} from '@/lib/topicInteractionCache'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  putJson: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  putJson: mocks.putJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  clearTopicInteractionCache()
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

describe('useTopicWhiteboard', () => {
  it('initializes serialized scene refs without serializing the live scene on every render', () => {
    const source = readFileSync(join(process.cwd(), 'hooks', 'useTopicWhiteboard.ts'), 'utf8')

    expect(source).toContain('const EMPTY_CANVAS_SCENE_SERIALIZED = serializeScene(EMPTY_CANVAS_SCENE)')
    expect(source).toContain('const lastSerializedSceneRef = useRef(EMPTY_CANVAS_SCENE_SERIALIZED)')
    expect(source).toContain('const currentSerializedSceneRef = useRef(EMPTY_CANVAS_SCENE_SERIALIZED)')
    expect(source).not.toContain('const initialSerializedScene = serializeScene(scene)')
  })

  it('loads a canvas document and autosaves changes with the loaded scene version', async () => {
    const serverScene = {
      type: 'excalidraw',
      version: 1,
      source: 'server',
      elements: [],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }
    const changedScene = {
      type: 'excalidraw',
      version: 1,
      source: 'kresco',
      elements: [{ id: 'line-1', type: 'freedraw' }],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }

    mocks.getJson.mockResolvedValue({
      id: 7,
      target_type: 'topic_item',
      target_id: 101,
      topic_id: 42,
      topic_item_id: 101,
      scene_json: serverScene,
      scene_version: 3,
      updated_at: '2026-06-16T20:00:00Z',
    })
    mocks.putJson.mockResolvedValue({
      id: 7,
      target_type: 'topic_item',
      target_id: 101,
      topic_id: 42,
      topic_item_id: 101,
      scene_json: changedScene,
      scene_version: 4,
      updated_at: '2026-06-16T20:01:00Z',
    })

    const { container } = renderHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('saved')
    })

    await act(async () => {
      buttonByText(container, 'Draw')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(container.textContent).toContain('dirty')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700)
      await flushPromises()
    })

    await waitFor(() => {
      expect(container.textContent).toContain('saved')
    })
    expect(mocks.putJson).toHaveBeenCalledWith('/interactions/canvas', {
      target_type: 'topic_item',
      target_id: 101,
      scene_json: changedScene,
      base_version: 3,
    })
  })

  it('hydrates a cached canvas immediately while refreshing the server document', async () => {
    let resolveServerDocument: ((value: unknown) => void) | null = null
    const cachedScene = {
      type: 'excalidraw',
      version: 1,
      source: 'cached',
      elements: [{ id: 'cached-line', type: 'freedraw' }],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }
    const serverScene = {
      type: 'excalidraw',
      version: 1,
      source: 'server',
      elements: [],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }
    window.sessionStorage.setItem(topicInteractionSessionStorageKey('topic-whiteboard:topic_item:101'), JSON.stringify({
      cachedAt: Date.now(),
      data: {
        id: 7,
        target_type: 'topic_item',
        target_id: 101,
        topic_id: 42,
        topic_item_id: 101,
        scene_json: cachedScene,
        scene_version: 2,
        updated_at: '2026-06-16T19:59:00Z',
      },
    }))
    mocks.getJson.mockImplementation(() => new Promise((resolve) => {
      resolveServerDocument = resolve
    }))

    const { container } = renderHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('saved')
    })
    expect(mocks.getJson).toHaveBeenCalledWith('/interactions/canvas', {
      params: {
        target_type: 'topic_item',
        target_id: 101,
      },
      signal: expect.any(AbortSignal),
    })

    await act(async () => {
      resolveServerDocument?.({
        id: 7,
        target_type: 'topic_item',
        target_id: 101,
        topic_id: 42,
        topic_item_id: 101,
        scene_json: serverScene,
        scene_version: 3,
        updated_at: '2026-06-16T20:00:00Z',
      })
      await flushPromises()
    })

    await waitFor(() => {
      expect(container.textContent).toContain('saved')
    })
  })

  it('ignores repeated editor change events for the same scene', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    mocks.getJson.mockResolvedValue({
      id: 7,
      target_type: 'topic_item',
      target_id: 101,
      topic_id: 42,
      topic_item_id: 101,
      scene_json: {
        type: 'excalidraw',
        version: 1,
        source: 'server',
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      },
      scene_version: 3,
      updated_at: '2026-06-16T20:00:00Z',
    })

    const { container } = renderHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('saved')
    })
    flushPendingTopicInteractionSessionCacheWrites()
    setItemSpy.mockClear()

    await act(async () => {
      buttonByText(container, 'Draw')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })
    expect(setItemSpy).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
      await flushPromises()
    })
    expect(setItemSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      buttonByText(container, 'Draw')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
      await flushPromises()
    })
    expect(setItemSpy).toHaveBeenCalledTimes(1)

    setItemSpy.mockRestore()
  })

  it('flushes a pending local draft when the page is hidden', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    mocks.getJson.mockResolvedValue({
      id: 7,
      target_type: 'topic_item',
      target_id: 101,
      topic_id: 42,
      topic_item_id: 101,
      scene_json: {
        type: 'excalidraw',
        version: 1,
        source: 'server',
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {},
      },
      scene_version: 3,
      updated_at: '2026-06-16T20:00:00Z',
    })

    const { container } = renderHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('saved')
    })
    flushPendingTopicInteractionSessionCacheWrites()
    setItemSpy.mockClear()

    await act(async () => {
      buttonByText(container, 'Draw')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })
    expect(setItemSpy).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(setItemSpy).toHaveBeenCalledTimes(1)
    expect(setItemSpy.mock.calls[0]?.[0]).toBe('kresco:whiteboard:topic_item:101')
    expect(setItemSpy.mock.calls[0]?.[1]).toContain('"dirty":true')

    setItemSpy.mockRestore()
  })
})

function WhiteboardHarness() {
  const whiteboard = useTopicWhiteboard({ targetType: 'topic_item', targetId: 101 })
  return (
    <div>
      <span>{whiteboard.syncStatus}</span>
      <button
        type="button"
        onClick={() => whiteboard.handleSceneChange(
          [{ id: 'line-1', type: 'freedraw' }],
          { viewBackgroundColor: '#ffffff' },
          {},
        )}
      >
        Draw
      </button>
    </div>
  )
}

function renderHarness() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(WhiteboardHarness))
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
