// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminDashboard from '@/app/admin/page'
import { normalizeFounderGrowthRows } from '@/lib/founderOps'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

vi.mock('recharts', async () => {
  const react = await import('react')
  const Chart = ({ children, data, dataKey }: { children?: React.ReactNode; data?: unknown; dataKey?: string }) => react.createElement(
    'div',
    {
      'data-chart': data ? JSON.stringify(data) : undefined,
      'data-chart-key': dataKey,
    },
    children,
  )
  const Leaf = ({
    dataKey,
    domain,
    type,
    variant = 'leaf',
  }: {
    dataKey?: string
    domain?: unknown
    type?: string
    variant?: string
  }) => react.createElement('div', {
    'data-area-type': type,
    'data-domain': domain ? JSON.stringify(domain) : undefined,
    'data-leaf-key': dataKey,
    'data-leaf-variant': variant,
  })
  return {
    Area: Leaf,
    AreaChart: Chart,
    CartesianGrid: Leaf,
    Line: (props: Parameters<typeof Leaf>[0]) => react.createElement(Leaf, { ...props, variant: 'line' }),
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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-27T12:00:00Z'))
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
  vi.useRealTimers()
})

describe('AdminDashboard', () => {
  it('renders founder operations dashboard panels', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Admin dashboard')
      expect(container.textContent).toContain('Month run rate')
      expect(container.textContent).toContain('Net after estimates')
      expect(container.textContent).toContain('27d')
      expect(container.textContent).toContain('Student growth')
      expect(container.textContent).toContain('Daily')
      expect(container.textContent).toContain('Total')
      expect(container.textContent).toContain('6 new')
      expect(container.textContent).toContain('Student status')
      expect(container.textContent).toContain('Active Basic')
      expect(container.textContent).toContain('Pro')
      expect(container.textContent).toContain('VIP')
      expect(container.textContent).toContain('12')
      expect(container.textContent).toContain('Finance')
      expect(container.textContent).toContain('Actions')
      expect(container.textContent).toContain('Finance review')
      expect(container.textContent).toContain('Private message search')
      expect(container.textContent).toContain('Staff code operations')
      expect(container.textContent).toContain('Engagement')
      expect(container.textContent).toContain('Messages')
      expect(container.textContent).toContain('Cash collected')
      expect(container.textContent).toContain('Cash shape')
      expect(container.textContent).toContain('Revenue rails')
      expect(container.textContent).toContain('Cost categories')
      expect(container.textContent).toContain('9,900.00 MAD')
      expect(container.textContent).toContain('11,880.00 MAD')
      expect(container.textContent).toContain('Conversations')
      expect(container.textContent).toContain('Private messages')
      expect(container.textContent).toContain('unread load')
      expect(container.textContent).toContain('Unread profs')
      expect(container.textContent).toContain('Msg / chat')
      expect(container.textContent).not.toContain('Professors')
    })

    expect(container.querySelector('[aria-label="Student status pie chart"]')).toBeTruthy()
    expect(mocks.getJson.mock.calls[0]?.[0]).toMatch(/^\/admin\/founder-dashboard\?month=\d{4}-\d{2}$/)

    clickButton(container, 'Total')

    await waitFor(() => {
      expect(container.textContent).toContain('12 total')
      const totalLine = container.querySelector('[data-leaf-key="total_students"]')
      expect(totalLine).toBeTruthy()
      expect(totalLine?.getAttribute('data-leaf-variant')).toBe('line')
      expect(totalLine?.getAttribute('data-area-type')).toBe('monotone')
      expect(container.querySelector('[data-domain="[7,13]"]')).toBeTruthy()
      const totalChart = Array.from(container.querySelectorAll<HTMLElement>('[data-chart]')).find((element) => (
        element.querySelector('[data-leaf-key="total_students"]')
      ))
      expect(totalChart?.getAttribute('data-chart')).toContain('"total_students":12')
      expect(totalChart?.getAttribute('data-chart')).toContain('"date":"2026-06-27"')
      expect(totalChart?.getAttribute('data-chart')).toContain('"new_students":0')
      expect(totalChart?.getAttribute('data-chart')).not.toContain('2026-06-30')
    })
  })

  it('builds total student growth as a forward cumulative series', () => {
    expect(
      normalizeFounderGrowthRows(
        [
          { date: '2026-06-01', new_students: 2, total_students: 0 },
          { date: '2026-06-02', new_students: 4, total_students: 0 },
        ],
        12,
      ).map((row) => row.total_students),
    ).toEqual([8, 12])

    expect(
      normalizeFounderGrowthRows(
        [
          { date: '2026-06-01', new_students: 2, total_students: 8 },
          { date: '2026-06-02', new_students: 4, total_students: 12 },
        ],
        12,
      ).map((row) => row.total_students),
    ).toEqual([8, 12])

    expect(
      normalizeFounderGrowthRows(
        [
          { date: '2026-06-01', new_students: 6, total_students: 6 },
          { date: '2026-06-02', new_students: 0, total_students: 0 },
          { date: '2026-06-03', new_students: 2, total_students: 8 },
          { date: '2026-06-04', new_students: 0, total_students: 0 },
        ],
        8,
      ).map((row) => row.total_students),
    ).toEqual([6, 6, 8, 8])

    expect(
      normalizeFounderGrowthRows(
        [
          { date: '2026-05-01', new_students: 0, total_students: 0 },
          { date: '2026-05-02', new_students: 0, total_students: 0 },
        ],
        12,
      ).map((row) => row.total_students),
    ).toEqual([0, 0])
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

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label))
  if (!button) throw new Error(`Expected button: ${label}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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
    { date: '2026-06-01', new_students: 2, total_students: 0 },
    { date: '2026-06-02', new_students: 4, total_students: 0 },
    { date: '2026-06-30', new_students: 0, total_students: 12 },
  ],
  students_by_status: { registered: 5, active_basic: 4, pro: 2, vip: 1 },
  students_by_tier: { pro: 3, free: 9 },
  students_by_track: { '2bac': 12 },
  finance: {
    paid_revenue_centimes: 990000,
    previous_paid_revenue_centimes: 850000,
    staff_collected_revenue_centimes: 198000,
    staff_redeemed_revenue_centimes: 198000,
    expenses_centimes: 50000,
    open_refunds_centimes: 12000,
    profit_centimes: 940000,
    mrr_centimes: 990000,
    arr_centimes: 11880000,
    paid_users: 3,
    active_entitlements: 4,
    revenue_by_rail: { cmi: 750000, cashplus: 240000 },
    expenses_by_category: { hosting: 50000 },
    revenue_by_plan: { pro: 990000 },
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
