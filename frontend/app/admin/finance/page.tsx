'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { Activity, ArrowLeft, CheckCircle2, FileUp, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { apiDataErrorMessage } from '@/lib/apiData'
import {
  approveManualPaymentTransaction,
  financeLedgerEntriesCsv,
  importManualPaymentReconciliation,
  listFinanceLedgerEntries,
  listManualPaymentTransactions,
  listManualPaymentReconciliationImports,
  listPaymentProviderEvents,
  manualPaymentImportSummariesCsv,
  paymentProviderEventsCsv,
  parseManualPaymentImportRows,
  reconcileManualPaymentTransaction,
  rejectManualPaymentTransaction,
  type FinanceLedgerEntry,
  type ManualPaymentImportSummary,
  type ManualPaymentRail,
  type ManualPaymentStatus,
  type ManualPaymentTransaction,
  type PaymentProviderEvent,
} from '@/lib/adminFinance'

const statusOptions: { value: ManualPaymentStatus; label: string }[] = [
  { value: 'pending_manual_review', label: 'Pending review' },
  { value: 'paid', label: 'Paid' },
  { value: 'mismatch', label: 'Mismatch' },
  { value: 'failed', label: 'Failed' },
]

const railOptions: { value: ManualPaymentRail; label: string }[] = [
  { value: 'bank_transfer', label: 'Virement' },
  { value: 'cashplus', label: 'CashPlus' },
  { value: 'ashplus', label: 'AshPlus' },
]

const defaultReviewReason = 'Finance confirmation'

