// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminFinancePage from '@/app/admin/finance/page'
import AdminFinanceExpensesPage from '@/app/admin/finance/expenses/page'
import AdminFinanceRevenuePage from '@/app/admin/finance/revenue/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiJsonClient: {
    get: async (path: string) => ({ data: await mocks.getJson(path) }),
    post: async (path: string, body: unknown) => ({ data: await mocks.postJson(path, body) }),
  },
  getJson: mocks.getJson,
  postJson: mocks.postJson,
  putJson: mocks.putJson,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockImplementation(async (path: string) => {
    if (path.startsWith('/admin/founder-dashboard')) return founderDashboardFixture
    if (path === '/payments/manual-payment-requests?status=pending_manual_review&limit=50') return [manualPaymentFixture]
    throw new Error(`Unexpected GET ${path}`)
  })
  mocks.postJson.mockImplementation(async (path: string, input: Record<string, unknown>) => {
    if (path === '/admin/finance/expenses') return { id: 901, ...input, currency: 'MAD', created_at: '2026-06-20T12:00:00Z', updated_at: '2026-06-20T12:00:00Z' }
    if (path === '/payments/manual-payment-requests/99/approve') return { ...manualPaymentFixture, status: 'paid' }
    if (path === '/payments/manual-payment-requests/99/reject') return { ...manualPaymentFixture, status: 'failed' }
    throw new Error(`Unexpected POST ${path}`)
  })
  mocks.putJson.mockResolvedValue({})
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

describe('AdminFinancePage', () => {
  it('renders founder finance metrics, charts, and manual payment review', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Finance')
      expect(container.textContent).toContain('Overview')
      expect(container.textContent).toContain('Payment review')
      expect(container.textContent).toContain('KRESCO-BANK-99')
      expect(container.textContent).toContain('BANK-REF-99')
      expect(container.textContent).toContain('9,900.00 MAD')
      expect(container.textContent).toContain('1,980.00 MAD')
      expect(container.textContent).not.toContain('Staff payments')
      expect(container.textContent).not.toContain('Expense')
      expect(container.textContent).not.toContain('Code template')
      expect(container.textContent).not.toContain('Template #')
      expect(container.textContent).not.toContain('Package')
      expect(container.textContent).not.toContain('Staff allowances')
      expect(container.textContent).not.toContain('Allowed package IDs')
    })

    expect(mocks.getJson).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/founder-dashboard\?month=\d{4}-\d{2}$/))
    expect(mocks.getJson).toHaveBeenCalledWith('/payments/manual-payment-requests?status=pending_manual_review&limit=50')
    expect(mocks.getJson).not.toHaveBeenCalledWith('/admin/staff-payment-requests?limit=100')
    expect(mocks.getJson).not.toHaveBeenCalledWith('/admin/staff-payment-profiles?limit=100')
    expect(mocks.getJson).not.toHaveBeenCalledWith('/admin/redemption-templates?include_archived=false')
  })

  it('approves pending manual payments from the finance workspace', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('KRESCO-BANK-99')
    })

    await clickButton(container, 'Approve')

    expect(mocks.postJson).toHaveBeenCalledWith('/payments/manual-payment-requests/99/approve', {
      reason: 'Confirmed from founder finance workspace.',
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Manual payment KRESCO-BANK-99 approved.')
  })

  it('submits expenses through founder ops APIs', async () => {
    const { container } = renderPage('expenses')

    await waitFor(() => {
      expect(container.textContent).toContain('Expense')
      expect(container.textContent).toContain('Expenses')
      expect(container.textContent).toContain('Vercel')
      expect(container.textContent).not.toContain('Package')
    })

    await setField(container, 'Expense amount in MAD', '123.45')
    await setField(container, 'Expense vendor', 'OpenAI')
    await setField(container, 'Expense description', 'AI tutoring credits')
    await clickButton(container, 'Add expense')

    expect(mocks.postJson).toHaveBeenCalledWith('/admin/finance/expenses', expect.objectContaining({
      amount_centimes: 12345,
      category: 'hosting',
      description: 'AI tutoring credits',
      source: 'manual',
      status: 'paid',
      vendor: 'OpenAI',
    }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Expense added.')
    expect(mocks.postJson).not.toHaveBeenCalledWith('/admin/redemption-templates', expect.anything())
  })

  it('keeps the revenue deep-dive focused on finance data', async () => {
    const { container } = renderPage('revenue')

    await waitFor(() => {
      expect(container.textContent).toContain('Revenue')
      expect(container.textContent).toContain('Revenue mix')
      expect(container.textContent).toContain('Payment review')
      expect(container.textContent).not.toContain('Staff payments')
      expect(container.textContent).not.toContain('Code template')
      expect(container.textContent).not.toContain('Expense')
    })
  })

})

