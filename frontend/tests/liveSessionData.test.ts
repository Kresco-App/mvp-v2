// @vitest-environment jsdom

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiSWRConfig } from '@/lib/apiData'
import {
  positiveSessionId,
  professorLiveEmbedSWRKey,
  professorLiveInteractionsSWRKey,
  studentLiveEmbedSWRKey,
  useProfessorLiveControlData,
  useStudentLiveRoomData,
} from '@/lib/liveSessionData'
import type {
  LiveSessionEmbed,
  LiveSessionInteraction,
  ProfessorLiveSession,
  StudentLiveSession,
} from '@/lib/professor'

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

describe('live session SWR data', () => {
  it('builds route keys defensively and gates student embeds by joinability', () => {
    expect(positiveSessionId('61')).toBe(61)
    expect(positiveSessionId('not-a-session')).toBeNull()
    expect(professorLiveEmbedSWRKey(61)).toEqual(['/professor/live-sessions/embed', 61])
    expect(professorLiveInteractionsSWRKey(61)).toEqual(['/professor/live-sessions/interactions', 61])
    expect(studentLiveEmbedSWRKey(61, true)).toEqual(['/professor/student-live-sessions/embed', 61])
    expect(studentLiveEmbedSWRKey(61, false)).toBeNull()
  })

  it('keeps professor control room embed and interactions scoped to the active route session', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/live-sessions') {
        return { data: [professorSessionFixture(61, 'First live'), professorSessionFixture(62, 'Second live')] }
      }
      if (url === '/professor/live-sessions/61/embed') {
        return { data: embedFixture(61, 'First live') }
      }
      if (url === '/professor/live-sessions/61/interactions') {
        return { data: [interactionFixture(601, 61, 'First session question')] }
      }
      if (url === '/professor/live-sessions/62/embed') {
        return new Promise(() => undefined)
      }
      if (url === '/professor/live-sessions/62/interactions') {
        return new Promise(() => undefined)
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderHarness(React.createElement(ProfessorControlHarness))

    await waitFor(() => {
      expect(container.textContent).toContain('session: First live')
      expect(container.textContent).toContain('embed: https://player.kresco.local/61')
      expect(container.textContent).toContain('interactions: First session question')
    })

    await act(async () => {
      getButton(container, 'Go session 62').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('session: Second live')
      expect(container.textContent).toContain('embed: none')
      expect(container.textContent).toContain('interactions: none')
      expect(container.textContent).toContain('loading: yes')
    })
    expect(container.textContent).not.toContain('First session question')
    expect(container.textContent).not.toContain('https://player.kresco.local/61')
  })

  it('does not fetch a student embed until the selected session is joinable', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/student-live-sessions') {
        return { data: [studentSessionFixture(71, 'Locked live', false)] }
      }
      if (url === '/professor/student-live-sessions/71/interactions') {
        return { data: [] }
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderHarness(React.createElement(StudentRoomHarness))

    await waitFor(() => {
      expect(container.textContent).toContain('session: Locked live')
      expect(container.textContent).toContain('embed: none')
      expect(container.textContent).toContain('embed loading: no')
    })
    expect(mocks.apiGet).not.toHaveBeenCalledWith('/professor/student-live-sessions/71/embed')
  })
})

function ProfessorControlHarness() {
  const [sessionId, setSessionId] = useState('61')
  const { session, embed, interactions, loading } = useProfessorLiveControlData(sessionId)

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `session: ${session?.title ?? 'none'}`),
    React.createElement('p', null, `embed: ${embed?.embed_url ?? 'none'}`),
    React.createElement('p', null, `interactions: ${interactions.map((item) => item.body).join(', ') || 'none'}`),
    React.createElement('p', null, `loading: ${loading ? 'yes' : 'no'}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setSessionId('62'),
      },
      'Go session 62',
    ),
  )
}

function StudentRoomHarness() {
  const { session, embed, embedLoading } = useStudentLiveRoomData('71')

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `session: ${session?.title ?? 'none'}`),
    React.createElement('p', null, `embed: ${embed?.embed_url ?? 'none'}`),
    React.createElement('p', null, `embed loading: ${embedLoading ? 'yes' : 'no'}`),
  )
}

function renderHarness(child: React.ReactElement) {
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
      child,
    ))
  })

  return { container, root }
}

function professorSessionFixture(id: number, title: string): ProfessorLiveSession {
  return {
    id,
    course_offering_id: 11,
    title,
    description: '',
    starts_at: '2026-05-27T14:00:00Z',
    ends_at: '2026-05-27T15:00:00Z',
    status: 'live',
    join_url: '',
    vdocipher_live_id: `live-${id}`,
    notification_status: 'sent',
    created_at: '2026-05-27T00:00:00Z',
    has_stream_credentials: false,
  }
}

function studentSessionFixture(id: number, title: string, canJoin: boolean): StudentLiveSession {
  return {
    ...professorSessionFixture(id, title),
    offering_title: 'Mathematics - 2BAC Sciences Math B',
    subject_title: 'Mathematics',
    niveau: '2BAC',
    filiere: 'Sciences Math B',
    teacher_name: 'Kresco Professor',
    viewer_url: `/live/${id}`,
    can_join: canJoin,
    provider: 'vdocipher',
  }
}

function embedFixture(id: number, title: string): LiveSessionEmbed {
  return {
    id,
    title,
    status: 'live',
    provider: 'vdocipher',
    embed_url: `https://player.kresco.local/${id}`,
    chat_embed_url: '',
    vdocipher_live_id: `live-${id}`,
  }
}

function interactionFixture(id: number, sessionId: number, body: string): LiveSessionInteraction {
  return {
    id,
    live_session_id: sessionId,
    course_offering_id: 11,
    professor_user_id: 7,
    student_user_id: 5,
    student_name: 'Sara Benali',
    kind: 'question',
    body,
    status: 'pending',
    answer: '',
    answered_by_user_id: null,
    answered_at: null,
    deleted_at: null,
    created_at: '2026-05-27T00:00:00Z',
    updated_at: '2026-05-27T00:00:00Z',
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
