// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig, type State } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LivePage from '@/app/(dashboard)/live/page'
import { apiSWRConfig } from '@/lib/apiData'
import type { LiveSessionEmbed, StudentLiveSession } from '@/lib/professor'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useNotificationChannelsSubscription: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

vi.mock('@/hooks/useNotificationChannelsSubscription', () => ({
  useNotificationChannelsSubscription: mocks.useNotificationChannelsSubscription,
}))

vi.mock('@/lib/store', () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) => selector({ user: { id: 7 } }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoots = []
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

describe('student live sessions page', () => {
  it('keeps realtime fallback polling and wraps long descriptions', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/(dashboard)/live/page.tsx'), 'utf8')
    const hookSource = readFileSync(resolve(process.cwd(), 'hooks/useNotificationChannelsSubscription.ts'), 'utf8')

    expect(source).toContain('useNotificationChannelsSubscription({')
    expect(source).toContain('fallbackPoll: pollSessions')
    expect(source).not.toContain('listKrescoRealtimeSubscriptions')
    expect(hookSource).toContain('fallbackIntervalMs = 5000')
    expect(source).toContain('max-w-[520px] break-words')
  })

  it('preloads joinable room data on link intent before navigation', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/student-live-sessions') return { data: [studentSessionFixture(71, 'Live algebra')] }
      if (url === '/professor/student-live-sessions/71/embed') return { data: embedFixture(71, 'Live algebra') }
      if (url === '/professor/student-live-sessions/71/interactions') return { data: [] }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderLivePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Live algebra')
    })
    mocks.apiGet.mockClear()

    const joinLink = getLink(container, '/live/71', 'Join')
    act(() => {
      joinLink.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/professor/student-live-sessions/71/embed')
      expect(mocks.apiGet).toHaveBeenCalledWith('/professor/student-live-sessions/71/interactions', { params: undefined })
    })

    mocks.apiGet.mockClear()
    act(() => {
      joinLink.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mocks.apiGet).not.toHaveBeenCalled()
  })
})

function renderLivePage(cache = new Map<string, State<unknown>>()) {
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
          provider: () => cache,
          dedupingInterval: 0,
          errorRetryCount: 0,
        },
      },
      React.createElement(LivePage),
    ))
  })

  return { container, root }
}

function getLink(container: HTMLElement, href: string, text: string) {
  const link = Array.from(container.querySelectorAll(`a[href="${href}"]`))
    .find((item) => item.textContent?.includes(text))
  if (!link) throw new Error(`link not found: ${href}`)
  return link
}

function studentSessionFixture(id: number, title: string): StudentLiveSession {
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
    offering_title: 'Mathematics - 2BAC Sciences Math B',
    subject_title: 'Mathematics',
    niveau: '2BAC',
    filiere: 'Sciences Math B',
    teacher_name: 'Kresco Professor',
    viewer_url: `/live/${id}`,
    can_join: true,
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