export default function AdminFinancePage() {
  const [status, setStatus] = useState<ManualPaymentStatus>('pending_manual_review')
  const [transactions, setTransactions] = useState<ManualPaymentTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState('')
  const [ledgerEntries, setLedgerEntries] = useState<FinanceLedgerEntry[]>([])
  const [providerEvents, setProviderEvents] = useState<PaymentProviderEvent[]>([])
  const [reconciliationImports, setReconciliationImports] = useState<ManualPaymentImportSummary[]>([])
  const [auditTransactionId, setAuditTransactionId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reviewReasons, setReviewReasons] = useState<Record<number, string>>({})
  const [reconcileRail, setReconcileRail] = useState<ManualPaymentRail>('bank_transfer')
  const [referenceCode, setReferenceCode] = useState('')
  const [amountCentimes, setAmountCentimes] = useState('9900')
  const [providerReference, setProviderReference] = useState('')
  const [reconciliationReason, setReconciliationReason] = useState('Finance reconciliation')
  const [importRail, setImportRail] = useState<ManualPaymentRail>('bank_transfer')
  const [importSource, setImportSource] = useState('')
  const [importRows, setImportRows] = useState('')
  const [importSummary, setImportSummary] = useState('')
  const auditRequestSeq = useRef(0)

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setTransactions(await listManualPaymentTransactions(undefined, status, 100))
    } catch (loadError) {
      setTransactions([])
      setError(apiDataErrorMessage(loadError, 'Could not load manual payments.'))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  const loadAuditTrail = useCallback(async (transactionId?: number | null) => {
    const requestId = auditRequestSeq.current + 1
    auditRequestSeq.current = requestId
    setAuditLoading(true)
    setAuditError('')
    try {
      const [ledger, events, imports] = await Promise.all([
        listFinanceLedgerEntries(undefined, 25, transactionId),
        listPaymentProviderEvents(undefined, 25, transactionId),
        transactionId ? Promise.resolve([]) : listManualPaymentReconciliationImports(undefined, 10),
      ])
      if (requestId !== auditRequestSeq.current) return
      setLedgerEntries(ledger)
      setProviderEvents(events)
      setReconciliationImports(imports)
    } catch (loadError) {
      if (requestId !== auditRequestSeq.current) return
      setLedgerEntries([])
      setProviderEvents([])
      setReconciliationImports([])
      setAuditError(apiDataErrorMessage(loadError, 'Could not load finance audit trail.'))
    } finally {
      if (requestId === auditRequestSeq.current) setAuditLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAuditTrail(auditTransactionId)
  }, [auditTransactionId, loadAuditTrail])

  const pendingCount = useMemo(
    () => transactions.filter((transaction) => transaction.status === 'pending_manual_review').length,
    [transactions],
  )

  async function reviewTransaction(transaction: ManualPaymentTransaction, action: 'approve' | 'reject') {
    const reviewReason = reviewReasons[transaction.id] ?? defaultReviewReason
    if (!reviewReason.trim()) {
      toast.error('Review reason is required.')
      return
    }
    setBusyId(transaction.id)
    try {
      const next = action === 'approve'
        ? await approveManualPaymentTransaction(undefined, transaction.id, { reason: reviewReason })
        : await rejectManualPaymentTransaction(undefined, transaction.id, { reason: reviewReason })
      setTransactions((items) => applyTransactionToActiveFilter(items, next, status))
      setReviewReasons((items) => {
        const remaining = { ...items }
        delete remaining[transaction.id]
        return remaining
      })
      void loadAuditTrail(auditTransactionId)
      toast.success(action === 'approve' ? 'Payment approved.' : 'Payment rejected.')
    } catch (reviewError) {
      toast.error(apiDataErrorMessage(reviewError, 'Could not update payment.'))
    } finally {
      setBusyId(null)
    }
  }

  async function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const next = await reconcileManualPaymentTransaction(undefined, {
        payment_method: reconcileRail,
        reference_code: referenceCode,
        amount_centimes: Number(amountCentimes),
        provider_reference: providerReference,
        reason: reconciliationReason,
      })
      setTransactions((items) => applyTransactionToActiveFilter(items, next, status))
      setReferenceCode('')
      setProviderReference('')
      void loadAuditTrail(auditTransactionId)
      toast.success(next.status === 'paid' ? 'Payment reconciled.' : `Payment marked ${next.status}.`)
    } catch (reconcileError) {
      toast.error(apiDataErrorMessage(reconcileError, 'Could not reconcile payment.'))
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const rows = parseManualPaymentImportRows(importRows)
      const result = await importManualPaymentReconciliation(undefined, {
        payment_method: importRail,
        source_name: importSource,
        rows,
      })
      setImportSummary(`${result.matched_count} matched, ${result.mismatch_count} mismatched, ${result.unmatched_count} unmatched, ${result.duplicate_count} duplicate.`)
      toast.success('Import processed.')
      void loadTransactions()
      void loadAuditTrail(auditTransactionId)
    } catch (importError) {
      toast.error(apiDataErrorMessage(importError, 'Could not import reconciliation rows.'))
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <Link href="/admin" className="text-slate-400 transition hover:text-white" aria-label="Back to admin">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-400">Finance</p>
            <h1 className="text-lg font-bold text-white">Manual payment review</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadTransactions()
              void loadAuditTrail(auditTransactionId)
            }}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Payment queue</h2>
                <p className="mt-1 text-sm text-slate-500">Approve only after confirmed collection or reconcile against provider references.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={`h-9 rounded-lg px-3 text-xs font-semibold transition ${status === option.value ? 'bg-indigo-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Stat label="Current filter" value={statusLabel(status)} />
              <Stat label="Rows loaded" value={String(transactions.length)} />
              <Stat label="Pending in view" value={String(pendingCount)} />
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
              <p>{error}</p>
            </div>
          ) : loading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-900" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
              No manual payments in this filter.
            </div>
          ) : (
            <div className="grid gap-3">
              {transactions.map((transaction) => (
                <PaymentCard
                  key={transaction.id}
                  transaction={transaction}
                  busy={busyId === transaction.id}
                  reviewReason={reviewReasons[transaction.id] ?? defaultReviewReason}
                  onReviewReasonChange={(value) => setReviewReasons((items) => ({ ...items, [transaction.id]: value }))}
                  onAudit={() => setAuditTransactionId(transaction.id)}
                  onApprove={() => void reviewTransaction(transaction, 'approve')}
                  onReject={() => void reviewTransaction(transaction, 'reject')}
                />
              ))}
            </div>
          )}

          <AuditTrail
            loading={auditLoading}
            error={auditError}
            transactionId={auditTransactionId}
            onClearTransaction={() => setAuditTransactionId(null)}
            ledgerEntries={ledgerEntries}
            providerEvents={providerEvents}
            reconciliationImports={reconciliationImports}
          />
        </section>

        <aside className="space-y-4">
          <form onSubmit={submitReconciliation} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
              <ShieldCheck size={16} className="text-indigo-400" /> Single reconciliation
            </div>
            <Field label="Rail">
              <select value={reconcileRail} onChange={(event) => setReconcileRail(event.target.value as ManualPaymentRail)} className="finance-input">
                {railOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Reference code">
              <input required value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} className="finance-input" placeholder="KRESCO-BANK-..." />
            </Field>
            <Field label="Amount centimes">
              <input required type="number" min="1" value={amountCentimes} onChange={(event) => setAmountCentimes(event.target.value)} className="finance-input" />
            </Field>
            <Field label="Provider reference">
              <input required value={providerReference} onChange={(event) => setProviderReference(event.target.value)} className="finance-input" placeholder="Bank/Cash receipt ref" />
            </Field>
            <Field label="Reason">
              <input required value={reconciliationReason} onChange={(event) => setReconciliationReason(event.target.value)} className="finance-input" />
            </Field>
            <button type="submit" className="mt-2 h-10 w-full rounded-lg bg-indigo-600 text-sm font-bold text-white transition hover:bg-indigo-700">
              Reconcile payment
            </button>
          </form>

          <form onSubmit={submitImport} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
              <FileUp size={16} className="text-indigo-400" /> Normalized import
            </div>
            <Field label="Rail">
              <select value={importRail} onChange={(event) => setImportRail(event.target.value as ManualPaymentRail)} className="finance-input">
                {railOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <input value={importSource} onChange={(event) => setImportSource(event.target.value)} className="finance-input" placeholder="bank-statement-2026-06" />
            </Field>
            <Field label="Rows JSON">
              <textarea
                required
                rows={8}
                value={importRows}
                onChange={(event) => setImportRows(event.target.value)}
                className="finance-input min-h-40 resize-y font-mono text-xs"
                placeholder='[{"reference_code":"KRESCO-BANK-1","amount_centimes":9900,"provider_reference":"BANK-123"}]'
              />
            </Field>
            <button type="submit" className="mt-2 h-10 w-full rounded-lg bg-slate-100 text-sm font-bold text-slate-950 transition hover:bg-white">
              Import rows
            </button>
            {importSummary && <p className="m-0 mt-3 text-xs font-semibold text-slate-400">{importSummary}</p>}
          </form>
        </aside>
      </main>
    </div>
  )
}

function applyTransactionToActiveFilter(
  items: ManualPaymentTransaction[],
  next: ManualPaymentTransaction,
  activeStatus: ManualPaymentStatus,
) {
  const belongsInFilter = next.status === activeStatus
  let found = false
  const updated = items.flatMap((item) => {
    if (item.id !== next.id) return [item]
    found = true
    return belongsInFilter ? [next] : []
  })
  if (!found && belongsInFilter) return [next, ...updated]
  return updated
}

function PaymentCard({
  transaction,
  busy,
  reviewReason,
  onReviewReasonChange,
  onAudit,
  onApprove,
  onReject,
}: {
  transaction: ManualPaymentTransaction
  busy: boolean
  reviewReason: string
  onReviewReasonChange: (value: string) => void
  onAudit: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const proofs = Array.isArray(transaction.metadata?.proofs) ? transaction.metadata.proofs.length : 0
  const canReview = transaction.status === 'pending_manual_review'
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-slate-300">{transaction.payment_method}</span>
            <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone(transaction.status)}`}>{statusLabel(transaction.status)}</span>
          </div>
          <h3 className="mt-3 truncate text-base font-bold text-white">{transaction.reference_code}</h3>
          <p className="mt-1 text-sm text-slate-500">User #{transaction.user_id} / {formatMoney(transaction.amount_centimes, transaction.currency)}</p>
          <p className="mt-1 text-xs text-slate-500">Provider ref: {transaction.provider_reference || 'none'} / proofs: {proofs}</p>
          <button type="button" onClick={onAudit} className="mt-3 rounded-lg border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300 transition hover:bg-slate-800">
            Audit trail
          </button>
        </div>
        {canReview && (
          <div className="w-full max-w-sm space-y-2">
            <input
              aria-label={`Review reason for ${transaction.reference_code}`}
              value={reviewReason}
              onChange={(event) => onReviewReasonChange(event.target.value)}
              className="finance-input"
              placeholder="Review reason"
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={onApprove} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 size={14} /> Approve
              </button>
              <button type="button" disabled={busy} onClick={onReject} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50">
                <XCircle size={14} /> Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function AuditTrail({
  loading,
  error,
  transactionId,
  onClearTransaction,
  ledgerEntries,
  providerEvents,
  reconciliationImports,
}: {
  loading: boolean
  error: string
  transactionId: number | null
  onClearTransaction: () => void
  ledgerEntries: FinanceLedgerEntry[]
  providerEvents: PaymentProviderEvent[]
  reconciliationImports: ManualPaymentImportSummary[]
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Activity size={16} className="text-indigo-400" /> Finance audit trail
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {transactionId ? `Scoped to transaction #${transactionId}` : 'Showing the latest finance records'}
          </p>
        </div>
        {transactionId && (
          <button type="button" onClick={onClearTransaction} className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-bold text-slate-300 transition hover:bg-slate-800">
            Show all audit
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      ) : loading ? (
        <div className={`mt-4 grid gap-3 ${transactionId ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
          {[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl bg-slate-950" />)}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <AuditColumn
            title="Ledger"
            count={ledgerEntries.length}
            onExport={() => downloadCsv('finance-ledger.csv', financeLedgerEntriesCsv(ledgerEntries))}
            exportDisabled={!ledgerEntries.length}
          >
            {ledgerEntries.length ? ledgerEntries.slice(0, 5).map((entry) => (
              <AuditRow
                key={entry.id}
                title={entry.entry_type}
                detail={`${formatMoney(entry.amount_centimes, entry.currency)} / tx ${entry.transaction_id ?? 'none'}`}
                meta={entry.reason || formatDate(entry.created_at)}
              />
            )) : <EmptyAuditRows />}
          </AuditColumn>

          <AuditColumn
            title="Provider events"
            count={providerEvents.length}
            onExport={() => downloadCsv('finance-provider-events.csv', paymentProviderEventsCsv(providerEvents))}
            exportDisabled={!providerEvents.length}
          >
            {providerEvents.length ? providerEvents.slice(0, 5).map((event) => (
              <AuditRow
                key={event.id}
                title={event.event_type}
                detail={`${event.provider} / ${event.status}`}
                meta={`tx ${event.transaction_id ?? 'none'} / ${formatDate(event.received_at)}`}
              />
            )) : <EmptyAuditRows />}
          </AuditColumn>

          {!transactionId && (
            <AuditColumn
              title="Imports"
              count={reconciliationImports.length}
              onExport={() => downloadCsv('finance-reconciliation-imports.csv', manualPaymentImportSummariesCsv(reconciliationImports))}
              exportDisabled={!reconciliationImports.length}
            >
              {reconciliationImports.length ? reconciliationImports.slice(0, 5).map((item) => (
                <AuditRow
                  key={item.id}
                  title={item.source_name || `Import #${item.id}`}
                  detail={`${item.matched_count}/${item.row_count} matched / ${item.mismatch_count} mismatch`}
                  meta={`${item.payment_method} / ${statusLabel(item.status)}`}
                />
              )) : <EmptyAuditRows />}
            </AuditColumn>
          )}
        </div>
      )}
    </section>
  )
}