function renderPage(view?: 'overview' | 'expenses' | 'revenue') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }
  const Component = view === 'expenses'
    ? AdminFinanceExpensesPage
    : view === 'revenue'
      ? AdminFinanceRevenuePage
      : AdminFinancePage

  act(() => {
    root.render(React.createElement(Component))
  })

  return { container, root }
}

async function setField(container: HTMLElement, label: string, value: string) {
  const field = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  expect(field, `missing field ${label}`).not.toBeNull()
  const prototype = field instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : field instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  await act(async () => {
    setter?.call(field, value)
    field?.dispatchEvent(new Event('input', { bubbles: true }))
    field?.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  })
}

async function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
  expect(button, `missing button ${text}`).toBeTruthy()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  })
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
        await flushPromises()
      })
    }
  }
  throw lastError
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

const founderDashboardFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  month: '2026-06',
  metrics: [],
  growth_by_day: [],
  students_by_status: {},
  students_by_tier: {},
  students_by_track: {},
  finance: {
    paid_revenue_centimes: 990000,
    previous_paid_revenue_centimes: 850000,
    staff_collected_revenue_centimes: 198000,
    staff_redeemed_revenue_centimes: 198000,
    expenses_centimes: 50000,
    open_refunds_centimes: 0,
    profit_centimes: 940000,
    mrr_centimes: 990000,
    arr_centimes: 11880000,
    paid_users: 12,
    active_entitlements: 12,
    expenses_by_category: { hosting: 50000 },
    revenue_by_rail: { cashplus: 240000, cmi: 750000 },
    revenue_by_plan: { pro: 990000 },
  },
  engagement: {
    active_students_7d: 0,
    video_events_month: 0,
    approx_video_watch_minutes: 0,
    live_sessions_month: 0,
    live_joined_students_month: 0,
    live_questions_month: 0,
    quiz_attempts_month: 0,
    total_xp: 0,
    ai_quota_units_month: 0,
  },
  messages: {
    private_conversations: 0,
    private_messages_month: 0,
    unread_for_professors: 0,
    professors_with_chats: 0,
  },
  staff_codes: {
    generated_month: 20,
    redeemed_month: 8,
    unused_total: 12,
    collected_staff_revenue_centimes: 198000,
    redeemed_staff_revenue_centimes: 198000,
  },
  expenses: [
    {
      id: 501,
      expense_month: '2026-06',
      expense_date: '2026-06-18',
      category: 'hosting',
      vendor: 'Vercel',
      description: 'Frontend hosting',
      amount_centimes: 50000,
      currency: 'MAD',
      source: 'manual',
      status: 'paid',
      created_by_user_id: 1,
      metadata: {},
      created_at: '2026-06-18T12:00:00Z',
      updated_at: '2026-06-18T12:00:00Z',
    },
  ],
}

const manualPaymentFixture = {
  id: 99,
  user_id: 44,
  provider: 'manual',
  payment_method: 'bank_transfer',
  status: 'pending_manual_review',
  plan: 'pro',
  amount_centimes: 9900,
  currency: 'MAD',
  reference_code: 'KRESCO-BANK-99',
  provider_reference: 'BANK-REF-99',
  instructions: {},
  metadata: {},
  created_at: '2026-06-19T10:00:00Z',
  updated_at: '2026-06-19T10:00:00Z',
  expires_at: null,
  confirmed_at: null,
}
