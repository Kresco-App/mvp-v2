// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminCommunicationsPage from '@/app/admin/communications/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  patchJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  patchJson: mocks.patchJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockResolvedValue(communicationsFixture)
  mocks.patchJson.mockResolvedValue({ id: 61, status: 'in_review' })
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
  }
  mountedRoot = null
})

describe('AdminCommunicationsPage', () => {
  it('renders communication queues with tab switching and search', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Communications')
      expect(container.textContent).toContain('Response pressure')
      expect(container.textContent).toContain('Stale chats')
      expect(container.textContent).toContain('Unassigned')
      expect(container.textContent).toContain('Comms Student')
      expect(container.textContent).toContain('9')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/communications?limit=100')
    })

    clickButton(container, 'Live')
    await waitFor(() => {
      expect(container.textContent).toContain('Can you repeat the proof?')
    })

    clickButton(container, 'Reports')
    await waitFor(() => {
      expect(container.textContent).toContain('Comms report')
      expect(container.textContent).toContain('Live chat needs moderation')
    })

    clickButton(container, 'Start review')
    await waitFor(() => {
      expect(mocks.patchJson).toHaveBeenCalledWith('/admin/reports/61', { status: 'in_review' })
      expect(container.textContent).toContain('In review')
    })

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Rechercher dans les communications"]')
    if (!input) throw new Error('Expected search input')

    setInputValue(input, 'missing')

    await waitFor(() => {
      expect(container.textContent).toContain('0 ligne(s) affichee(s)')
      expect(container.textContent).not.toContain('Comms report')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<AdminCommunicationsPage />)
  })
  mountedRoot = { root, container }
  return { container }
}

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(label))
  if (!button) throw new Error(`Expected ${label} button`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const startedAt = Date.now()
  let lastError: unknown
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
  }
  throw lastError
}

const communicationsFixture = {
  generated_at: '2026-06-20T02:00:00Z',
  summary: {
    total_conversations: 2,
    open_conversations: 1,
    unread_for_professors: 4,
    unread_for_students: 1,
    messages_7d: 12,
    live_sessions_live: 1,
    pending_live_interactions: 2,
    open_reports: 3,
    urgent_open_reports: 1,
  },
  chat_conversations_by_status: { open: 1, closed: 1 },
  live_interactions_by_status: { pending: 2, answered: 1 },
  reports_by_status: { open: 3 },
  reports_by_priority: { urgent: 1, normal: 2 },
  conversations: [
    {
      conversation_id: 41,
      status: 'open',
      course_offering_id: 11,
      course_title: 'Physics 2BAC',
      professor_user_id: 7,
      professor_name: 'Prof Kresco',
      student_user_id: 22,
      student_name: 'Comms Student',
      unread_for_professor: 4,
      unread_for_student: 1,
      last_message_preview: 'Please check this live question.',
      last_message_at: '2026-06-20T01:50:00Z',
      updated_at: '2026-06-20T01:50:00Z',
    },
  ],
  live_interactions: [
    {
      interaction_id: 51,
      live_session_id: 9,
      session_title: 'Comms Live Session',
      kind: 'question',
      status: 'pending',
      professor_user_id: 7,
      professor_name: 'Prof Kresco',
      student_user_id: 22,
      student_name: 'Comms Student',
      body: 'Can you repeat the proof?',
      answer: '',
      created_at: '2026-06-20T01:55:00Z',
      answered_at: null,
    },
  ],
  reports: [
    {
      report_id: 61,
      target_type: 'live_message',
      target_id: '51',
      reason: 'bug',
      status: 'open',
      priority: 'urgent',
      title: 'Comms report',
      description: 'Live chat needs moderation',
      reporter_user_id: 22,
      reporter_name: 'Comms Student',
      assigned_to_user_id: null,
      assigned_to_name: '',
      created_at: '2026-06-20T01:56:00Z',
      updated_at: '2026-06-20T01:56:00Z',
    },
  ],
}
