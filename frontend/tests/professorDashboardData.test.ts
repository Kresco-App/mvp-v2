// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProfessorDashboardPage from '@/app/professor/page'
import { apiSWRConfig } from '@/lib/apiData'
import { useAuthStore } from '@/lib/store'
import type { ProfessorDashboard } from '@/lib/professor'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/professor',
  useRouter: () => ({
    push: mocks.routerPush,
  }),
}))

vi.mock('@/components/professor/ProfessorShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(
    'div',
    { 'data-testid': 'professor-shell' },
    children,
  ),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mountedRoots = []
  document.body.innerHTML = ''
  useAuthStore.setState({
    user: {
      id: 7,
      email: 'professor@kresco.local',
      full_name: 'Kresco Professor',
      role: 'professor',
      is_staff: false,
    },
    token: 'cookie-session',
    isHydrated: true,
  })
  mocks.apiGet.mockResolvedValue({ data: dashboardFixture() })
  mocks.apiPost.mockResolvedValue({ data: { ok: true } })
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

describe('Professor dashboard SWR behavior', () => {
  it('loads dashboard data through the shared SWR cache', async () => {
    const { container } = renderProfessorDashboard()

    await waitFor(() => {
      expect(container.textContent).toContain('Professor Dashboard')
      expect(container.textContent).toContain('Mathematics - 2BAC Sciences Math B')
      expect(container.textContent).toContain('Live correction: limits national exam')
      expect(container.textContent).toContain('VIP private conversations are student-initiated only.')
      expect(container.textContent).toContain('Unread')
      expect(container.textContent).toContain('Pinned')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/professor/dashboard')
  })

  it('keeps cached dashboard visible and revalidates after notifying students', async () => {
    let currentDashboard = dashboardFixture()
    mocks.apiGet.mockImplementation(async () => ({ data: currentDashboard }))
    mocks.apiPost.mockImplementation(async (url: string) => {
      expect(url).toBe('/professor/live-sessions/44/notify')
      currentDashboard = {
        ...currentDashboard,
        upcoming_live_sessions: [
          { ...currentDashboard.upcoming_live_sessions[0], notification_status: 'sent' },
        ],
      }
      return { data: currentDashboard.upcoming_live_sessions[0] }
    })

    const { container } = renderProfessorDashboard()

    await waitFor(() => {
      expect(container.textContent).toContain('Live correction: limits national exam')
    })
    await act(async () => {
      getButton(container, 'Notify students').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    })
    expect(mocks.apiPost).toHaveBeenCalledWith('/professor/live-sessions/44/notify')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Live notification marked as sent.')
  })

  it('renders a retryable dashboard error instead of a blank page', async () => {
    mocks.apiGet.mockRejectedValue({ response: { status: 500, data: { detail: 'Controlled dashboard failure' } } })

    const { container } = renderProfessorDashboard()

    await waitFor(() => {
      expect(container.textContent).toContain('This professor dashboard could not be loaded.')
      expect(container.textContent).toContain('Controlled dashboard failure')
      expect(container.textContent).toContain('Open live sessions')
    })
    expect(mocks.toastError).toHaveBeenCalledWith('Controlled dashboard failure')
  })
})

function renderProfessorDashboard(cache = new Map()) {
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
      React.createElement(ProfessorDashboardPage),
    ))
  })

  return { container, root }
}

function dashboardFixture(): ProfessorDashboard {
  return {
    offerings: [],
    active_offering: {
      id: 11,
      subject_id: 2,
      subject_title: 'Mathematics',
      title: 'Mathematics - 2BAC Sciences Math B',
      status: 'active',
      professor_user_id: 7,
      track: {
        id: 3,
        niveau: '2BAC',
        filiere: 'Sciences Math B',
        title: '2BAC Sciences Math B',
        status: 'active',
      },
    },
    upcoming_live_sessions: [
      {
        id: 44,
        course_offering_id: 11,
        title: 'Live correction: limits national exam',
        description: 'Review session',
        starts_at: '2026-05-28T14:00:00Z',
        ends_at: '2026-05-28T15:00:00Z',
        status: 'scheduled',
        join_url: 'https://live.kresco.local/44',
        vdocipher_live_id: 'live-44',
        notification_status: 'pending',
        created_at: '2026-05-27T00:00:00Z',
        has_stream_credentials: false,
      },
    ],
    pending_change_requests: [
      {
        id: 1,
        course_offering_id: 11,
        offering_title: 'Maths',
        summary: 'Réorganisation',
        status: 'pending',
        operation_count: 3,
        pending_count: 3,
        applied_count: 0,
        rejected_count: 0,
        admin_note: '',
        created_at: '2026-05-27T00:00:00Z',
      },
    ],
    chat_unread_count: 2,
    chat_pinned_count: 1,
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
