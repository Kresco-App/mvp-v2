// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TopicWorkspaceWhiteboard } from '@/components/topic-workspace/TopicWorkspaceWhiteboard'
import { buildTopicItem } from './factories/topicWorkspace'

type ExcalidrawMockProps = {
  excalidrawAPI?: (api: ExcalidrawMockApi) => void
  initialData?: {
    appState?: Record<string, unknown>
  }
  onChange: (elements: readonly unknown[], appState: unknown, files: unknown) => void
  UIOptions: unknown
}

type ExcalidrawMockApi = {
  getAppState: () => Record<string, unknown>
  getSceneElements: () => unknown[]
  refresh: () => void
  scrollToContent: (target?: unknown, options?: unknown) => void
}

const mocks = vi.hoisted(() => {
  const handleSceneChange = vi.fn()
  const saveCanvas = vi.fn()
  const reloadFromServer = vi.fn()
  const excalidrawApi = {
    getAppState: vi.fn(() => ({} as Record<string, unknown>)),
    getSceneElements: vi.fn(() => [{ id: 'shape-1' }]),
    refresh: vi.fn(),
    scrollToContent: vi.fn(),
  }
  const whiteboardState = {
    scene: {
      type: 'excalidraw',
      version: 1,
      source: 'kresco',
      elements: [],
      appState: { viewBackgroundColor: '#ffffff' } as Record<string, unknown>,
      files: {},
    },
    sceneVersion: 0,
    sceneLoadKey: 1,
    syncStatus: 'saved',
    lastSyncedAt: null,
    errorMessage: '',
    isDirty: false,
    handleSceneChange,
    saveCanvas,
    reloadFromServer,
  }
  return {
    excalidrawApi,
    excalidrawProps: [] as ExcalidrawMockProps[],
    handleSceneChange,
    reloadFromServer,
    saveCanvas,
    whiteboardState,
  }
})

vi.mock('next/dynamic', async () => {
  const React = await import('react')
  return {
    default: () => function DynamicExcalidrawMock(props: ExcalidrawMockProps) {
      const { excalidrawAPI } = props
      React.useEffect(() => {
        excalidrawAPI?.(mocks.excalidrawApi)
      }, [excalidrawAPI])
      mocks.excalidrawProps.push(props)
      return React.createElement('div', { 'data-testid': 'excalidraw-mock' })
    },
  }
})

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const MockMotionDiv = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => React.createElement('div', { ...props, ref }, children),
  )
  const MockMotionSection = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
    ({ children, ...props }, ref) => React.createElement('section', { ...props, ref }, children),
  )
  MockMotionDiv.displayName = 'MockMotionDiv'
  MockMotionSection.displayName = 'MockMotionSection'
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: {
      div: MockMotionDiv,
      section: MockMotionSection,
    },
  }
})

