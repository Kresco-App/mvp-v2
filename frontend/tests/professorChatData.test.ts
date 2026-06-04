// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiSWRConfig } from '@/lib/apiData'
import {
  professorConversationListParams,
  professorConversationsSWRKey,
  professorMessagesSWRKey,
  useProfessorChatData,
  type ProfessorConversationFilter,
} from '@/lib/professorChatData'
import type { ProfessorConversation, ProfessorMessage } from '@/lib/professor'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mountedRoots = []
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  mountedRoots = []
})

describe('professor chat SWR data', () => {
  it('builds stable filtered keys and omits false conversation filters from API params', () => {
    expect(professorConversationsSWRKey({ q: ' Sara ', filter: 'unread' })).toEqual([
      '/professor/chat/conversations',
      { q: 'Sara', filter: 'unread' },
    ])
    expect(professorConversationListParams({ q: ' Sara ', filter: 'unread' })).toEqual({
      q: 'Sara',
      unread: true,
    })
    expect(professorConversationListParams({ filter: 'pinned' })).toEqual({ pinned: true })
    expect(professorConversationListParams({ filter: 'all' })).toEqual({})
    expect(professorMessagesSWRKey(81)).toEqual(['/professor/chat/conversations/messages', 81])
    expect(professorMessagesSWRKey(null)).toBeNull()
  })

  it('loads conversations and active messages through independent SWR resources', async () => {
    mocks.apiGet.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/professor/chat/conversations') {
        expect(config?.params).toEqual({})
        return { data: [conversationFixture(81, 'Sara Benali'), conversationFixture(82, 'Youssef El Idrissi')] }
      }
      if (url === '/professor/chat/conversations/81/messages') {
        return { data: [messageFixture(701, 81, 'Can you review my final proof step?')] }
      }
      if (url === '/professor/chat/conversations/82/messages') {
        return { data: [messageFixture(702, 82, 'Second thread question')] }
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderChatHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('conversations: Sara Benali, Youssef El Idrissi')
      expect(container.textContent).toContain('messages: Can you review my final proof step?')
      expect(container.textContent).toContain('messages loading: no')
    })

    await act(async () => {
      getButton(container, 'Go conversation 82').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('messages: Second thread question')
    })
  })

  it('does not expose previous conversation messages while the next conversation is still loading', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/chat/conversations') {
        return { data: [conversationFixture(81, 'Sara Benali'), conversationFixture(82, 'Youssef El Idrissi')] }
      }
      if (url === '/professor/chat/conversations/81/messages') {
        return { data: [messageFixture(701, 81, 'First thread answer')] }
      }
      if (url === '/professor/chat/conversations/82/messages') {
        return new Promise(() => undefined)
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderChatHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('messages: First thread answer')
    })

    await act(async () => {
      getButton(container, 'Go conversation 82').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('active: 82')
      expect(container.textContent).toContain('messages: none')
      expect(container.textContent).toContain('messages loading: yes')
    })
    expect(container.textContent).not.toContain('First thread answer')
  })

  it('keeps cached messages visible when active thread revalidation fails', async () => {
    let failMessages = false
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/chat/conversations') {
        return { data: [conversationFixture(81, 'Sara Benali')] }
      }
      if (url === '/professor/chat/conversations/81/messages') {
        if (failMessages) throw { response: { status: 503, data: { detail: 'Message service unavailable' } } }
        return { data: [messageFixture(701, 81, 'Cached professor reply')] }
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderChatHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('messages: Cached professor reply')
      expect(container.textContent).toContain('messages error: no')
    })

    failMessages = true
    await act(async () => {
      getButton(container, 'Refresh messages').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('messages: Cached professor reply')
      expect(container.textContent).toContain('messages error: yes')
    })
  })

  it('keeps student chat fallback polling bounded and thread derivation memoized', () => {
    const source = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    expect(source).toContain('fallback: { intervalMs: 5000, poll: refreshChat }')
    expect(source).toContain('const threadOptions = useMemo(() => status ? teacherThreads(status) : [], [status])')
    expect(source).not.toContain('fallback: { intervalMs: 2500')
    expect(source).not.toContain('{teacherThreads(status).map')
  })
})

function ChatHarness() {
  const [activeId, setActiveId] = useState<number | null>(81)
  const [filter, setFilter] = useState<ProfessorConversationFilter>('all')
  const [q, setQ] = useState('')
  const {
    conversations,
    conversationsError,
    conversationsLoading,
    messages,
    messagesError,
    messagesLoading,
    mutateMessages,
  } = useProfessorChatData({ q, filter }, activeId)

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `active: ${activeId ?? 'none'}`),
    React.createElement('p', null, `conversations: ${conversations.map((conversation) => conversation.student.full_name).join(', ') || 'none'}`),
    React.createElement('p', null, `conversations loading: ${conversationsLoading ? 'yes' : 'no'}`),
    React.createElement('p', null, `conversations error: ${conversationsError ? 'yes' : 'no'}`),
    React.createElement('p', null, `messages: ${messages.map((message) => message.body).join(', ') || 'none'}`),
    React.createElement('p', null, `messages loading: ${messagesLoading ? 'yes' : 'no'}`),
    React.createElement('p', null, `messages error: ${messagesError ? 'yes' : 'no'}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setActiveId(82),
      },
      'Go conversation 82',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setFilter('pinned'),
      },
      'Pinned filter',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setQ('Sara'),
      },
      'Search Sara',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          void mutateMessages().catch(() => undefined)
        },
      },
      'Refresh messages',
    ),
  )
}

function renderChatHarness() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(
      SWRConfig,
      {
        value: {
          ...apiSWRConfig,
          provider: () => new Map(),
          dedupingInterval: 0,
          errorRetryCount: 0,
        },
      },
      React.createElement(ChatHarness),
    ))
  })

  return { container, root }
}

function conversationFixture(id: number, studentName: string): ProfessorConversation {
  return {
    id,
    course_offering_id: 11,
    offering_title: 'Mathematics - 2BAC Sciences Math B',
    subject_title: 'Mathematics',
    niveau: '2BAC',
    filiere: 'Sciences Math B',
    professor: {
      id: 7,
      full_name: 'Kresco Professor',
      avatar_url: '',
      tier: 'professor',
    },
    student: {
      id: 100 + id,
      full_name: studentName,
      avatar_url: '',
      tier: 'vip',
    },
    status: 'active',
    last_message_preview: 'Can you review my final proof step?',
    unread_for_professor: id === 81 ? 1 : 0,
    unread_for_student: 0,
    is_pinned_by_professor: id === 81,
    created_at: '2026-05-27T00:00:00Z',
    updated_at: '2026-05-27T00:00:00Z',
    last_message_at: '2026-05-27T00:00:00Z',
  }
}

function messageFixture(id: number, conversationId: number, body: string): ProfessorMessage {
  return {
    id,
    conversation_id: conversationId,
    sender_user_id: 7,
    sender_role: 'professor',
    body,
    attachment_url: '',
    attachment_mime_type: '',
    attachment_name: '',
    attachment_size: 0,
    status: 'sent',
    created_at: '2026-05-27T00:00:00Z',
  }
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  return button
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
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
  }
  throw lastError
}
