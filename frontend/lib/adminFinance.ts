import { apiJsonClient } from '@/lib/apiClient'
import type { PaymentMethod } from '@/lib/payments'

export type ManualPaymentStatus = 'pending_manual_review' | 'paid' | 'failed' | 'mismatch'
export type ManualPaymentRail = Exclude<PaymentMethod, 'cmi'>

export type ManualPaymentTransaction = {
  id: number
  user_id: number
  provider: string
  payment_method: ManualPaymentRail
  status: ManualPaymentStatus | string
  plan: string
  amount_centimes: number
  currency: string
  reference_code: string
  provider_reference?: string | null
  instructions: Record<string, unknown>
  created_at: string
  updated_at: string
  expires_at?: string | null
  confirmed_at?: string | null
  metadata: Record<string, unknown>
}

export type ManualPaymentReviewInput = {
  reason: string
}

export type ManualPaymentReconciliationInput = {
  payment_method: ManualPaymentRail
  reference_code: string
  amount_centimes: number
  provider_reference: string
  reason: string
  collected_at?: string | null
}

export type ManualPaymentImportRowInput = {
  reference_code: string
  amount_centimes: number
  provider_reference: string
  reason?: string
  collected_at?: string | null
  raw_row?: Record<string, unknown>
}

export type ManualPaymentImportInput = {
  payment_method: ManualPaymentRail
  source_name?: string | null
  rows: ManualPaymentImportRowInput[]
}

export type ManualPaymentImportResult = {
  id: number
  provider: string
  payment_method: ManualPaymentRail
  source_name?: string | null
  status: string
  row_count: number
  matched_count: number
  mismatch_count: number
  unmatched_count: number
  duplicate_count: number
  error_count: number
  rows: Array<{
    row_number: number
    status: string
    reference_code: string
    amount_centimes: number
    provider_reference: string
    matched_transaction_id?: number | null
    failure_reason?: string | null
  }>
  created_at: string
}

type AdminFinanceApiClient = typeof apiJsonClient

export function manualPaymentsPath(status: ManualPaymentStatus, limit = 100) {
  const params = new URLSearchParams({ status, limit: String(limit) })
  return `/payments/manual-payment-requests?${params.toString()}`
}

export async function listManualPaymentTransactions(
  apiClient: Pick<AdminFinanceApiClient, 'get'> = apiJsonClient,
  status: ManualPaymentStatus = 'pending_manual_review',
  limit = 100,
) {
  const { data } = await apiClient.get<ManualPaymentTransaction[]>(manualPaymentsPath(status, limit))
  return data
}

export async function approveManualPaymentTransaction(
  apiClient: Pick<AdminFinanceApiClient, 'post'> = apiJsonClient,
  transactionId: number,
  review: ManualPaymentReviewInput,
) {
  const { data } = await apiClient.post<ManualPaymentTransaction>(
    `/payments/manual-payment-requests/${transactionId}/approve`,
    { reason: review.reason.trim() },
  )
  return data
}

export async function rejectManualPaymentTransaction(
  apiClient: Pick<AdminFinanceApiClient, 'post'> = apiJsonClient,
  transactionId: number,
  review: ManualPaymentReviewInput,
) {
  const { data } = await apiClient.post<ManualPaymentTransaction>(
    `/payments/manual-payment-requests/${transactionId}/reject`,
    { reason: review.reason.trim() },
  )
  return data
}

export async function reconcileManualPaymentTransaction(
  apiClient: Pick<AdminFinanceApiClient, 'post'> = apiJsonClient,
  reconciliation: ManualPaymentReconciliationInput,
) {
  const { data } = await apiClient.post<ManualPaymentTransaction>(
    '/payments/manual-payment-requests/reconcile',
    normalizeReconciliation(reconciliation),
  )
  return data
}

export async function importManualPaymentReconciliation(
  apiClient: Pick<AdminFinanceApiClient, 'post'> = apiJsonClient,
  reconciliationImport: ManualPaymentImportInput,
) {
  const { data } = await apiClient.post<ManualPaymentImportResult>(
    '/payments/manual-payment-reconciliation-imports',
    normalizeImport(reconciliationImport),
  )
  return data
}

export function parseManualPaymentImportRows(value: string): ManualPaymentImportRowInput[] {
  const parsed = JSON.parse(value)
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows
  if (!Array.isArray(rows)) throw new Error('Import JSON must be an array or an object with rows.')
  return rows.map((row, index) => normalizeImportRow(row, index))
}

function normalizeReconciliation(reconciliation: ManualPaymentReconciliationInput) {
  return {
    payment_method: reconciliation.payment_method,
    reference_code: reconciliation.reference_code.trim(),
    amount_centimes: Number(reconciliation.amount_centimes),
    provider_reference: reconciliation.provider_reference.trim(),
    reason: reconciliation.reason.trim(),
    collected_at: reconciliation.collected_at || undefined,
  }
}

function normalizeImport(reconciliationImport: ManualPaymentImportInput) {
  return {
    payment_method: reconciliationImport.payment_method,
    source_name: optionalText(reconciliationImport.source_name ?? undefined),
    rows: reconciliationImport.rows.map((row, index) => normalizeImportRow(row, index)),
  }
}

function normalizeImportRow(row: unknown, index: number): ManualPaymentImportRowInput {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Invalid reconciliation row ${index + 1}.`)
  }
  const item = row as Partial<ManualPaymentImportRowInput>
  const referenceCode = optionalText(item.reference_code)
  const providerReference = optionalText(item.provider_reference)
  const amount = Number(item.amount_centimes)
  if (!referenceCode || !providerReference || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid reconciliation row ${index + 1}.`)
  }
  return {
    reference_code: referenceCode,
    amount_centimes: amount,
    provider_reference: providerReference,
    reason: optionalText(item.reason) ?? 'Finance import row',
    collected_at: item.collected_at || undefined,
    raw_row: typeof item.raw_row === 'object' && item.raw_row !== null ? item.raw_row : undefined,
  }
}

function optionalText(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}
