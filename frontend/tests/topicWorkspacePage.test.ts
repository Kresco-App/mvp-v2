// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TopicWorkspacePage from '@/app/(dashboard)/topics/[topicId]/page'
import type { TopicItem, TopicWorkspace } from '@/lib/topicWorkspaceViewModel'
import {
  buildTabContent,
  buildTopicItem,
  buildTopicResource,
  buildTopicSection,
  buildTopicWorkspace,
} from './factories/topicWorkspace'

const mocks = vi.hoisted(() => ({
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  mutateWorkspace: vi.fn(),
  postJson: vi.fn(),
  replace: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  videoComplete: null as null | (() => void | Promise<void>),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ topicId: '42' }),
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  motion: {
    div: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    info: vi.fn(),
  },
}))

vi.mock('@/components/VideoPlayer', () => ({
  default: ({ lessonId, resumeSeconds, onComplete }: { lessonId: number; resumeSeconds?: number; onComplete?: () => void | Promise<void> }) => {
    mocks.videoComplete = onComplete ?? null
    return React.createElement('div', { 'data-testid': 'video-player' }, `Video player ${lessonId}:${resumeSeconds ?? 0}`)
  },
}))

vi.mock('@/components/YouTubeVideoPlayer', () => ({
  default: ({ lessonId, videoId, resumeSeconds }: { lessonId: number; videoId: string; resumeSeconds?: number }) => (
    React.createElement('div', { 'data-testid': 'youtube-tracked-player' }, `YouTube player ${lessonId}:${videoId}:${resumeSeconds ?? 0}`)
  ),
}))

vi.mock('@/components/figma', () => ({
  LessonBody: ({ children }: { children: React.ReactNode }) => React.createElement('section', null, children),
  PrimaryContentFrame: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'primary-frame' }, children),
  VideoLearningWorkspace: ({
    title,
    primaryContent,
    toolbar,
    children,
  }: {
    title: string
    primaryContent: React.ReactNode
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => React.createElement('main', null,
    React.createElement('h1', null, title),
    toolbar,
    primaryContent,
    children,
  ),
  VideoPlayerFrame: ({ videoId }: { videoId: string }) => React.createElement('div', { 'data-testid': 'youtube-frame' }, videoId),
  VideoFrameState: ({ title, message }: { title: string; message: string }) => (
    React.createElement('div', { 'data-testid': 'video-frame-state' }, `${title} ${message}`)
  ),
}))

vi.mock('@/components/figma/skeletons', () => ({
  FigmaVideoWorkspaceSkeleton: () => React.createElement('div', null, 'loading'),
}))

vi.mock('@/components/RouteErrorState', () => ({
  default: ({ title }: { title: string }) => React.createElement('div', null, title),
}))

