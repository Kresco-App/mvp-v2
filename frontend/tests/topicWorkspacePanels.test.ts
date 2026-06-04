// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TabPanel } from '@/components/topic-workspace/TopicWorkspacePanels'
import type { TabContent, TopicItem, TopicWorkspaceNote } from '@/lib/topicWorkspaceViewModel'

const mocks = vi.hoisted(() => ({
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  patchJson: vi.fn(),
  postJson: vi.fn(),
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

vi.mock('@/lib/apiClient', () => ({
  deleteJson: mocks.deleteJson,
  getJson: mocks.getJson,
  patchJson: mocks.patchJson,
  postJson: mocks.postJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

const baseItem: TopicItem = {
  id: 101,
  topic_id: 42,
  section_id: 11,
  title: 'Continuity introduction',
  description: 'Study the worksheet and keep notes here.',
  item_type: 'lesson',
  renderer_key: '',
  duration_seconds: 600,
  progress_status: 'in_progress',
  primary_resource: null,
  tabs: [],
}

const resourceTab: TabContent = {
  id: 12,
  label: 'Worksheet',
  tab_type: 'resource',
  content: 'Practice worksheet for continuity.',
  config_json: {},
  renderer_key: '',
  order: 2,
  resource: {
    id: 22,
    title: 'Worksheet PDF',
    resource_type: 'pdf',
    provider: 'local',
    provider_resource_id: '',
    url: '/worksheet.pdf',
    summary: 'Practice worksheet',
  },
}

const notesTab: TabContent = {
  id: 8,
  label: 'Notes',
  tab_type: 'notes',
  content: '',
  config_json: {},
  renderer_key: '',
  order: 4,
  resource: null,
}

const commentsTab: TabContent = {
  id: 9,
  label: 'Comments',
  tab_type: 'comments',
  content: '',
  config_json: {},
  renderer_key: '',
  order: 5,
  resource: null,
}

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

  it('lists context notes and supports create, edit, and delete when note endpoints exist', async () => {
    const existingNotes: TopicWorkspaceNote[] = [
      {
        id: 1,
        topic_id: 42,
        topic_item_id: 101,
        tab_content_id: 8,
        body: 'Match this note to the active tab',
        created_at: '2026-05-30T10:00:00Z',
        updated_at: '2026-05-30T10:00:00Z',
      },
      {
        id: 2,
        topic_id: 42,
        topic_item_id: 101,
        tab_content_id: 99,
        body: 'Other tab note should stay hidden',
        created_at: '2026-05-30T11:00:00Z',
        updated_at: '2026-05-30T11:00:00Z',
      },
    ]

    mocks.getJson.mockResolvedValue(existingNotes)
    mocks.postJson.mockImplementation(async (url: string, body?: Record<string, unknown>) => {
      if (url === '/interactions/notes') {
        return {
          id: 3,
          topic_id: 42,
          topic_item_id: 101,
          tab_content_id: 8,
          body: String(body?.body ?? ''),
          created_at: '2026-06-01T08:00:00Z',
          updated_at: '2026-06-01T08:00:00Z',
        }
      }
      throw new Error(`unexpected post url: ${url}`)
    })
    mocks.patchJson.mockImplementation(async (url: string, body?: Record<string, unknown>) => ({
      id: 3,
      topic_id: 42,
      topic_item_id: 101,
      tab_content_id: 8,
      body: String(body?.body ?? ''),
      created_at: '2026-06-01T08:00:00Z',
      updated_at: '2026-06-01T08:05:00Z',
    }))
    mocks.deleteJson.mockResolvedValue({})

    const { container } = renderPanel(notesTab, baseItem)

    await waitFor(() => {
      expect(container.textContent).toContain('Match this note to the active tab')
    })
    expect(container.textContent).not.toContain('Other tab note should stay hidden')

    await act(async () => {
      changeField(container, 'Topic note', 'Newly created note')
      await flushPromises()
      buttonByText(container, 'Save note')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Newly created note')
    })
    expect(mocks.postJson).toHaveBeenCalledWith('/interactions/notes', {
      topic_id: 42,
      topic_item_id: 101,
      tab_content_id: 8,
      body: 'Newly created note',
    })

    await act(async () => {
      buttonByText(container, 'Edit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    await act(async () => {
      changeField(container, 'Edit note 3', 'Edited note body')
      buttonByText(container, 'Save changes')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Edited note body')
    })
    expect(mocks.patchJson).toHaveBeenCalledWith('/interactions/notes/3', {
      body: 'Edited note body',
    })

    await act(async () => {
      buttonByText(container, 'Delete')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(container.textContent).not.toContain('Edited note body')
    })
    expect(mocks.deleteJson).toHaveBeenCalledWith('/interactions/notes/3')
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

function changeField(container: HTMLElement, label: string, value: string) {
  const field = Array.from(container.querySelectorAll('textarea')).find((textarea) => (
    textarea.getAttribute('aria-label') === label
  )) as HTMLTextAreaElement | undefined
  if (!field) throw new Error(`field not found: ${label}`)
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    valueSetter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
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
