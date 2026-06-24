import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EMPTY_FOUNDER_DASHBOARD,
  EMPTY_STAFF_PAYMENT_DASHBOARD,
  founderDashboardPath,
  formatMoneyCentimes,
  formatNumber,
  getFounderDashboard,
  getRedemptionTemplates,
  getStaffPaymentDashboard,
  getStaffPaymentRequests,
  numberValue,
  recordEntries,
} from '@/lib/founderOps'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('founder operations utilities', () => {
  it('builds founder and staff API paths with bounded query formatting', async () => {
    mocks.getJson.mockResolvedValue({})

    expect(founderDashboardPath()).toBe('/admin/founder-dashboard')
    expect(founderDashboardPath('2026-06')).toBe('/admin/founder-dashboard?month=2026-06')
    expect(founderDashboardPath('2026/06 + VIP')).toBe('/admin/founder-dashboard?month=2026%2F06%20%2B%20VIP')

    await getFounderDashboard('2026/06 + VIP')
    await getRedemptionTemplates(true)
    await getStaffPaymentRequests(17)
    await getStaffPaymentDashboard(12)

    expect(mocks.getJson).toHaveBeenNthCalledWith(1, '/admin/founder-dashboard?month=2026%2F06%20%2B%20VIP')
    expect(mocks.getJson).toHaveBeenNthCalledWith(2, '/admin/redemption-templates?include_archived=true')
    expect(mocks.getJson).toHaveBeenNthCalledWith(3, '/admin/staff-payment-requests?limit=17')
    expect(mocks.getJson).toHaveBeenNthCalledWith(4, '/staff/payments/dashboard?limit=12')
  })

  it('keeps empty dashboard fallbacks structurally aligned with backend contracts', () => {
    expect(EMPTY_FOUNDER_DASHBOARD).toMatchObject({
      generated_at: '',
      month: '',
      metrics: [],
      growth_by_day: [],
      students_by_status: {},
      students_by_tier: {},
      students_by_track: {},
      expenses: [],
    })
    expect(EMPTY_STAFF_PAYMENT_DASHBOARD.profile).toEqual({
      user_id: 0,
      display_name: '',
      status: 'active',
      monthly_code_limit: 0,
      monthly_amount_limit_centimes: 0,
      allowed_template_ids: [],
      used_codes_this_month: 0,
      remaining_codes_this_month: 0,
      used_amount_this_month_centimes: 0,
      remaining_amount_this_month_centimes: null,
    })
    expect(EMPTY_STAFF_PAYMENT_DASHBOARD.templates).toEqual([])
    expect(EMPTY_STAFF_PAYMENT_DASHBOARD.requests).toEqual([])
  })

  it('formats founder operation metrics defensively without coercing strings', () => {
    expect(numberValue(42)).toBe(42)
    expect(numberValue(Number.POSITIVE_INFINITY)).toBe(0)
    expect(numberValue('42')).toBe(0)
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber('1234567')).toBe('0')
    expect(formatMoneyCentimes(123456)).toBe('1,235 MAD')
    expect(formatMoneyCentimes(null)).toBe('0 MAD')
  })

  it('normalizes record entries for compact ranked founder charts', () => {
    expect(recordEntries({ vip: 4, pro: 2, basic: 0, ignored: '9' })).toEqual([
      { key: 'vip', value: 4 },
      { key: 'pro', value: 2 },
    ])
    expect(recordEntries({ a: 1, b: 4, c: 3 }, 2)).toEqual([
      { key: 'b', value: 4 },
      { key: 'c', value: 3 },
    ])
  })
})
