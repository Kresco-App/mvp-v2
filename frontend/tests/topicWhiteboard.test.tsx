// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTopicWhiteboard } from '@/hooks/useTopicWhiteboard'

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

    await act(async () => {
      buttonByText(container, 'Draw')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })
    expect(setItemSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      buttonByText(container, 'Draw')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })
    expect(setItemSpy).toHaveBeenCalledTimes(1)

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