vi.mock('@/hooks/useTopicWhiteboard', () => ({
  canvasSceneToInitialData: (scene: Record<string, unknown>) => ({
    elements: scene.elements ?? [],
    appState: scene.appState ?? {},
    files: scene.files ?? {},
  }),
  useTopicWhiteboard: () => mocks.whiteboardState,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

const item = buildTopicItem({
  id: 101,
  title: 'Continuity introduction',
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.excalidrawProps = []
  mocks.excalidrawApi.getAppState.mockClear()
  mocks.excalidrawApi.getAppState.mockReturnValue({})
  mocks.excalidrawApi.getSceneElements.mockClear()
  mocks.excalidrawApi.refresh.mockClear()
  mocks.excalidrawApi.scrollToContent.mockClear()
  mocks.whiteboardState.syncStatus = 'saved'
  mocks.whiteboardState.isDirty = false
  mocks.whiteboardState.scene.appState = { viewBackgroundColor: '#ffffff' }
  document.body.innerHTML = ''
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
})

describe('TopicWorkspaceWhiteboard component', () => {
  it('keeps Excalidraw callback and option props stable across status rerenders', () => {
    const { root } = renderWhiteboard()
    const firstProps = mocks.excalidrawProps.at(-1)

    mocks.whiteboardState.syncStatus = 'dirty'
    mocks.whiteboardState.isDirty = true

    act(() => {
      root.render(React.createElement(TopicWorkspaceWhiteboard, { item }))
    })
    const secondProps = mocks.excalidrawProps.at(-1)

    expect(firstProps).toBeDefined()
    expect(secondProps).toBeDefined()
    expect(secondProps?.onChange).toBe(firstProps?.onChange)
    expect(secondProps?.UIOptions).toBe(firstProps?.UIOptions)
  })

  it('keeps only one Excalidraw instance mounted when expanded', () => {
    const { container } = renderWhiteboard()

    expect(container.querySelectorAll('[data-testid="excalidraw-mock"]')).toHaveLength(1)

    act(() => {
      buttonByText(container, 'Expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.querySelectorAll('[data-testid="excalidraw-mock"]')).toHaveLength(1)
  })

  it('bounds the expanded dialog and closes it from the backdrop or close button', () => {
    const { container } = renderWhiteboard()

    act(() => {
      buttonByText(container, 'Expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.className).toContain('rounded-[18px]')
    expect(document.body.textContent).toContain('Click outside or press Esc to return')
    expect(buttonByLabel(document.body, 'Close')).not.toBeNull()

    act(() => {
      document.body.querySelector('[data-testid="whiteboard-expanded-backdrop"]')
        ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    act(() => {
      buttonByText(container, 'Expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      buttonByLabel(document.body, 'Close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('refreshes and recenters the Excalidraw viewport when expanded', async () => {
    const { container } = renderWhiteboard()

    act(() => {
      buttonByText(container, 'Expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(mocks.excalidrawApi.refresh).toHaveBeenCalled()
    expect(mocks.excalidrawApi.scrollToContent).toHaveBeenCalledWith(
      [{ id: 'shape-1' }],
      expect.objectContaining({ fitToViewport: true, animate: false }),
    )
  })

  it('keeps compact and expanded viewport offsets separate when switching modes', () => {
    mocks.excalidrawApi.getAppState.mockReturnValue({
      scrollX: 120,
      scrollY: -80,
      zoom: { value: 1.5 },
    })
    const { container } = renderWhiteboard()

    act(() => {
      buttonByText(container, 'Expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    let props = mocks.excalidrawProps.at(-1)
    expect(props?.initialData?.appState).not.toHaveProperty('scrollX')
    expect(props?.initialData?.appState).not.toHaveProperty('scrollY')
    expect(props?.initialData?.appState).not.toHaveProperty('zoom')

    mocks.excalidrawApi.getAppState.mockReturnValue({
      scrollX: 240,
      scrollY: -160,
      zoom: { value: 2 },
    })

    act(() => {
      buttonByLabel(document.body, 'Close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    props = mocks.excalidrawProps.at(-1)
    expect(props?.initialData?.appState).toMatchObject({
      scrollX: 120,
      scrollY: -80,
      zoom: { value: 1.5 },
    })
    expect(props?.initialData?.appState).not.toMatchObject({
      scrollX: 240,
      scrollY: -160,
    })

    act(() => {
      buttonByText(container, 'Expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    props = mocks.excalidrawProps.at(-1)
    expect(props?.initialData?.appState).toMatchObject({
      scrollX: 240,
      scrollY: -160,
      zoom: { value: 2 },
    })
  })

  it('does not pass saved viewport offsets back into Excalidraw initial data', () => {
    mocks.whiteboardState.scene.appState = {
      viewBackgroundColor: '#ffffff',
      scrollX: 400,
      scrollY: -220,
      zoom: { value: 2 },
    }

    renderWhiteboard()
    const props = mocks.excalidrawProps.at(-1)

    expect(props?.initialData?.appState).toMatchObject({ viewBackgroundColor: '#ffffff' })
    expect(props?.initialData?.appState).not.toHaveProperty('scrollX')
    expect(props?.initialData?.appState).not.toHaveProperty('scrollY')
    expect(props?.initialData?.appState).not.toHaveProperty('zoom')
  })
})

function renderWhiteboard() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(TopicWorkspaceWhiteboard, { item }))
  })

  return { container, root }
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.textContent?.includes(text)
  )) ?? null
}

function buttonByLabel(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.getAttribute('aria-label') === label
  )) ?? null
}
