// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TopicWorkspacePage from '@/app/(dashboard)/topics/[topicId]/page'
import type { TopicItem, TopicWorkspace } from '@/lib/topicWorkspaceViewModel'

const mocks = vi.hoisted(() => ({
  mutateWorkspace: vi.fn(),
  postJson: vi.fn(),
  replace: vi.fn(),
  toastError: vi.fn(),
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
    success: vi.fn(),
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
}))

vi.mock('@/components/figma/skeletons', () => ({
  FigmaVideoWorkspaceSkeleton: () => React.createElement('div', null, 'loading'),
}))

vi.mock('@/components/RouteErrorState', () => ({
  default: ({ title }: { title: string }) => React.createElement('div', null, title),
}))

vi.mock('@/lib/apiClient', () => ({
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

const providerVideoWorkspace: TopicWorkspace = {
  id: 42,
  subject_title: 'Mathematics',
  title: 'Limits and Continuity',
  description: 'Provider-backed workspace',
  progress_pct: 25,
  completed_count: 0,
  item_count: 1,
  active_item_id: 101,
  active_item: {
    id: 101,
    topic_id: 42,
    section_id: 11,
    title: 'Continuity introduction',
    description: 'Provider-backed lesson',
    item_type: 'video',
    renderer_key: '',
    duration_seconds: 600,
    watched_seconds: 75,
    resume_seconds: 75,
    progress_status: 'in_progress',
    primary_resource: {
      id: 601,
      title: 'Continuity stream',
      resource_type: 'video',
      provider: 'vdocipher',
      provider_resource_id: 'demo-preview',
      url: 'https://video.example/stream',
      summary: 'Watch the stream',
    },
    primary_tab_content_id: 500,
    primary_tab: {
      id: 500,
      label: 'Lesson video',
      tab_type: 'video',
      content: '',
      config_json: {},
      renderer_key: 'vdocipher',
      order: 0,
      resource: {
        id: 601,
        title: 'Continuity stream',
        resource_type: 'video',
        provider: 'vdocipher',
        provider_resource_id: 'demo-preview',
        url: 'https://video.example/stream',
        summary: 'Watch the stream',
      },
    },
    tabs: [
      {
        id: 500,
        label: 'Lesson video',
        tab_type: 'video',
        content: '',
        config_json: {},
        renderer_key: 'vdocipher',
        order: 0,
        resource: {
          id: 601,
          title: 'Continuity stream',
          resource_type: 'video',
          provider: 'vdocipher',
          provider_resource_id: 'demo-preview',
          url: 'https://video.example/stream',
          summary: 'Watch the stream',
        },
      },
      {
        id: 501,
        label: 'Course',
        tab_type: 'course',
        content: 'Course content remains available below the player.',
        config_json: {},
        renderer_key: '',
        order: 1,
        resource: null,
      },
    ],
  },
  sections: [
    {
      id: 11,
      title: 'Lessons',
      section_type: 'lesson',
      order: 1,
      items: [
        {
          id: 101,
          topic_id: 42,
          section_id: 11,
          title: 'Continuity introduction',
          description: 'Provider-backed lesson',
          item_type: 'video',
          renderer_key: '',
          duration_seconds: 600,
          watched_seconds: 75,
          resume_seconds: 75,
          progress_status: 'in_progress',
          primary_resource: {
            id: 601,
            title: 'Continuity stream',
            resource_type: 'video',
            provider: 'vdocipher',
            provider_resource_id: 'demo-preview',
            url: 'https://video.example/stream',
            summary: 'Watch the stream',
          },
          primary_tab_content_id: 500,
          primary_tab: {
            id: 500,
            label: 'Lesson video',
            tab_type: 'video',
            content: '',
            config_json: {},
            renderer_key: 'vdocipher',
            order: 0,
            resource: {
              id: 601,
              title: 'Continuity stream',
              resource_type: 'video',
              provider: 'vdocipher',
              provider_resource_id: 'demo-preview',
              url: 'https://video.example/stream',
              summary: 'Watch the stream',
            },
          },
          tabs: [
            {
              id: 500,
              label: 'Lesson video',
              tab_type: 'video',
              content: '',
              config_json: {},
              renderer_key: 'vdocipher',
              order: 0,
              resource: {
                id: 601,
                title: 'Continuity stream',
                resource_type: 'video',
                provider: 'vdocipher',
                provider_resource_id: 'demo-preview',
                url: 'https://video.example/stream',
                summary: 'Watch the stream',
              },
            },
            {
              id: 501,
              label: 'Course',
              tab_type: 'course',
              content: 'Course content remains available below the player.',
              config_json: {},
              renderer_key: '',
              order: 1,
              resource: null,
            },
          ],
        },
      ],
    },
  ],
  search_results: [],
}

const providerActiveItem = providerVideoWorkspace.active_item as TopicItem
const providerSectionItem = providerVideoWorkspace.sections[0].items[0]

const youtubeWorkspace: TopicWorkspace = {
  ...providerVideoWorkspace,
  active_item: {
    ...providerActiveItem,
    title: 'YouTube continuity introduction',
    primary_resource: {
      id: 701,
      title: 'YouTube continuity stream',
      resource_type: 'video',
      provider: 'youtube',
      provider_resource_id: 'dQw4w9WgXcQ',
      url: '',
      summary: 'Watch the YouTube lesson',
    },
    primary_tab: {
      ...providerActiveItem.primary_tab!,
      renderer_key: 'youtube_embed',
      resource: {
        id: 701,
        title: 'YouTube continuity stream',
        resource_type: 'video',
        provider: 'youtube',
        provider_resource_id: 'dQw4w9WgXcQ',
        url: '',
        summary: 'Watch the YouTube lesson',
      },
    },
  },
  sections: [
    {
      ...providerVideoWorkspace.sections[0],
      items: [
        {
          ...providerSectionItem,
          title: 'YouTube continuity introduction',
          primary_resource: {
            id: 701,
            title: 'YouTube continuity stream',
            resource_type: 'video',
            provider: 'youtube',
            provider_resource_id: 'dQw4w9WgXcQ',
            url: '',
            summary: 'Watch the YouTube lesson',
          },
          primary_tab: {
            ...providerSectionItem.primary_tab!,
            renderer_key: 'youtube_embed',
            resource: {
              id: 701,
              title: 'YouTube continuity stream',
              resource_type: 'video',
              provider: 'youtube',
              provider_resource_id: 'dQw4w9WgXcQ',
              url: '',
              summary: 'Watch the YouTube lesson',
            },
          },
          tabs: [
            {
              ...providerSectionItem.tabs[0],
              renderer_key: 'youtube_embed',
              resource: {
                id: 701,
                title: 'YouTube continuity stream',
                resource_type: 'video',
                provider: 'youtube',
                provider_resource_id: 'dQw4w9WgXcQ',
                url: '',
                summary: 'Watch the YouTube lesson',
              },
            },
            providerSectionItem.tabs[1],
          ],
        },
      ],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  currentWorkspace = providerVideoWorkspace
  mocks.videoComplete = null
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