vi.mock('@/lib/apiClient', () => ({
  deleteJson: mocks.deleteJson,
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

vi.mock('@/components/topic-workspace/TopicWorkspacePanels', () => ({
  TabPanel: () => React.createElement('div', null, 'tab panel'),
}))

vi.mock('@/lib/topicWorkspaceData', () => ({
  defaultTopicWorkspaceDataRequest: () => ({ targets: { itemId: null, tabId: null, resourceId: null, quizId: null, questionId: null } }),
  topicWorkspaceSWRKey: () => '/courses/topics/42/workspace',
  useTopicWorkspaceData: () => ({
    key: '/courses/topics/42/workspace',
    workspace: currentWorkspace,
    error: null,
    loading: false,
    isValidating: false,
    mutate: mocks.mutateWorkspace,
  }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null
let currentWorkspace: TopicWorkspace

const providerVideoResource = buildTopicResource({
  id: 601,
  title: 'Continuity stream',
  resource_type: 'video',
  provider: 'vdocipher',
  provider_resource_id: 'demo-preview',
  url: 'https://video.example/stream',
  summary: 'Watch the stream',
})
const providerVideoTab = buildTabContent({
  id: 500,
  label: 'Lesson video',
  tab_type: 'video',
  content: '',
  renderer_key: 'vdocipher',
  order: 0,
  resource: providerVideoResource,
})
const providerCourseTab = buildTabContent({
  id: 501,
  label: 'Course',
  tab_type: 'course',
  content: 'Course content remains available below the player.',
  order: 1,
})
const providerActiveItem: TopicItem = buildTopicItem({
  id: 101,
  topic_id: 42,
  section_id: 11,
  title: 'Continuity introduction',
  description: 'Provider-backed lesson',
  item_type: 'video',
  duration_seconds: 600,
  watched_seconds: 75,
  resume_seconds: 75,
  primary_resource: providerVideoResource,
  primary_tab_content_id: providerVideoTab.id,
  primary_tab: providerVideoTab,
  tabs: [providerVideoTab, providerCourseTab],
})
const providerVideoWorkspace: TopicWorkspace = buildWorkspaceForActiveItem(providerActiveItem, {
  description: 'Provider-backed workspace',
  progress_pct: 25,
})

const youtubeResource = buildTopicResource({
  id: 701,
  title: 'YouTube continuity stream',
  resource_type: 'video',
  provider: 'youtube',
  provider_resource_id: 'dQw4w9WgXcQ',
  url: '',
  summary: 'Watch the YouTube lesson',
})
const youtubeVideoTab = {
  ...providerVideoTab,
  renderer_key: 'youtube_embed',
  resource: youtubeResource,
}
const youtubeActiveItem: TopicItem = {
  ...providerActiveItem,
  title: 'YouTube continuity introduction',
  primary_resource: youtubeResource,
  primary_tab: youtubeVideoTab,
  tabs: [youtubeVideoTab, providerCourseTab],
}
const youtubeWorkspace: TopicWorkspace = buildWorkspaceForActiveItem(youtubeActiveItem, {
  description: 'Provider-backed workspace',
  progress_pct: 25,
})

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  currentWorkspace = providerVideoWorkspace
  mocks.videoComplete = null
  mocks.getJson.mockResolvedValue([])
  mocks.postJson.mockResolvedValue({
    id: 77,
    target_type: 'topic_item',
    target_id: providerActiveItem.id,
    note: '',
    tags: [],
  })
  mocks.deleteJson.mockResolvedValue({ ok: true, id: 77 })
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

describe('TopicWorkspacePage primary playback', () => {
  it('renders the provider-backed lesson with VideoPlayer instead of the YouTube frame', () => {
    const { container } = renderPage()

    expect(container.textContent).toContain('Mathematics: Continuity introduction')
    expect(container.querySelector('[data-testid="video-player"]')?.textContent).toContain('Video player 101:75')
    expect(container.querySelector('[data-testid="youtube-frame"]')).toBeNull()
  })

  it('keeps Course tabs below while the primary area stays on the lesson video', () => {
    currentWorkspace = workspaceWithActiveItem({
      primary_resource: providerVideoResource,
      primary_tab_content_id: providerCourseTab.id,
      primary_tab: providerCourseTab,
      tabs: [providerCourseTab],
    })

    const { container } = renderPage()

    expect(container.querySelector('[data-testid="primary-frame"]')?.textContent).toContain('Video player 101:75')
    expect(container.textContent).toContain('tab panel')
    expect(container.querySelector('[data-testid="youtube-frame"]')).toBeNull()
  })

  it('refreshes workspace after tracked video completion without a duplicate completion post', () => {
    renderPage()

    act(() => {
      mocks.videoComplete?.()
    })

    expect(mocks.postJson).not.toHaveBeenCalled()
    expect(mocks.mutateWorkspace).toHaveBeenCalled()
  })

  it('renders YouTube lessons with the tracked player instead of the static frame', () => {
    currentWorkspace = youtubeWorkspace

    const { container } = renderPage()

    expect(container.textContent).toContain('Mathematics: YouTube continuity introduction')
    expect(container.querySelector('[data-testid="youtube-tracked-player"]')?.textContent).toContain('YouTube player 101:dQw4w9WgXcQ:75')
    expect(container.querySelector('[data-testid="video-player"]')).toBeNull()
    expect(container.querySelector('[data-testid="youtube-frame"]')).toBeNull()
  })

  it('does not expose generic completion for under-watched timed video items', () => {
    const { container } = renderPage()

    expect(buttonByText(container, 'Mark complete')).toBeUndefined()
  })

  it('does not expose generic completion for under-watched timed policy items', () => {
    currentWorkspace = workspaceWithActiveItem({
      item_type: 'lesson',
      completion_policy: 'timed',
      duration_seconds: 120,
      watched_seconds: 20,
      primary_resource: null,
      primary_tab: providerActiveItem.tabs[1],
      tabs: [providerActiveItem.tabs[1]],
    })

    const { container } = renderPage()

    expect(buttonByText(container, 'Mark complete')).toBeUndefined()
  })

  it('does not expose generic completion for quiz items', () => {
    currentWorkspace = workspaceWithActiveItem({
      item_type: 'checkpoint_quiz',
      duration_seconds: 0,
      watched_seconds: 0,
      primary_resource: null,
      primary_tab: {
        ...providerActiveItem.primary_tab!,
        tab_type: 'quiz',
        label: 'Quiz',
        renderer_key: '',
        resource: null,
      },
      tabs: [
        {
          ...providerActiveItem.tabs[1],
          id: 502,
          tab_type: 'quiz',
          label: 'Quiz',
        },
      ],
    })

    const { container } = renderPage()

    expect(buttonByText(container, 'Mark complete')).toBeUndefined()
  })

  it('keeps generic completion available for untimed lesson items', () => {
    currentWorkspace = workspaceWithActiveItem({
      item_type: 'lesson',
      duration_seconds: 0,
      watched_seconds: 0,
      primary_resource: null,
      primary_tab: providerActiveItem.tabs[1],
      tabs: [providerActiveItem.tabs[1]],
    })

    const { container } = renderPage()

    expect(buttonByText(container, 'Mark complete')).toBeDefined()
  })

  it('renders a native missing-video state instead of iframe srcdoc fallback', () => {
    currentWorkspace = workspaceWithActiveItem({
      item_type: 'lesson',
      duration_seconds: 0,
      primary_resource: null,
      primary_tab: providerActiveItem.tabs[1],
      tabs: [providerActiveItem.tabs[1]],
    })

    const { container } = renderPage()

    expect(container.querySelector('[data-testid="video-frame-state"]')?.textContent).toContain('Course content stays available below')
    expect(container.querySelector('[data-testid="youtube-frame"]')).toBeNull()
  })

  it('keeps saved item details compact and uses fixed tag choices', async () => {
    const { container } = renderPage()

    await act(async () => {
      await flushPromises()
    })
    await act(async () => {
      buttonByText(container, 'Save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(mocks.postJson).toHaveBeenCalledWith('/interactions/saves', {
      target_type: 'topic_item',
      target_id: providerActiveItem.id,
      topic_id: providerVideoWorkspace.id,
      topic_item_id: providerActiveItem.id,
      label: providerActiveItem.title,
    })
    expect(container.textContent).toContain('Saved')
    expect(container.textContent).not.toContain('Tags separated by commas')

    await act(async () => {
      buttonByText(container, 'Details')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Optional save details')
    expect(container.querySelector('input[aria-label="Saved item tags"]')).toBeNull()
    expect(buttonByText(container, 'Relevant')).toBeDefined()

    const note = container.querySelector('textarea[aria-label="Saved item note"]') as HTMLTextAreaElement
    await act(async () => {
      setTextareaValue(note, 'Recheck this before the exam')
      note.dispatchEvent(new Event('input', { bubbles: true }))
      buttonByText(container, 'Relevant')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    mocks.postJson.mockResolvedValueOnce({
      id: 77,
      target_type: 'topic_item',
      target_id: providerActiveItem.id,
      note: 'Recheck this before the exam',
      tags: ['Relevant'],
    })

    await act(async () => {
      buttonByText(container, 'Update')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(mocks.postJson).toHaveBeenLastCalledWith('/interactions/saves', {
      target_type: 'topic_item',
      target_id: providerActiveItem.id,
      topic_id: providerVideoWorkspace.id,
      topic_item_id: providerActiveItem.id,
      label: providerActiveItem.title,
      note: 'Recheck this before the exam',
      tags: ['Relevant'],
    })
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith('Save details updated.')
  })

  it('shows an existing saved state and can unsave from the topic page', async () => {
    mocks.getJson.mockResolvedValueOnce([
      {
        id: 88,
        target_type: 'topic_item',
        target_id: providerActiveItem.id,
        note: '',
        tags: [],
      },
    ])
    const { container } = renderPage()

    await waitFor(() => {
      expect(buttonByText(container, 'Saved')).toBeDefined()
      expect(buttonByText(container, 'Details')).toBeDefined()
    })
    expect(buttonByText(container, 'Remove save')).toBeUndefined()

    await act(async () => {
      buttonByText(container, 'Details')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      buttonByText(container, 'Remove save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    expect(mocks.deleteJson).toHaveBeenCalledWith('/interactions/saves/88')
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith('Removed from saved.')
    expect(buttonByText(container, 'Save')).toBeDefined()
    expect(buttonByText(container, 'Remove save')).toBeUndefined()
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(TopicWorkspacePage))
  })

  return { container, root }
}

function buildWorkspaceForActiveItem(activeItem: TopicItem, overrides: Partial<TopicWorkspace> = {}): TopicWorkspace {
  return buildTopicWorkspace({
    id: 42,
    subject_title: 'Mathematics',
    title: 'Limits and Continuity',
    description: 'Provider-backed workspace',
    progress_pct: 25,
    completed_count: 0,
    item_count: 1,
    active_item_id: activeItem.id,
    active_item: activeItem,
    sections: [
      buildTopicSection({
        id: activeItem.section_id,
        title: 'Lessons',
        section_type: 'lesson',
        order: 1,
        items: [activeItem],
      }),
    ],
    ...overrides,
  })
}

function workspaceWithActiveItem(overrides: Partial<TopicItem>): TopicWorkspace {
  const activeItem = {
    ...providerActiveItem,
    ...overrides,
  }
  return buildWorkspaceForActiveItem(activeItem)
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(text))
}

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(element, value)
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
