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

export type FinanceLedgerEntry = {
  id: number
  transaction_id?: number | null
  user_id?: number | null
  entry_type: string
  amount_centimes: number
  currency: string
  reason: string
  metadata: Record<string, unknown>
  created_at: string
}

export type PaymentProviderEvent = {
  id: number
  transaction_id?: number | null
  provider: string
  event_id: string
  event_type: string
  status: string
  payload: Record<string, unknown>
  received_at: string
  processed_at?: string | null
}

export type ManualPaymentImportSummary = Omit<ManualPaymentImportResult, 'rows'> & {
  created_by_user_id: number
}

type AdminFinanceApiClient = typeof apiJsonClient

export function manualPaymentsPath(status: ManualPaymentStatus, limit = 100) {
  const params = new URLSearchParams({ status, limit: String(limit) })
  return `/payments/manual-payment-requests?${params.toString()}`
}

export function financeLedgerPath(limit = 25, transactionId?: number | null) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (transactionId) params.set('transaction_id', String(transactionId))
  return `/payments/finance/ledger?${params.toString()}`
}

export function paymentProviderEventsPath(limit = 25, transactionId?: number | null) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (transactionId) params.set('transaction_id', String(transactionId))
  return `/payments/finance/provider-events?${params.toString()}`
}

export function manualPaymentReconciliationImportsPath(limit = 10) {
  return `/payments/manual-payment-reconciliation-imports?limit=${limit}`
}

export async function listManualPaymentTransactions(
  apiClient: Pick<AdminFinanceApiClient, 'get'> = apiJsonClient,
  status: ManualPaymentStatus = 'pending_manual_review',
  limit = 100,
) {
  const { data } = await apiClient.get<ManualPaymentTransaction[]>(manualPaymentsPath(status, limit))
  return data
}

export async function listPendingManualPaymentReviews(limit = 50) {
  return listManualPaymentTransactions(apiJsonClient, 'pending_manual_review', limit)
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

export async function approveManualPaymentReview(transactionId: number, reason: string) {
  return approveManualPaymentTransaction(apiJsonClient, transactionId, { reason })
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

export async function rejectManualPaymentReview(transactionId: number, reason: string) {
  return rejectManualPaymentTransaction(apiJsonClient, transactionId, { reason })
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

export async function listFinanceLedgerEntries(
  apiClient: Pick<AdminFinanceApiClient, 'get'> = apiJsonClient,
  limit = 25,
  transactionId?: number | null,
) {
  const { data } = await apiClient.get<FinanceLedgerEntry[]>(financeLedgerPath(limit, transactionId))
  return data
}

export async function listPaymentProviderEvents(
  apiClient: Pick<AdminFinanceApiClient, 'get'> = apiJsonClient,
  limit = 25,
  transactionId?: number | null,
) {
  const { data } = await apiClient.get<PaymentProviderEvent[]>(paymentProviderEventsPath(limit, transactionId))
  return data
}

export async function listManualPaymentReconciliationImports(
  apiClient: Pick<AdminFinanceApiClient, 'get'> = apiJsonClient,
  limit = 10,
) {
  const { data } = await apiClient.get<ManualPaymentImportSummary[]>(manualPaymentReconciliationImportsPath(limit))
  return data
}

export function financeLedgerEntriesCsv(entries: FinanceLedgerEntry[]) {
  return toCsv(
    ['id', 'transaction_id', 'user_id', 'entry_type', 'amount_centimes', 'currency', 'reason', 'metadata', 'created_at'],
    entries.map((entry) => [
      entry.id,
      entry.transaction_id,
      entry.user_id,
      entry.entry_type,
      entry.amount_centimes,
      entry.currency,
      entry.reason,
      entry.metadata,
      entry.created_at,
    ]),
  )
}

export function paymentProviderEventsCsv(events: PaymentProviderEvent[]) {
  return toCsv(
    ['id', 'transaction_id', 'provider', 'event_id', 'event_type', 'status', 'payload', 'received_at', 'processed_at'],
    events.map((event) => [
      event.id,
      event.transaction_id,
      event.provider,
      event.event_id,
      event.event_type,
      event.status,
      event.payload,
      event.received_at,
      event.processed_at,
    ]),
  )
}

export function manualPaymentImportSummariesCsv(imports: ManualPaymentImportSummary[]) {
  return toCsv(
    ['id', 'provider', 'payment_method', 'source_name', 'status', 'row_count', 'matched_count', 'mismatch_count', 'unmatched_count', 'duplicate_count', 'error_count', 'created_by_user_id', 'created_at'],
    imports.map((item) => [
      item.id,
      item.provider,
      item.payment_method,
      item.source_name,
      item.status,
      item.row_count,
      item.matched_count,
      item.mismatch_count,
      item.unmatched_count,
      item.duplicate_count,
      item.error_count,
      item.created_by_user_id,
      item.created_at,
    ]),
  )
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

function toCsv(headers: string[], rows: unknown[][]) {
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n')
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const normalizedValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const normalized = typeof value === 'string' && /^[=+\-@\t\r]/.test(normalizedValue)
    ? `'${normalizedValue}`
    : normalizedValue
  if (/[",\n\r]/.test(normalized)) return `"${normalized.replaceAll('"', '""')}"`
  return normalized
}
