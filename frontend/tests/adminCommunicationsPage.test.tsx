// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminCommunicationsPage from '@/app/admin/communications/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockImplementation((url: string) => {
    if (url.includes('q=proof')) return Promise.resolve(searchFixture)
    return Promise.resolve(communicationsFixture)
  })
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
  it('renders professor-first private chats and searches through the API', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Private messages')
      expect(container.textContent).toContain('Professor backlog')
      expect(container.textContent).toContain('Awaiting professor')
      expect(container.textContent).toContain('Awaiting student')
      expect(container.textContent).toContain('7d messages')
      expect(container.textContent).toContain('Professor inbox')
      expect(container.textContent).toContain('Prof Kresco')
      expect(container.textContent).toContain('Comms Student')
      expect(container.textContent).toContain('4 awaiting professor')
      expect(container.textContent).toContain('1 awaiting student')
      expect(container.textContent).toContain('Messages')
      expect(container.textContent).toContain('Here is the professor answer.')
      expect(container.textContent).not.toContain('Reports')
      expect(container.textContent).not.toContain('Questions live')
      expect(container.textContent).not.toContain('Search private chats')
      expect(container.textContent).not.toContain('STUDENT')
      expect(container.textContent).not.toContain('Private transcript')
      expect(container.textContent).not.toContain('Professor unread')
      expect(container.textContent).not.toContain('Student unread')
      expect(container.textContent).not.toContain('Unread prof')
      expect(container.textContent).not.toContain('Needs reply')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/communications?limit=100')
      expect(container.textContent).toContain('1-5 / 10')
    })

    clickButton(container, 'Next')

    await waitFor(() => {
      expect(container.textContent).toContain('6-10 / 10')
    })

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search private messages"]')
    if (!input) throw new Error('Expected search input')

    setInputValue(input, 'proof')
    clickButton(container, 'Search')

    await waitFor(() => {
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/communications?limit=100&q=proof')
      expect(container.textContent).toContain('match')
      expect(container.textContent).toContain('Proof Student')
      expect(container.textContent).toContain('The proof step is unclear.')
      expect(container.textContent).not.toContain('Comms Student')
    })

    clickButton(container, 'Clear')

    await waitFor(() => {
      expect(mocks.getJson).toHaveBeenLastCalledWith('/admin/communications?limit=100')
      expect(container.textContent).toContain('Comms Student')
      expect(container.textContent).not.toContain('Proof Student')
    })
  })

  it('hydrates private message search from account context URL', async () => {
    window.history.replaceState(null, '', '/admin/communications?student_id=23&q=proof')
    const { container } = renderPage()

    await waitFor(() => {
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Search private messages"]')
      expect(input?.value).toBe('proof')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/communications?limit=100&q=proof')
      expect(mocks.getJson).not.toHaveBeenCalledWith('/admin/communications?limit=100')
      expect(container.textContent).toContain('Proof Student')
      expect(container.textContent).toContain('The proof step is unclear.')
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

const baseConversation = {
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
  last_message_preview: 'Please check this private question.',
  last_message_at: '2026-06-20T01:50:00Z',
  updated_at: '2026-06-20T01:50:00Z',
  messages: [
    {
      message_id: 901,
      conversation_id: 41,
      sender_user_id: 22,
      sender_name: 'Comms Student',
      sender_role: 'student',
      body: 'Please check this private question.',
      attachment_url: '',
      attachment_name: '',
      attachment_mime_type: '',
      attachment_size: 0,
      status: 'sent',
      created_at: '2026-06-20T01:45:00Z',
      read_at: null,
    },
    {
      message_id: 902,
      conversation_id: 41,
      sender_user_id: 7,
      sender_name: 'Prof Kresco',
      sender_role: 'professor',
      body: 'Here is the professor answer.',
      attachment_url: '',
      attachment_name: '',
      attachment_mime_type: '',
      attachment_size: 0,
      status: 'sent',
      created_at: '2026-06-20T01:50:00Z',
      read_at: null,
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      message_id: 903 + index,
      conversation_id: 41,
      sender_user_id: index % 2 ? 7 : 22,
      sender_name: index % 2 ? 'Prof Kresco' : 'Comms Student',
      sender_role: index % 2 ? 'professor' : 'student',
      body: `Follow up ${index + 1}`,
      attachment_url: '',
      attachment_name: '',
      attachment_mime_type: '',
      attachment_size: 0,
      status: 'sent',
      created_at: '2026-06-20T01:55:00Z',
      read_at: null,
    })),
  ],
}

const communicationsFixture = {
  generated_at: '2026-06-20T02:00:00Z',
  summary: {
    total_conversations: 2,
    open_conversations: 1,
    total_professors: 1,
    students_in_private_chats: 2,
    unread_for_professors: 4,
    unread_for_students: 1,
    messages_total: 12,
    messages_7d: 12,
    matched_conversations: 1,
  },
  search_query: '',
  chat_conversations_by_status: { open: 1, closed: 1 },
  professors: [
    {
      professor_user_id: 7,
      professor_name: 'Prof Kresco',
      conversation_count: 1,
      open_conversations: 1,
      unread_for_professor: 4,
      unread_for_student: 1,
      messages_shown: 2,
      last_message_at: '2026-06-20T01:50:00Z',
      conversations: [baseConversation],
    },
  ],
  conversations: [baseConversation],
}

const searchConversation = {
  ...baseConversation,
  conversation_id: 42,
  student_user_id: 23,
  student_name: 'Proof Student',
  last_message_preview: 'The proof step is unclear.',
  messages: [
    {
      ...baseConversation.messages[0],
      message_id: 903,
      conversation_id: 42,
      sender_user_id: 23,
      sender_name: 'Proof Student',
      body: 'The proof step is unclear.',
    },
  ],
}

const searchFixture = {
  ...communicationsFixture,
  search_query: 'proof',
  summary: {
    ...communicationsFixture.summary,
    matched_conversations: 1,
  },
  professors: [
    {
      professor_user_id: 7,
      professor_name: 'Prof Kresco',
      conversation_count: 1,
      open_conversations: 1,
      unread_for_professor: 1,
      unread_for_student: 0,
      messages_shown: 1,
      last_message_at: '2026-06-20T01:55:00Z',
      conversations: [searchConversation],
    },
  ],
  conversations: [searchConversation],
}
