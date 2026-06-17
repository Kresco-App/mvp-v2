// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TabPanel } from '@/components/topic-workspace/TopicWorkspacePanels'
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
  default: (props: Record<string, unknown>) => React.createElement('img', props),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/components/animated/registry', () => ({
  AnimatedContentRenderer: () => React.createElement('div', null, 'animated'),
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
  document.body.innerHTML = ''
  Object.defineProperty(window, 'open', {
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

    const { container } = renderPanel(resourceTab, baseItem)

    expect(container.textContent).toContain('Worksheet PDF')
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

  it('renders the notes tab as a lesson whiteboard surface', () => {
    const { container } = renderPanel(notesTab, baseItem)

    expect(container.querySelector('[data-testid="lesson-whiteboard"]')?.textContent).toContain(baseItem.title)
    expect(container.querySelector('textarea[aria-label="Topic note"]')).toBeNull()
  })

  it('wraps long unbroken comment bodies inside the comments panel', async () => {
    const longBody = 'https://example.com/' + 'a'.repeat(140)
    mocks.getJson.mockResolvedValue([{
      id: 7,
      topic_item_id: 101,
      body: longBody,
      author: {
        id: 3,
        full_name: 'Sara Benali',
        avatar_url: '',
      },
      created_at: '2026-06-01T09:00:00Z',
    }])

    const { container } = renderPanel(commentsTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain(longBody)
    })

    const commentBody = Array.from(container.querySelectorAll('p')).find((paragraph) => paragraph.textContent === longBody)
    expect(commentBody?.className).toContain('break-words')
  })
})

function renderPanel(tab: TabContent, item: TopicItem) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(TabPanel, {
      tab,
      item,
      topicId: 42,
      onNoteSaved: vi.fn(),
    }))
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
