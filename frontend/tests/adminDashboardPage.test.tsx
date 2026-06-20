// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminDashboard from '@/app/admin/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  listAdminChangeRequests: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

vi.mock('@/lib/apiConfig', () => ({
  getAdminRootUrl: () => 'https://api.example.test/admin',
}))

vi.mock('@/lib/studio', () => ({
  listAdminChangeRequests: mocks.listAdminChangeRequests,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockResolvedValue(adminOverviewFixture)
  mocks.listAdminChangeRequests.mockResolvedValue([
    { id: 1, pending_count: 2, operation_count: 2 },
  ])
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

describe('AdminDashboard', () => {
  it('renders finance, communication, and progress transparency panels', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Paiements manuels')
      expect(container.textContent).toContain('Messages et live')
      expect(container.textContent).toContain('Signalements ouverts')
      expect(container.textContent).toContain('Transactions par statut')
      expect(container.textContent).toContain('Progression par statut')
      expect(container.textContent).toContain('Utilisateurs et accès')
      expect(container.textContent).toContain('Examens et calendrier')
      expect(container.textContent).toContain('Gated content')
      expect(container.textContent).toContain('Difficulté examens')
      expect(container.textContent).toContain('9,900 MAD')
      expect(container.textContent).toContain('1 demande(s)')
      expect(container.textContent).toContain('100% publié')
      expect(container.textContent).not.toContain('10000%')
    })

    expect(mocks.getJson).toHaveBeenCalledWith('/admin/overview')
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminDashboard))
  })

  return { container, root }
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

const adminOverviewFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  totals: {
    users: 12,
    pro_users: 3,
    topics: 8,
    topic_items: 24,
    resources: 6,
    tab_contents: 18,
    quiz_attempts: 14,
    activity_events: 32,
    exam_problems: 9,
    exams: 2,
  },
  content_status: {
    subjects: { published: 2 },
    topics: { published: 8 },
    topic_items: { published: 24 },
  },
  access_billing: {
    users_by_role: { student: 10, professor: 1, admin: 1 },
    entitlements_by_status: { active: 6, expired: 2 },
    gated_content: 4,
  },
  ops_readiness: {},
  progress_xp: {
    total_xp: 3450,
    completed_topic_items: 5,
    completed_lessons: 2,
    topic_item_progress_by_status: { completed: 5, in_progress: 3 },
  },
  exam_bank: {
    problems_by_difficulty: { easy: 4, medium: 3, hard: 2 },
    problems_with_written_solution: 5,
    problems_with_video_solution: 2,
  },
  calendar: {
    upcoming_events: 3,
    events_by_status: { scheduled: 3, live: 1 },
  },
  engagement: {
    active_users_7d: 6,
    quiz_attempt_pass_rate: 75,
    total_watch_minutes: 120,
  },
  interactions: {},
  notifications: {
    unread: 4,
  },
  finance: {
    paid_revenue_centimes: 990000,
    paid_revenue_7d_centimes: 198000,
    pending_manual_review: 2,
    pending_provider: 1,
    failed_or_mismatch: 1,
    provider_events_7d: 7,
    ledger_entries_7d: 3,
    transactions_by_status: { paid: 10, pending_manual_review: 2, failed: 1 },
  },
  communications: {
    chat_unread_for_professors: 4,
    chat_messages_7d: 9,
    pending_live_interactions: 2,
    open_reports: 3,
    urgent_open_reports: 1,
    reports_created_7d: 5,
    live_sessions_live: 1,
    chat_conversations_by_status: { open: 4 },
    reports_by_status: { open: 3, resolved: 8 },
  },
  admin_audit: {
    created_7d: 3,
  },
  crud_catalog: [],
}
