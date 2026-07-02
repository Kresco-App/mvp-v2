// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act, type ComponentType, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TabPanel } from '@/components/topic-workspace/TopicWorkspacePanels'
import { clearTopicInteractionCache } from '@/lib/topicInteractionCache'
import type { TabContent, TopicItem } from '@/lib/topicWorkspaceViewModel'
import { buildTabContent, buildTopicItem, buildTopicResource } from './factories/topicWorkspace'

const mocks = vi.hoisted(() => ({
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  patchJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({ fill: _fill, priority: _priority, unoptimized: _unoptimized, ...props }: Record<string, unknown>) => {
    void _fill
    void _priority
    void _unoptimized
    return React.createElement('img', props)
  },
}))

vi.mock('next/dynamic', () => ({
  default: <Props extends object>(
    loader: () => Promise<ComponentType<Props> | { default?: ComponentType<Props> }>,
    options?: { loading?: (props: Props) => ReactNode; ssr?: boolean },
  ) => {
    let Component: ComponentType<Props> | null = null
    let loadError: unknown
    const loadPromise = loader()
      .then((loaded) => {
        const resolved = typeof loaded === 'function' ? loaded : loaded.default
        if (resolved) Component = resolved
      })
      .catch((error: unknown) => {
        loadError = error
      })

    function DynamicComponent(props: Props) {
      const [, setRenderVersion] = React.useState(0)

      React.useEffect(() => {
        if (Component || loadError) return undefined

        let mounted = true
        void loadPromise.then(() => {
          if (mounted) setRenderVersion((version) => version + 1)
        })
        return () => {
          mounted = false
        }
      }, [])

      if (loadError) throw loadError

      if (!Component) {
        return options?.loading?.(props) ?? null
      }

      return React.createElement(Component, props)
    }

    return DynamicComponent
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/components/animated/registry', () => ({
  AnimatedContentRenderer: ({ rendererKey }: { rendererKey: string }) => {
    if (rendererKey === 'decay_simulator') {
      throw new Error('Renderer failed in test')
    }
    return React.createElement('div', null, 'animated')
  },
}))

vi.mock('@/components/topic-workspace/TopicWorkspaceWhiteboard', () => ({
  TopicWorkspaceWhiteboard: (props: { item: { title: string } }) => (
    React.createElement('div', { 'data-testid': 'lesson-whiteboard' }, `Whiteboard ${props.item.title}`)
  ),
}))

vi.mock('@/lib/apiClient', () => ({
  deleteJson: mocks.deleteJson,
  getJson: mocks.getJson,
  patchJson: mocks.patchJson,
  postJson: mocks.postJson,
  putJson: mocks.putJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

const baseItem: TopicItem = buildTopicItem({
  id: 101,
  topic_id: 42,
  section_id: 11,
  title: 'Continuity introduction',
  description: 'Study the worksheet and keep notes here.',
  duration_seconds: 600,
})

const resourceTab: TabContent = buildTabContent({
  id: 12,
  label: 'Worksheet',
  tab_type: 'resource',
  content: 'Practice worksheet for continuity.',
  order: 2,
  resource: buildTopicResource({
    id: 22,
    title: 'Worksheet PDF',
    resource_type: 'pdf',
    provider: 'local',
    provider_resource_id: '',
    url: '/worksheet.pdf',
    summary: 'Practice worksheet',
  }),
})

const notesTab: TabContent = buildTabContent({
  id: 8,
  label: 'Notes',
  tab_type: 'notes',
  content: '',
  order: 4,
})

const commentsTab: TabContent = buildTabContent({
  id: 9,
  label: 'Comments',
  tab_type: 'comments',
  content: '',
  order: 5,
})

beforeEach(() => {
  vi.clearAllMocks()
  clearTopicInteractionCache()
  document.body.innerHTML = ''
  Object.defineProperty(window, 'open', {
    value: vi.fn(),
    writable: true,
  })
  Object.defineProperty(window, 'scrollTo', {
    value: vi.fn(),
    writable: true,
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
})

describe('TopicWorkspacePanels', () => {
  it('keeps rich course and animated renderers out of the base tab panel module', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'topic-workspace', 'TopicWorkspacePanels.tsx'), 'utf8')

    expect(source).not.toContain('import { AnimatedContentRenderer }')
    expect(source).not.toContain("from '@/components/topic-workspace/CourseContentRenderer'")
    expect(source).toContain("import('@/components/animated/registry')")
    expect(source).toContain("import('@/components/topic-workspace/CourseContentRenderer')")
    expect(source).toContain("from '@/lib/courseContentDocument'")
  })

  it('does not expose protected tab content in locked previews', () => {
    const lockedItem: TopicItem = {
      ...baseItem,
      description: '',
      can_access: false,
      locked_reason: 'vip_required',
    }
    const protectedTab: TabContent = {
      ...resourceTab,
      can_access: false,
      content: 'SECRET PREMIUM LESSON BODY',
      resource: {
        ...resourceTab.resource!,
        summary: 'SECRET PREMIUM RESOURCE SUMMARY',
      },
    }

    const { container } = renderPanel(protectedTab, lockedItem)

    expect(container.textContent).toContain('Locked preview')
    expect(container.textContent).toContain('This learning item is visible in the topic path')
    expect(container.textContent).not.toContain('SECRET PREMIUM LESSON BODY')
    expect(container.textContent).not.toContain('SECRET PREMIUM RESOURCE SUMMARY')
  })

  it('previews and opens resource tabs even when the backend open endpoint is unavailable', async () => {
    mocks.postJson.mockRejectedValue({ response: { status: 404 } })

    const resourceTypedAsVideo: TabContent = {
      ...resourceTab,
      resource: {
        ...resourceTab.resource!,
        resource_type: 'video',
      },
    }

    const { container } = renderPanel(resourceTypedAsVideo, baseItem)

    expect(container.textContent).toContain('Worksheet PDF')
    expect(container.querySelector('[aria-label="Resource format"]')?.textContent).toBe('PDF')
    expect(container.textContent).not.toContain('VIDEO')
    expect(container.textContent).toContain('Open')
    expect(container.textContent).toContain('Preview')
    expect(container.textContent).toContain('Download')

    await act(async () => {
      buttonByText(container, 'Preview')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    const preview = container.querySelector('iframe[title="Preview Worksheet PDF"]')
    expect(preview?.getAttribute('src')).toBe('/worksheet.pdf')

    await act(async () => {
      buttonByText(container, 'Open')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(window.open).toHaveBeenCalledWith('/worksheet.pdf', '_blank', 'noopener,noreferrer')
  })

  it('renders the notes tab as a lesson whiteboard surface', async () => {
    const { container } = renderPanel(notesTab, baseItem)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="lesson-whiteboard"]')?.textContent).toContain(baseItem.title)
    })
    expect(container.querySelector('textarea[aria-label="Topic note"]')).toBeNull()
    expect(mocks.getJson).not.toHaveBeenCalledWith('/interactions/notes', expect.anything())
  })

  it('wraps long unbroken comment bodies inside the comments panel', async () => {
    const longBody = 'https://example.com/' + 'a'.repeat(140)
    mocks.getJson.mockResolvedValue([commentFixture({
      body: longBody,
    })])

    const { container } = renderPanel(commentsTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain(longBody)
    })

    const commentBody = Array.from(container.querySelectorAll('p')).find((paragraph) => paragraph.textContent === longBody)
    expect(commentBody?.className).toContain('break-words')
  })

  it('keeps comments warm when the comments tab remounts for the same item', async () => {
    const cachedComment = commentFixture({ body: 'Cached comment body' })
    mocks.getJson.mockResolvedValue([cachedComment])

    const firstPanel = renderPanel(commentsTab, baseItem)

    await waitFor(() => {
      expect(firstPanel.container.textContent).toContain('Cached comment body')
    })
    expect(mocks.getJson).toHaveBeenCalledTimes(1)

    unmountCurrentPanel()
    mocks.getJson.mockClear()

    const secondPanel = renderPanel(commentsTab, baseItem)

    await waitFor(() => {
      expect(secondPanel.container.textContent).toContain('Cached comment body')
    })
    expect(mocks.getJson).not.toHaveBeenCalled()
  })

  it('shows ratings, reactions, and expandable replies in the comments panel', async () => {
    const parentComment = commentFixture({ id: 7, body: 'This explanation helped.', reply_count: 1 })
    const reply = commentFixture({ id: 8, parent_id: 7, body: 'Same here.', author: { id: 4, full_name: 'Youssef El Idrissi', avatar_url: '' } })
    mocks.getJson.mockImplementation((_url: string, options?: { params?: { parent_id?: number } }) => {
      if (options?.params?.parent_id === 7) return Promise.resolve([reply])
      return Promise.resolve([parentComment])
    })

    const { container } = renderPanel(commentsTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('This explanation helped.')
    })

    expect(container.querySelector('section[aria-label="Comments"]')).not.toBeNull()
    expect(container.querySelector('textarea[aria-label="Write a comment"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Rate 4 out of 5"]')).not.toBeNull()

    act(() => {
      container.querySelector('button[aria-label="Rate 4 out of 5"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('button[aria-label="Rate 4 out of 5"]')?.getAttribute('aria-checked')).toBe('true')

    act(() => {
      buttonByText(container, 'Like')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(buttonByText(container, 'Like')?.getAttribute('aria-pressed')).toBe('true')

    await act(async () => {
      buttonByText(container, 'View 1 reply')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Same here.')
    })
    const parentThread = container.querySelector('article')
    const parentMain = parentThread?.querySelector('[data-comment-main]')
    const replyLane = parentThread?.querySelector('[data-comment-replies]')
    expect(parentMain?.textContent).toContain('This explanation helped.')
    expect(parentMain?.textContent).not.toContain('Same here.')
    expect(replyLane?.textContent).toContain('Same here.')
    expect(parentMain?.className).toContain('min-w-0')
    expect(parentMain?.className).toContain('w-full')
    expect(replyLane?.className).toContain('w-full')
    expect(replyLane?.className).not.toContain('sm:ml-12')
    expect(mocks.getJson).toHaveBeenCalledWith('/interactions/comments', expect.objectContaining({
      params: expect.objectContaining({ topic_item_id: 101, parent_id: 7 }),
    }))
  })

  it('posts a comment with a selected rating', async () => {
    mocks.getJson.mockResolvedValue([])
    mocks.postJson.mockImplementation((_url: string, payload: { body: string; rating?: number; topic_item_id: number }) => Promise.resolve(commentFixture({
      id: 9,
      body: payload.body,
      rating: payload.rating,
      topic_item_id: payload.topic_item_id,
    })))

    const { container } = renderPanel(commentsTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('No comments yet')
    })

    const commentInput = container.querySelector('textarea[aria-label="Write a comment"]') as HTMLTextAreaElement | null
    expect(commentInput).not.toBeNull()

    await act(async () => {
      container.querySelector('button[aria-label="Rate 5 out of 5"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      setTextareaValue(commentInput!, 'Great pacing and examples.')
      commentInput!.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
    })

    await act(async () => {
      buttonByText(container, 'Post')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(mocks.postJson).toHaveBeenCalledWith('/interactions/comments', {
      topic_item_id: 101,
      body: 'Great pacing and examples.',
      rating: 5,
    })
    await waitFor(() => {
      expect(container.textContent).toContain('Great pacing and examples.')
      expect(container.textContent).toContain('5/5')
    })
  })

  it('posts replies with the parent comment id', async () => {
    const parentComment = commentFixture({ id: 7, body: 'Can someone explain the last step?' })
    mocks.getJson.mockResolvedValue([parentComment])
    mocks.postJson.mockImplementation((_url: string, payload: { body: string; parent_id?: number; topic_item_id: number }) => Promise.resolve(commentFixture({
      id: 10,
      body: payload.body,
      parent_id: payload.parent_id ?? null,
      topic_item_id: payload.topic_item_id,
      author: { id: 5, full_name: 'Reply Author', avatar_url: '' },
    })))

    const { container } = renderPanel(commentsTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('Can someone explain the last step?')
    })

    act(() => {
      buttonByText(container, 'Reply')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const replyInput = container.querySelector('textarea[aria-label="Reply to Sara Benali"]') as HTMLTextAreaElement | null
    expect(replyInput).not.toBeNull()

    await act(async () => {
      setTextareaValue(replyInput!, 'Use the continuity condition first.')
      replyInput!.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
    })

    await act(async () => {
      buttonByText(container, 'Post reply')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(mocks.postJson).toHaveBeenCalledWith('/interactions/comments', {
      topic_item_id: 101,
      parent_id: 7,
      body: 'Use the continuity condition first.',
    })
    await waitFor(() => {
      expect(container.textContent).toContain('Use the continuity condition first.')
      expect(container.textContent).toContain('Hide replies')
    })
  })

  it('renders typed Course document blocks instead of the plain Course fallback', async () => {
    const courseTab = buildTabContent({
      id: 21,
      label: 'Course',
      tab_type: 'course',
      content: 'Plain fallback body',
      config_json: {
        schema_version: 1,
        blocks: [
          { id: 'h-decay', type: 'heading', level: 2, text: 'Loi de décroissance' },
          { id: 'p-random', type: 'paragraph', text: 'La désintégration est un phénomène aléatoire.' },
          { id: 'def-half-life', type: 'definition', title: 'Demi-vie', body: 'La moitié des noyaux initialement présents.' },
          { id: 'f-law', type: 'formula', latex: 'N(t)=N_0e^{-\\lambda t}', caption: 'Loi exponentielle' },
          { id: 'tip-units', type: 'callout', variant: 'warning', title: 'Attention aux unités', body: 'Les unités de $\\lambda$ et t doivent correspondre.' },
        ],
      },
    })

    const { container } = renderPanel(courseTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('Loi de décroissance')
      expect(container.textContent).toContain('La désintégration est un phénomène aléatoire.')
      expect(container.textContent).toContain('Définition')
      expect(container.textContent).toContain('Demi-vie')
      expect(container.textContent).toContain('Loi exponentielle')
      expect(container.textContent).toContain('Attention aux unités')
      expect(container.textContent).not.toContain('Plain fallback body')
    })
  })

  it('renders allowlisted Course component blocks through the animated registry', async () => {
    const courseTab = buildTabContent({
      id: 22,
      label: 'Course',
      tab_type: 'course',
      config_json: {
        schema_version: 1,
        blocks: [
          {
            id: 'decay-graph',
            type: 'component',
            key: 'decay_law_graph',
            display: 'inline',
            title: 'Decay graph',
            description: 'Interactive model under the lesson video.',
            props: { show_half_life: true },
          },
        ],
      },
    })

    const { container } = renderPanel(courseTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('animated')
      expect(container.textContent).toContain('Decay graph')
      expect(container.textContent).toContain('Interactive model under the lesson video.')
      expect(container.querySelector('[data-course-component-key="decay_law_graph"]')).not.toBeNull()
      expect(container.querySelector('[data-course-component-display="inline"]')).not.toBeNull()
    })
  })

  it('keeps Course component renderer failures local to the animated block', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const courseTab = buildTabContent({
        id: 25,
        label: 'Course',
        tab_type: 'course',
        config_json: {
          schema_version: 1,
          blocks: [
            { id: 'decay-sim', type: 'component', key: 'decay_simulator', display: 'panel', title: 'Decay simulator' },
            { id: 'after-error', type: 'paragraph', text: 'Lesson text remains readable.' },
          ],
        },
      })

      const { container } = renderPanel(courseTab, baseItem)

      await waitFor(() => {
        expect(container.textContent).toContain('Interactive component unavailable')
        expect(container.textContent).toContain('Decay simulator could not load')
        expect(container.textContent).toContain('Component: decay_simulator')
        expect(container.textContent).toContain('Lesson text remains readable.')
      })
    } finally {
      consoleError.mockRestore()
    }
  })

  it('rejects non-course component keys inside Course documents', async () => {
    const courseTab = buildTabContent({
      id: 23,
      label: 'Course',
      tab_type: 'course',
      config_json: {
        schema_version: 1,
        blocks: [
          { id: 'lab-in-course', type: 'component', key: 'wave_lab', display: 'panel' },
        ],
      },
    })

    const { container } = renderPanel(courseTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('Unknown Course component key')
      expect(container.textContent).toContain('wave_lab')
    })
  })

  it('renders rich Course structure blocks', async () => {
    const courseTab = buildTabContent({
      id: 24,
      label: 'Course',
      tab_type: 'course',
      config_json: {
        schema_version: 1,
        blocks: [
          { id: 'list-main', type: 'list', style: 'check', title: 'Checklist', items: [{ text: 'Check units' }] },
          { id: 'table-main', type: 'table', title: 'Values', columns: ['Time', 'Value'], rows: [['0', 'N0']] },
          { id: 'timeline-main', type: 'timeline', title: 'Process', items: [{ title: 'Start', body: 'Initial state' }] },
          { id: 'equations-main', type: 'equation_set', title: 'Relations', equations: [{ latex: 'a=b', caption: 'Equality' }] },
          { id: 'quote-main', type: 'quote', body: 'Remember the model.', cite: 'Exam note' },
          { id: 'kv-main', type: 'key_value_grid', items: [{ label: 'Half-life', value: 't1/2', caption: 'Half remains' }] },
          { id: 'code-main', type: 'code', language: 'pseudo', code: 'solve()' },
        ],
      },
    })

    const { container } = renderPanel(courseTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('Checklist')
      expect(container.textContent).toContain('Check units')
      expect(container.textContent).toContain('Values')
      expect(container.textContent).toContain('Initial state')
      expect(container.textContent).toContain('Relations')
      expect(container.textContent).toContain('Equality')
      expect(container.textContent).toContain('Remember the model.')
      expect(container.textContent).toContain('Half-life')
      expect(container.textContent).toContain('solve()')
    })
  })
})

function renderPanel(tab: TabContent, item: TopicItem) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }
  const onNoteSaved = vi.fn()

  act(() => {
    root.render(React.createElement(TabPanel, {
      tab,
      item,
      topicId: 42,
      onNoteSaved,
    }))
  })

  return { container, root, onNoteSaved }
}

function unmountCurrentPanel() {
  if (!mountedRoot) return
  const current = mountedRoot
  mountedRoot = null
  act(() => {
    current.root.unmount()
  })
  current.container.remove()
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.textContent?.includes(text)
  )) ?? null
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(textarea, value)
}

function commentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    topic_item_id: 101,
    parent_id: null,
    reply_count: 0,
    body: 'Jai confondu le guide dans Mathematiques; le quiz aide a reperer le piege.',
    author: {
      id: 3,
      full_name: 'Sara Benali',
      avatar_url: '',
    },
    created_at: '2026-06-01T09:00:00Z',
    ...overrides,
  }
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
