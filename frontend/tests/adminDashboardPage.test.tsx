// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminDashboard from '@/app/admin/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

vi.mock('recharts', async () => {
  const react = await import('react')
  const Chart = () => react.createElement('div')
  const Leaf = () => react.createElement('div')
  return {
    Area: Leaf,
    AreaChart: Chart,
    Bar: Leaf,
    BarChart: Chart,
    CartesianGrid: Leaf,
    ResponsiveContainer: Chart,
    Tooltip: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
  }
})

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockResolvedValue(founderDashboardFixture)
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
  it('renders founder operations dashboard panels', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Business dashboard')
      expect(container.textContent).toContain('Student growth')
      expect(container.textContent).toContain('Student status')
      expect(container.textContent).toContain('Finance')
      expect(container.textContent).toContain('Staff codes')
      expect(container.textContent).toContain('Engagement')
      expect(container.textContent).toContain('Private messages')
      expect(container.textContent).toContain('Paid revenue')
      expect(container.textContent).toContain('Revenue by rail')
      expect(container.textContent).toContain('Expenses by category')
      expect(container.textContent).toContain('9,900 MAD')
      expect(container.textContent).toContain('1,980 MAD')
      expect(container.textContent).toContain('Conversations')
      expect(container.textContent).toContain('Messages month')
    })

    expect(mocks.getJson.mock.calls[0]?.[0]).toMatch(/^\/admin\/founder-dashboard\?month=\d{4}-\d{2}$/)
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

const founderDashboardFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  month: '2026-06',
  metrics: [
    { key: 'students', label: 'Students', value: 12, previous_value: 10, unit: 'count' },
    { key: 'new_students', label: 'New students', value: 6, previous_value: 4, unit: 'count' },
    { key: 'mrr', label: 'MRR', value: 990000, previous_value: 850000, unit: 'centimes' },
    { key: 'profit', label: 'Profit', value: 940000, previous_value: 790000, unit: 'centimes' },
  ],
  growth_by_day: [
    { date: '2026-06-01', new_students: 2 },
    { date: '2026-06-02', new_students: 4 },
  ],
  students_by_status: { paid: 3, trial: 2, registered: 7 },
  students_by_tier: { pro: 3, free: 9 },
  students_by_track: { '2bac': 12 },
  finance: {
    paid_revenue_centimes: 990000,
    staff_collected_revenue_centimes: 198000,
    expenses_centimes: 50000,
    arr_centimes: 11880000,
    revenue_by_rail: { cmi: 750000, cashplus: 240000 },
    expenses_by_category: { hosting: 50000 },
  },
  engagement: {
    active_students_7d: 6,
    approx_video_watch_minutes: 120,
    live_joined_students_month: 14,
    ai_quota_units_month: 42,
  },
  messages: {
    private_conversations: 4,
    private_messages_month: 9,
    unread_for_professors: 4,
    professors_with_chats: 2,
  },
  staff_codes: {
    generated_month: 20,
    redeemed_month: 8,
    unused_total: 12,
    redeemed_staff_revenue_centimes: 198000,
  },
  expenses: [],
}
