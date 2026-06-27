// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminStatisticsPage from '@/app/admin/statistics/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

vi.mock('@/lib/apiConfig', () => ({
  getBackendUrl: (path: string) => `https://api.example.test${path}`,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockResolvedValue(overviewFixture)
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

describe('AdminStatisticsPage', () => {
  it('renders overview statistics and filters the data editor catalog', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Analytics')
      expect(container.textContent).toContain('Content health')
      expect(container.textContent).toContain('Learning signal')
      expect(container.textContent).toContain('Operations queue')
      expect(container.textContent).toContain('Student activity')
      expect(container.textContent).toContain('Finance')
      expect(container.textContent).toContain('Private messages')
      expect(container.textContent).toContain('Messages')
      expect(container.textContent).toContain('Payments')
      expect(container.textContent).toContain('Published')
      expect(container.textContent).toContain('Draft')
      expect(container.textContent).toContain('19,800 MAD')
      expect(container.textContent).toContain('Manual review')
      expect(container.textContent).toContain('Live Q&A')
      expect(container.textContent).toContain('Calendar')
      expect(container.textContent).toContain('Data editor')
      expect(container.textContent).toContain('Topic Items')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/overview')
    })

    const topicLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find((link) => link.textContent?.includes('Topic Items'))
    expect(topicLink?.href).toBe('https://api.example.test/admin/topic-item/list')

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search admin models"]')
    if (!input) throw new Error('Expected catalog search input')
    setInputValue(input, 'topic item')

    await waitFor(() => {
      expect(container.textContent).toContain('TopicItem')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<AdminStatisticsPage />)
  })
  mountedRoot = { root, container }
  return { container }
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

const overviewFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  totals: {
    users: 12,
    pro_users: 3,
    topics: 8,
    topic_items: 24,
    resources: 6,
    tab_contents: 18,
    quiz_attempts: 14,
    question_attempts: 40,
    exam_problems: 9,
    exams: 2,
    notes: 5,
    saved_items: 6,
    comments: 7,
    notifications: 9,
    admin_audit_logs: 11,
  },
  content_status: {
    subjects: { published: 2 },
    topics: { published: 8 },
    topic_items: { published: 20, draft: 4 },
    resources: { published: 5, draft: 1 },
    calendar_events: { scheduled: 3, live: 1 },
    exams: { published: 2 },
    exam_problems: { published: 8, draft: 1 },
  },
  access_billing: {
    users_by_role: { student: 10, professor: 1, admin: 1 },
    entitlements_by_status: { active: 6, expired: 2 },
    gated_content: 4,
  },
  ops_readiness: {
    gated_content_total: 4,
  },
  progress_xp: {
    total_xp: 3450,
    topic_item_progress_by_status: { completed: 5, in_progress: 3 },
  },
  exam_bank: {
    problems_by_difficulty: { easy: 4, medium: 3, hard: 2 },
  },
  calendar: {
    upcoming_events: 3,
    live_events: 1,
    events_by_status: { scheduled: 3, live: 1 },
  },
  engagement: {
    active_users_7d: 6,
    quiz_attempt_pass_rate: 75,
    average_quiz_attempt_score: 82,
    total_watch_minutes: 120,
  },
  interactions: {},
  notifications: {
    unread: 4,
    created_7d: 7,
    by_type: { report_update: 3, payment: 2 },
  },
  finance: {
    paid_revenue_centimes: 1980000,
    pending_manual_review: 2,
    pending_provider: 1,
    failed_or_mismatch: 1,
    transactions_by_status: { paid: 8, pending_manual_review: 2, failed: 1 },
    provider_events_by_status: { processed: 7, failed: 1 },
  },
  communications: {
    chat_unread_for_professors: 4,
    pending_live_interactions: 2,
    open_reports: 3,
    chat_messages_7d: 9,
    chat_conversations_by_status: { open: 4, resolved: 2 },
    live_interactions_by_status: { pending: 2, answered: 5 },
    reports_by_status: { open: 3, resolved: 8 },
  },
  admin_audit: {
    total: 11,
    created_7d: 3,
    by_action: { report_update: 2, payment_approve: 1 },
    by_model: { ContentReport: 2, PaymentTransaction: 1 },
  },
  crud_catalog: [
    {
      domain: 'knowledge-base',
      slug: 'subject',
      name: 'Subject',
      name_plural: 'Subjects',
      model: 'Subject',
      admin_url: '/admin/subject/list',
      actions: { create: true, read: true, update: true, delete: true },
    },
    {
      domain: 'knowledge-base',
      slug: 'topic-item',
      name: 'Topic Item',
      name_plural: 'Topic Items',
      model: 'TopicItem',
      admin_url: '/admin/topic-item/list',
      actions: { create: true, read: true, update: true, delete: true },
    },
    {
      domain: 'users-access',
      slug: 'user',
      name: 'User',
      name_plural: 'Users',
      model: 'User',
      admin_url: '/admin/user/list',
      actions: { create: true, read: true, update: true, delete: true },
    },
  ],
}
