// @vitest-environment jsdom

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiSWRConfig } from '@/lib/apiData'
import {
  parseStudentProfessorChatUrlState,
  studentProfessorMessagesSWRKey,
  studentProfessorChatUrlStatesEqual,
  studentProfessorChatUrlStateToSearchParams,
  useStudentProfessorChatData,
} from '@/lib/studentProfessorChatData'
import type { ProfessorConversation, ProfessorMessage, StudentProfessorChatStatus } from '@/lib/professor'

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

describe('student professor chat SWR data', () => {
  it('builds message keys defensively', () => {
    expect(studentProfessorMessagesSWRKey(81)).toEqual(['/professor/student-chat/conversations/messages', 81])
    expect(studentProfessorMessagesSWRKey(null)).toBeNull()
  })

  it('parses and serializes student professor chat URL state', () => {
    expect(parseStudentProfessorChatUrlState(new URLSearchParams('conversation=81&offering=11'))).toEqual({
      conversationId: 81,
      offeringId: 11,
    })
    expect(parseStudentProfessorChatUrlState(new URLSearchParams('thread=abc&offeringId=-1'))).toEqual({
      conversationId: null,
      offeringId: null,
    })

    const params = studentProfessorChatUrlStateToSearchParams(
      { conversationId: 82, offeringId: 12 },
      new URLSearchParams('tab=chat&conversationId=81&thread=80&offeringId=11'),
    )

    expect(params.toString()).toBe('tab=chat&conversation=82&offering=12')
    expect(studentProfessorChatUrlStateToSearchParams({ conversationId: null, offeringId: null }).toString()).toBe('')
    expect(studentProfessorChatUrlStatesEqual(
      { conversationId: 82, offeringId: 12 },
      { conversationId: 82, offeringId: 12 },
    )).toBe(true)
  })

  it('loads eligibility status and active messages through separate resources', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/student-chat') return { data: chatStatusFixture() }
      if (url === '/professor/student-chat/conversations/81/messages') {
        return { data: [messageFixture(1, 81, 'Student question')] }
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('eligible: yes')
      expect(container.textContent).toContain('conversation count: 2')
      expect(container.textContent).toContain('messages: Student question')
    })
  })

  it('does not expose previous conversation messages while another conversation is loading', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/student-chat') return { data: chatStatusFixture() }
      if (url === '/professor/student-chat/conversations/81/messages') {
        return { data: [messageFixture(1, 81, 'First professor answer')] }
      }
      if (url === '/professor/student-chat/conversations/82/messages') {
        return new Promise(() => undefined)
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('messages: First professor answer')
    })

    await act(async () => {
      getButton(container, 'Go conversation 82').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('active: 82')
      expect(container.textContent).toContain('messages: none')
      expect(container.textContent).toContain('messages loading: yes')
    })
    expect(container.textContent).not.toContain('First professor answer')
  })
})

function StudentChatHarness() {
  const [activeId, setActiveId] = useState<number | null>(81)
  const { status, messages, messagesLoading } = useStudentProfessorChatData(activeId)

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `active: ${activeId ?? 'none'}`),
    React.createElement('p', null, `eligible: ${status?.eligible ? 'yes' : 'no'}`),
    React.createElement('p', null, `conversation count: ${status?.conversations.length ?? 0}`),
    React.createElement('p', null, `messages: ${messages.map((message) => message.body).join(', ') || 'none'}`),
    React.createElement('p', null, `messages loading: ${messagesLoading ? 'yes' : 'no'}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setActiveId(82),
      },
      'Go conversation 82',
    ),
  )
}

function renderHarness() {
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
      React.createElement(StudentChatHarness),
    ))
  })

  return { container, root }
}

function chatStatusFixture(): StudentProfessorChatStatus {
  return {
    eligible: true,
    reason: '',
    offerings: [],
    conversations: [
      conversationFixture(81, 'Kresco Professor'),
      conversationFixture(82, 'Second Professor'),
    ],
    teacher_threads: [],
  }
}

function conversationFixture(id: number, professorName: string): ProfessorConversation {
  return {
    id,
    course_offering_id: id,
    offering_title: 'Mathematics - 2BAC Sciences Math B',
    subject_title: 'Mathematics',
    niveau: '2BAC',
    filiere: 'Sciences Math B',
    professor: {
      id: 7 + id,
      full_name: professorName,
      avatar_url: '',
      tier: 'professor',
    },
    student: {
      id: 5,
      full_name: 'Sara Benali',
      avatar_url: '',
      tier: 'vip',
    },
    status: 'active',
    last_message_preview: 'Student question',
    unread_for_professor: 0,
    unread_for_student: 0,
    is_pinned_by_professor: false,
    created_at: '2026-05-27T00:00:00Z',
    updated_at: '2026-05-27T00:00:00Z',
    last_message_at: '2026-05-27T00:00:00Z',
  }
}

function messageFixture(id: number, conversationId: number, body: string): ProfessorMessage {
  return {
    id,
    conversation_id: conversationId,
    sender_user_id: 5,
    sender_role: 'student',
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
