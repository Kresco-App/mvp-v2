import { getJson, postJson } from '@/lib/apiClient'

export type FounderMetric = {
  key: string
  label: string
  value: number
  previous_value: number
  unit: 'count' | 'centimes' | string
}

export type FounderFinanceSummary = {
  paid_revenue_centimes: number
  previous_paid_revenue_centimes: number
  staff_collected_revenue_centimes: number
  staff_redeemed_revenue_centimes: number
  expenses_centimes: number
  open_refunds_centimes: number
  profit_centimes: number
  mrr_centimes: number
  arr_centimes: number
  paid_users: number
  active_entitlements: number
  expenses_by_category: Record<string, number>
  revenue_by_rail: Record<string, number>
  revenue_by_plan: Record<string, number>
}

export type FinanceExpense = {
  id: number
  expense_month: string
  expense_date: string
  category: string
  vendor: string
  description: string
  amount_centimes: number
  currency: string
  source: string
  status: string
  created_by_user_id: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type FinanceExpenseInput = {
  expense_date: string
  expense_month?: string
  category: string
  vendor?: string
  description?: string
  amount_centimes: number
  source?: 'manual' | 'vendor' | 'estimate'
  status?: 'planned' | 'paid' | 'cancelled'
  metadata?: Record<string, unknown>
}

export type RedemptionCodeTemplateInput = {
  name: string
  plan: string
  tier: string
  subject_scope: 'all' | 'selected'
  subject_ids: number[]
  duration_days: number
  amount_centimes: number
  status?: 'active' | 'archived'
  metadata?: Record<string, unknown>
}

export type FounderDashboard = {
  generated_at: string
  month: string
  metrics: FounderMetric[]
  growth_by_day: Array<Record<string, unknown>>
  students_by_status: Record<string, number>
  students_by_tier: Record<string, number>
  students_by_track: Record<string, number>
  finance: FounderFinanceSummary
  engagement: Record<string, unknown>
  messages: Record<string, unknown>
  staff_codes: Record<string, unknown>
  expenses: FinanceExpense[]
}

export type RedemptionCodeTemplate = {
  id: number
  name: string
  plan: string
  tier: string
  subject_scope: string
  subject_ids: number[]
  duration_days: number
  amount_centimes: number
  currency: string
  status: string
  created_by_user_id: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type RedemptionCode = {
  id: number
  code: string
  template_id: number
  generated_by_user_id: number
  redeemed_by_user_id: number | null
  plan: string
  tier: string
  subject_ids: number[]
  duration_days: number
  amount_centimes: number
  currency: string
  status: string
  expires_at: string | null
  redeemed_at: string | null
  created_at: string
}

export type StaffPaymentRequest = {
  id: number
  staff_user_id: number
  template_id: number
  redemption_code_id: number
  payment_method: string
  provider_reference: string
  amount_centimes: number
  currency: string
  status: string
  student_name: string
  student_phone: string
  student_email: string
  proof_url: string
  notes: string
  requires_review: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  code: RedemptionCode
}

export type StaffPaymentProfile = {
  user_id: number
  display_name: string
  status: string
  monthly_code_limit: number
  monthly_amount_limit_centimes: number
  allowed_template_ids: number[]
  used_codes_this_month: number
  remaining_codes_this_month: number
  used_amount_this_month_centimes: number
  remaining_amount_this_month_centimes: number | null
}

export type StaffPaymentDashboard = {
  generated_at: string
  profile: StaffPaymentProfile
  templates: RedemptionCodeTemplate[]
  requests: StaffPaymentRequest[]
}

export type StaffPaymentRequestInput = {
  template_id: number
  payment_method: string
  provider_reference: string
  amount_centimes: number
  student_name: string
  student_phone: string
  student_email?: string
  proof_url?: string
  notes?: string
}

export const EMPTY_FOUNDER_FINANCE: FounderFinanceSummary = {
  paid_revenue_centimes: 0,
  previous_paid_revenue_centimes: 0,
  staff_collected_revenue_centimes: 0,
  staff_redeemed_revenue_centimes: 0,
  expenses_centimes: 0,
  open_refunds_centimes: 0,
  profit_centimes: 0,
  mrr_centimes: 0,
  arr_centimes: 0,
  paid_users: 0,
  active_entitlements: 0,
  expenses_by_category: {},
  revenue_by_rail: {},
  revenue_by_plan: {},
}

export const EMPTY_FOUNDER_DASHBOARD: FounderDashboard = {
  generated_at: '',
  month: '',
  metrics: [],
  growth_by_day: [],
  students_by_status: {},
  students_by_tier: {},
  students_by_track: {},
  finance: EMPTY_FOUNDER_FINANCE,
  engagement: {},
  messages: {},
  staff_codes: {},
  expenses: [],
}

export const EMPTY_STAFF_PAYMENT_DASHBOARD: StaffPaymentDashboard = {
  generated_at: '',
  profile: {
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
  },
  templates: [],
  requests: [],
}

export function founderDashboardPath(month?: string) {
  return month ? `/admin/founder-dashboard?month=${encodeURIComponent(month)}` : '/admin/founder-dashboard'
}

export async function getFounderDashboard(month?: string) {
  return getJson<FounderDashboard>(founderDashboardPath(month))
}

export async function createFinanceExpense(input: FinanceExpenseInput) {
  return postJson<FinanceExpense, FinanceExpenseInput>('/admin/finance/expenses', input)
}

export async function getRedemptionTemplates(includeArchived = false) {
  return getJson<RedemptionCodeTemplate[]>(`/admin/redemption-templates?include_archived=${includeArchived ? 'true' : 'false'}`)
}

export async function createRedemptionTemplate(input: RedemptionCodeTemplateInput) {
  return postJson<RedemptionCodeTemplate, RedemptionCodeTemplateInput>('/admin/redemption-templates', input)
}

export async function getStaffPaymentRequests(limit = 100) {
  return getJson<StaffPaymentRequest[]>(`/admin/staff-payment-requests?limit=${limit}`)
}

export async function getStaffPaymentDashboard(limit = 50) {
  return getJson<StaffPaymentDashboard>(`/staff/payments/dashboard?limit=${limit}`)
}

export async function createStaffPaymentRequest(input: StaffPaymentRequestInput) {
  return postJson<StaffPaymentRequest, StaffPaymentRequestInput>('/staff/payments/requests', input)
}

export function numberValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  return 0
}

export function formatMoneyCentimes(value: unknown) {
  return `${(numberValue(value) / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })} MAD`
}

export function formatNumber(value: unknown) {
  return numberValue(value).toLocaleString('en-US')
}

export function moneyInputToCentimes(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

export function recordEntries(record?: Record<string, unknown> | null, limit = 8) {
  return Object.entries(record ?? {})
    .map(([key, value]) => ({ key, value: numberValue(value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}
