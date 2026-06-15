'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, FileUp, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { apiDataErrorMessage } from '@/lib/apiData'
import {
  approveManualPaymentTransaction,
  importManualPaymentReconciliation,
  listManualPaymentTransactions,
  parseManualPaymentImportRows,
  reconcileManualPaymentTransaction,
  rejectManualPaymentTransaction,
  type ManualPaymentRail,
  type ManualPaymentStatus,
  type ManualPaymentTransaction,
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
            onClick={() => void loadTransactions()}
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
                  onApprove={() => void reviewTransaction(transaction, 'approve')}
                  onReject={() => void reviewTransaction(transaction, 'reject')}
                />
              ))}
            </div>
          )}
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
  onApprove,
  onReject,
}: {
  transaction: ManualPaymentTransaction
  busy: boolean
  reviewReason: string
  onReviewReasonChange: (value: string) => void
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

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function statusTone(status: string) {
  if (status === 'paid') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'failed') return 'bg-red-500/15 text-red-300'
  if (status === 'mismatch') return 'bg-amber-500/15 text-amber-300'
  return 'bg-indigo-500/15 text-indigo-300'
}
