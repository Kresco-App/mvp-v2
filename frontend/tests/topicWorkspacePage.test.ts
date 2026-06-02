// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TopicWorkspacePage from '@/app/(dashboard)/topics/[topicId]/page'
import type { TopicWorkspace } from '@/lib/topicWorkspaceViewModel'

const mocks = vi.hoisted(() => ({
  mutateWorkspace: vi.fn(),
  replace: vi.fn(),
  toastError: vi.fn(),
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
  default: ({ lessonId }: { lessonId: number }) => React.createElement('div', { 'data-testid': 'video-player' }, `Video player ${lessonId}`),
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

vi.mock('@/components/topic-workspace/TopicWorkspacePanels', () => ({
  TabPanel: () => React.createElement('div', null, 'tab panel'),
}))

vi.mock('@/lib/topicWorkspaceData', () => ({
  defaultTopicWorkspaceDataRequest: () => ({ targets: { itemId: null, tabId: null, resourceId: null, quizId: null, questionId: null } }),
  topicWorkspaceSWRKey: () => '/courses/topics/42/workspace',
  useTopicWorkspaceData: () => ({
    key: '/courses/topics/42/workspace',
    workspace: providerVideoWorkspace,
    error: null,
    loading: false,
    isValidating: false,
    mutate: mocks.mutateWorkspace,
  }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

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

beforeEach(() => {
  vi.clearAllMocks()
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

describe('TopicWorkspacePage primary playback', () => {
  it('renders the provider-backed lesson with VideoPlayer instead of the YouTube frame', () => {
    const { container } = renderPage()

    expect(container.textContent).toContain('Mathematics: Continuity introduction')
    expect(container.querySelector('[data-testid="video-player"]')?.textContent).toContain('Video player 101')
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
