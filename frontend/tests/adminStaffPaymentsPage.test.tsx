// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminStaffPaymentsPage from '@/app/admin/staff-payments/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
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
    if (path === '/admin/redemption-templates?include_archived=true') return [templateFixture]
    if (path === '/admin/staff-payment-profiles?limit=200') return [profileFixture]
    if (path === '/admin/staff-payment-requests?limit=200') return [staffRequestFixture]
    throw new Error(`Unexpected GET ${path}`)
  })
  mocks.postJson.mockImplementation(async (path: string, input: Record<string, unknown>) => {
    if (path === '/admin/redemption-templates') return { ...templateFixture, id: 9, ...input }
    throw new Error(`Unexpected POST ${path}`)
  })
  mocks.putJson.mockImplementation(async (path: string, input: Record<string, unknown>) => {
    if (path === '/admin/staff-payment-profiles/31') return { ...profileFixture, ...input, user_id: 31 }
    throw new Error(`Unexpected PUT ${path}`)
  })
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

describe('AdminStaffPaymentsPage', () => {
  it('renders staff-code operations and manages templates and allowances', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Staff payment codes')
      expect(container.textContent).toContain('Generated')
      expect(container.textContent).toContain('Redeemed')
      expect(container.textContent).toContain('Duplicate refs')
      expect(container.textContent).toContain('Staff activity')
      expect(container.textContent).toContain('Counter Staff')
      expect(container.textContent).toContain('Suspicious references')
    })

    await clickButton(container, 'Templates')

    await waitFor(() => {
      expect(container.textContent).toContain('Code template')
      expect(container.textContent).toContain('Templates and packages')
      expect(container.textContent).toContain('Pro monthly')
    })

    await setField(container, 'Template name', 'VIP semester WhatsApp')
    await setField(container, 'Template amount MAD', '499')
    await clickButton(container, 'Create template')

    expect(mocks.postJson).toHaveBeenCalledWith('/admin/redemption-templates', expect.objectContaining({
      name: 'VIP semester WhatsApp',
      amount_centimes: 49900,
      subject_scope: 'all',
    }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Code template created.')

    await clickButton(container, 'Allowances')

    await waitFor(() => {
      expect(container.textContent).toContain('Staff allowances')
      expect(container.textContent).toContain('Allowance management')
    })

    await setField(container, 'Staff user ID', '31')
    await setField(container, 'Monthly code quota', '75')
    await clickCheckbox(container)
    await clickButton(container, 'Save allowance')

    expect(mocks.putJson).toHaveBeenCalledWith('/admin/staff-payment-profiles/31', expect.objectContaining({
      monthly_code_limit: 75,
      allowed_template_ids: [5],
    }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Staff allowance saved.')
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }
  act(() => {
    root.render(<AdminStaffPaymentsPage />)
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

async function clickCheckbox(container: HTMLElement) {
  const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null
  expect(checkbox).toBeTruthy()
  await act(async () => {
    checkbox?.click()
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
    expenses_by_category: {},
    revenue_by_rail: {},
    revenue_by_plan: {},
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
  expenses: [],
}

const templateFixture = {
  id: 5,
  name: 'Pro monthly',
  plan: 'pro',
  tier: 'pro',
  subject_scope: 'all',
  subject_ids: [],
  duration_days: 30,
  amount_centimes: 9900,
  currency: 'MAD',
  status: 'active',
  created_by_user_id: 1,
  metadata: {},
  created_at: '2026-06-19T12:00:00Z',
  updated_at: '2026-06-19T12:00:00Z',
}

const profileFixture = {
  user_id: 31,
  display_name: 'Counter Staff',
  status: 'active',
  monthly_code_limit: 50,
  monthly_amount_limit_centimes: 500000,
  allowed_template_ids: [5],
  used_codes_this_month: 4,
  remaining_codes_this_month: 46,
  used_amount_this_month_centimes: 39600,
  remaining_amount_this_month_centimes: 460400,
}

const staffRequestFixture = {
  id: 42,
  staff_user_id: 31,
  template_id: 5,
  redemption_code_id: 8,
  payment_method: 'cashplus',
  provider_reference: 'CASH-REF-42',
  amount_centimes: 9900,
  currency: 'MAD',
  status: 'redeemed',
  student_name: 'Sara Benali',
  student_phone: '+212600000000',
  student_email: 'sara@example.com',
  proof_url: '',
  notes: '',
  requires_review: false,
  metadata: {},
  created_at: '2026-06-19T12:00:00Z',
  updated_at: '2026-06-19T12:00:00Z',
  code: {
    id: 8,
    code: 'KRESCO-CODE-8',
    template_id: 5,
    generated_by_user_id: 31,
    redeemed_by_user_id: 9,
    plan: 'pro',
    tier: 'pro',
    subject_ids: [],
    duration_days: 30,
    amount_centimes: 9900,
    currency: 'MAD',
    status: 'redeemed',
    expires_at: null,
    redeemed_at: '2026-06-19T12:00:00Z',
    created_at: '2026-06-19T12:00:00Z',
  },
}