function AuditColumn({
  title,
  count,
  onExport,
  exportDisabled,
  children,
}: {
  title: string
  count: number
  onExport: () => void
  exportDisabled: boolean
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold text-white">{title}</h3>
          <p className="m-0 mt-1 text-xs text-slate-500">{count} loaded</p>
        </div>
        <button type="button" disabled={exportDisabled} onClick={onExport} className="h-8 rounded-lg border border-slate-700 px-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
          CSV
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AuditRow({ title, detail, meta }: { title: string; detail: string; meta: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
      <p className="m-0 truncate text-xs font-bold text-white">{title}</p>
      <p className="m-0 mt-1 truncate text-xs text-slate-400">{detail}</p>
      <p className="m-0 mt-1 truncate text-xs text-slate-600">{meta}</p>
    </div>
  )
}

function EmptyAuditRows() {
  return <p className="m-0 rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-xs text-slate-500">No records loaded.</p>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block text-xs font-bold text-slate-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <p className="m-0 text-xs font-semibold text-slate-500">{label}</p>
      <p className="m-0 mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  )
}

function formatMoney(amountCentimes: number, currency: string) {
  return `${(amountCentimes / 100).toFixed(2)} ${currency}`
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString() : ''
}

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function statusTone(status: string) {
  if (status === 'paid') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'failed') return 'bg-red-500/15 text-red-300'
  if (status === 'mismatch') return 'bg-amber-500/15 text-amber-300'
  return 'bg-indigo-500/15 text-indigo-300'
}
