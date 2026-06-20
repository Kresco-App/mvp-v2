'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileUp,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
} from '@/components/admin/AdminDesign'
import { apiDataErrorMessage } from '@/lib/apiData'
import { formatNumber } from '@/lib/adminOverview'
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

const card = adminPanelClass
const inputClass = 'h-10 w-full rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-semibold text-[#3f3f46] outline-none transition placeholder:text-[#c0c0c7] focus:border-[#5b60f9]'

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
  const [allStatusTransactions, setAllStatusTransactions] = useState<ManualPaymentTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
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

  const loadFinanceStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const groups = await Promise.all(
        statusOptions.map((option) => listManualPaymentTransactions(undefined, option.value, 100)),
      )
      setAllStatusTransactions(dedupeTransactions(groups.flat()))
    } catch {
      setAllStatusTransactions([])
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  useEffect(() => {
    void loadFinanceStats()
  }, [loadFinanceStats])

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

  const financeSummary = useMemo(() => summarizeFinance(allStatusTransactions), [allStatusTransactions])
  const auditHealth = useMemo(
    () => summarizeAuditHealth(ledgerEntries, providerEvents, reconciliationImports),
    [ledgerEntries, providerEvents, reconciliationImports],
  )
  const pendingCount = useMemo(
    () => transactions.filter((transaction) => transaction.status === 'pending_manual_review').length,
    [transactions],
  )
  const anomalyCount = financeSummary.byStatus.mismatch + financeSummary.byStatus.failed

  async function refreshAll() {
    await Promise.all([
      loadTransactions(),
      loadFinanceStats(),
      loadAuditTrail(auditTransactionId),
    ])
  }

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
      setAllStatusTransactions((items) => upsertTransaction(items, next))
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
      setAllStatusTransactions((items) => upsertTransaction(items, next))
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
      void loadFinanceStats()
      void loadAuditTrail(auditTransactionId)
    } catch (importError) {
      toast.error(apiDataErrorMessage(importError, 'Could not import reconciliation rows.'))
    }
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={CircleDollarSign}
        eyebrow="Admin / Finance"
        title="Payment operations"
        description="Manual payment review, reconciliation imports, provider events and ledger audit."
        action={<AdminRefreshButton loading={loading || statsLoading || auditLoading} onClick={() => { void refreshAll() }} />}
      />

      {error && (
        <AdminAlert tone="danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripClass}>
        <StatTile icon={ReceiptText} label="Rows loaded" value={formatNumber(financeSummary.totalCount)} hint="all payment statuses" loading={statsLoading} />
        <StatTile icon={Banknote} label="Paid revenue" value={formatMoney(financeSummary.paidAmountCentimes, 'MAD')} hint={`${formatNumber(financeSummary.byStatus.paid)} paid payments`} loading={statsLoading} />
        <StatTile icon={ShieldCheck} label="Pending review" value={formatNumber(financeSummary.byStatus.pending_manual_review)} hint={`${formatNumber(pendingCount)} in current queue`} loading={statsLoading} />
        <StatTile icon={ShieldAlert} label="Anomalies" value={formatNumber(anomalyCount)} hint="mismatch + failed" loading={statsLoading} />
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Payment status</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Distribution across manual payment queues.</p>
          <BarList data={breakdownEntries(financeSummary.byStatus)} emptyLabel="No payment rows loaded." />
        </section>

        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Rail mix</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Collection rails represented in the loaded payment sample.</p>
          <BarList data={breakdownEntries(financeSummary.byRail)} emptyLabel="No rail rows loaded." />
        </section>
      </div>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Audit health</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
              Ledger, provider and import signals from the loaded finance audit trail.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[12px] font-black ${auditHealth.attentionTotal ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
            {formatNumber(auditHealth.attentionTotal)} attention
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Ledger rows" value={formatNumber(auditHealth.ledgerRows)} />
            <MiniMetric label="Provider failed" value={formatNumber(auditHealth.failedProviderEvents)} tone={auditHealth.failedProviderEvents ? 'warn' : 'default'} />
            <MiniMetric label="Import mismatch" value={formatNumber(auditHealth.importMismatches)} tone={auditHealth.importMismatches ? 'warn' : 'default'} />
            <MiniMetric label="Unmatched" value={formatNumber(auditHealth.importUnmatched)} tone={auditHealth.importUnmatched ? 'warn' : 'default'} />
          </div>
          <BarList
            data={breakdownEntries({
              provider_failed: auditHealth.failedProviderEvents,
              import_mismatch: auditHealth.importMismatches,
              import_unmatched: auditHealth.importUnmatched,
              import_duplicate: auditHealth.importDuplicates,
              ledger_rows: auditHealth.ledgerRows,
            })}
            emptyLabel="No audit health rows loaded."
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-5">
          <section className={`${card} overflow-hidden`}>
            <div className="flex flex-col gap-4 border-b border-[#f4f4f5] p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Payment queue</h2>
                <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">Approve only after confirmed collection or reconcile against provider references.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={`h-9 rounded-[11px] px-3 text-[12px] font-black transition ${status === option.value ? 'bg-[#5b60f9] text-white' : 'border-[2px] border-[#e4e4e7] bg-white text-[#71717a] hover:border-[#5b60f9] hover:text-[#5b60f9]'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-0">
                {[1, 2, 3].map((item) => <SkeletonRow key={item} />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center p-8 text-center">
                <div>
                  <ReceiptText size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
                  <p className="m-0 text-[15px] font-black text-[#3f3f46]">No manual payments in this filter.</p>
                  <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Switch status or refresh the finance queue.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-0">
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
          </section>

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

        <aside className="space-y-5">
          <form onSubmit={submitReconciliation} className={`${card} p-5`}>
            <div className="mb-4 flex items-center gap-2 text-[15px] font-black text-[#3f3f46]">
              <ShieldCheck size={17} className="text-[#5b60f9]" /> Single reconciliation
            </div>
            <Field label="Rail">
              <select value={reconcileRail} onChange={(event) => setReconcileRail(event.target.value as ManualPaymentRail)} className={inputClass}>
                {railOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Reference code">
              <input required value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} className={inputClass} placeholder="KRESCO-BANK-..." />
            </Field>
            <Field label="Amount centimes">
              <input required type="number" min="1" value={amountCentimes} onChange={(event) => setAmountCentimes(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Provider reference">
              <input required value={providerReference} onChange={(event) => setProviderReference(event.target.value)} className={inputClass} placeholder="Bank/Cash receipt ref" />
            </Field>
            <Field label="Reason">
              <input required value={reconciliationReason} onChange={(event) => setReconciliationReason(event.target.value)} className={inputClass} />
            </Field>
            <button type="submit" className="mt-2 h-10 w-full rounded-[12px] bg-[#5b60f9] text-[13px] font-black text-white transition hover:bg-[#4b50e6]">
              Reconcile payment
            </button>
          </form>

          <form onSubmit={submitImport} className={`${card} p-5`}>
            <div className="mb-4 flex items-center gap-2 text-[15px] font-black text-[#3f3f46]">
              <FileUp size={17} className="text-[#5b60f9]" /> Normalized import
            </div>
            <Field label="Rail">
              <select value={importRail} onChange={(event) => setImportRail(event.target.value as ManualPaymentRail)} className={inputClass}>
                {railOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <input value={importSource} onChange={(event) => setImportSource(event.target.value)} className={inputClass} placeholder="bank-statement-2026-06" />
            </Field>
            <Field label="Rows JSON">
              <textarea
                required
                rows={8}
                value={importRows}
                onChange={(event) => setImportRows(event.target.value)}
                className={`${inputClass} min-h-40 resize-y py-3 font-mono text-xs`}
                placeholder='[{"reference_code":"KRESCO-BANK-1","amount_centimes":9900,"provider_reference":"BANK-123"}]'
              />
            </Field>
            <button type="submit" className="mt-2 h-10 w-full rounded-[12px] border-[2px] border-[#e4e4e7] bg-white text-[13px] font-black text-[#3f3f46] transition hover:border-[#5b60f9] hover:text-[#5b60f9]">
              Import rows
            </button>
            {importSummary && <p className="m-0 mt-3 rounded-[12px] bg-[#f0fdf4] px-3 py-2 text-[12px] font-bold text-[#16a34a]">{importSummary}</p>}
          </form>
        </aside>
      </div>
    </main>
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
    <article className="border-t border-[#f4f4f5] px-5 py-4 first:border-t-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f4f4f5] px-2 py-1 text-[11px] font-black text-[#71717a]">{transaction.payment_method}</span>
            <span className={`rounded-full px-2 py-1 text-[11px] font-black ${statusTone(transaction.status)}`}>{statusLabel(transaction.status)}</span>
          </div>
          <h3 className="m-0 mt-3 truncate text-[15px] font-black text-[#3f3f46]">{transaction.reference_code}</h3>
          <p className="m-0 mt-1 text-[13px] font-semibold text-[#71717a]">User #{transaction.user_id} / {formatMoney(transaction.amount_centimes, transaction.currency)}</p>
          <p className="m-0 mt-1 text-[12px] font-semibold text-[#a1a1aa]">Provider ref: {transaction.provider_reference || 'none'} / proofs: {proofs}</p>
          <button type="button" onClick={onAudit} className="mt-3 rounded-[11px] border-[2px] border-[#e4e4e7] px-3 py-1.5 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]">
            Audit trail
          </button>
        </div>
        {canReview && (
          <div className="w-full space-y-2">
            <input
              aria-label={`Review reason for ${transaction.reference_code}`}
              value={reviewReason}
              onChange={(event) => onReviewReasonChange(event.target.value)}
              className={inputClass}
              placeholder="Review reason"
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={onApprove} className="inline-flex h-9 items-center justify-center gap-2 rounded-[11px] bg-[#16a34a] text-[12px] font-black text-white transition hover:bg-[#15803d] disabled:opacity-50">
                <CheckCircle2 size={14} /> Approve
              </button>
              <button type="button" disabled={busy} onClick={onReject} className="inline-flex h-9 items-center justify-center gap-2 rounded-[11px] bg-[#dc2626] text-[12px] font-black text-white transition hover:bg-[#b91c1c] disabled:opacity-50">
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
    <section className={`${card} p-5`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[16px] font-black text-[#3f3f46]">
            <Activity size={17} className="text-[#5b60f9]" /> Finance audit trail
          </div>
          <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">
            {transactionId ? `Scoped to transaction #${transactionId}` : 'Showing the latest finance records'}
          </p>
        </div>
        {transactionId && (
          <button type="button" onClick={onClearTransaction} className="h-9 rounded-[11px] border-[2px] border-[#e4e4e7] px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]">
            Show all audit
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-[12px] border-[2px] border-[#fecaca] bg-[#fef2f2] p-3 text-[13px] font-bold text-[#b91c1c]">{error}</div>
      ) : loading ? (
        <div className={`mt-4 grid gap-3 ${transactionId ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
          {[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-[12px] bg-[#f4f4f5]" />)}
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

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint: string
  loading: boolean
}) {
  return (
    <div className={adminMetricTileClass}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#f0f0ff] text-[#5b60f9]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46]">{loading ? '-' : value}</p>
      <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">{hint}</p>
    </div>
  )
}

function BarList({ data, emptyLabel }: { data: Array<{ key: string; value: number }>; emptyLabel: string }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  if (!data.length) {
    return <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-5 text-center text-[13px] font-semibold text-[#a1a1aa]">{emptyLabel}</p>
  }
  return (
    <div className="grid gap-3">
      {data.map((item) => {
        const width = Math.max(5, Math.round((item.value / max) * 100))
        return (
          <div key={item.key}>
            <div className="mb-1 flex justify-between gap-3 text-[12.5px] font-bold">
              <span className="text-[#52525c]">{statusLabel(item.key)}</span>
              <span className="text-[#a1a1aa]">{formatNumber(item.value)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#f4f4f5]">
              <div className="h-full rounded-full bg-[#5b60f9]" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'warn' ? 'text-[#f5900b]' : tone === 'good' ? 'text-[#16a34a]' : 'text-[#3f3f46]'
  return (
    <div className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-2.5">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[18px] font-black leading-none ${toneClass}`}>{value}</p>
    </div>
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
    <div className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-[14px] font-black text-[#3f3f46]">{title}</h3>
          <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">{count} loaded</p>
        </div>
        <button type="button" disabled={exportDisabled} onClick={onExport} className="inline-flex h-8 items-center gap-1 rounded-[10px] border-[2px] border-[#e4e4e7] px-2 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9] disabled:cursor-not-allowed disabled:opacity-40">
          <Download size={13} /> CSV
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AuditRow({ title, detail, meta }: { title: string; detail: string; meta: string }) {
  return (
    <div className="rounded-[10px] border border-[#f4f4f5] bg-white px-3 py-2">
      <p className="m-0 truncate text-[12px] font-black text-[#3f3f46]">{title}</p>
      <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#71717a]">{detail}</p>
      <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#a1a1aa]">{meta}</p>
    </div>
  )
}

function EmptyAuditRows() {
  return <p className="m-0 rounded-[10px] border border-dashed border-[#e4e4e7] px-3 py-6 text-center text-[12px] font-semibold text-[#a1a1aa]">No records loaded.</p>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-t border-[#f4f4f5] px-5 py-4 first:border-t-0">
      <div className="h-10 w-10 animate-pulse rounded-[12px] bg-[#f4f4f5]" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-56 animate-pulse rounded-full bg-[#f4f4f5]" />
        <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded-full bg-[#f4f4f5]" />
      </div>
      <div className="hidden h-4 w-24 animate-pulse rounded-full bg-[#f4f4f5] sm:block" />
    </div>
  )
}

function summarizeFinance(items: ManualPaymentTransaction[]) {
  const byStatus = {
    pending_manual_review: 0,
    paid: 0,
    mismatch: 0,
    failed: 0,
  }
  const byRail: Record<string, number> = {}
  let paidAmountCentimes = 0

  for (const item of items) {
    const status = item.status as keyof typeof byStatus
    if (status in byStatus) byStatus[status] += 1
    byRail[item.payment_method] = (byRail[item.payment_method] ?? 0) + 1
    if (item.status === 'paid') paidAmountCentimes += item.amount_centimes
  }

  return {
    totalCount: items.length,
    paidAmountCentimes,
    byStatus,
    byRail,
  }
}

function summarizeAuditHealth(
  ledgerEntries: FinanceLedgerEntry[],
  providerEvents: PaymentProviderEvent[],
  reconciliationImports: ManualPaymentImportSummary[],
) {
  const failedProviderEvents = providerEvents.filter((event) => event.status.toLowerCase() === 'failed').length
  const importMismatches = reconciliationImports.reduce((sum, item) => sum + item.mismatch_count, 0)
  const importUnmatched = reconciliationImports.reduce((sum, item) => sum + item.unmatched_count, 0)
  const importDuplicates = reconciliationImports.reduce((sum, item) => sum + item.duplicate_count, 0)

  return {
    ledgerRows: ledgerEntries.length,
    failedProviderEvents,
    importMismatches,
    importUnmatched,
    importDuplicates,
    attentionTotal: failedProviderEvents + importMismatches + importUnmatched + importDuplicates,
  }
}

function breakdownEntries(record: Record<string, number>) {
  return Object.entries(record)
    .map(([key, value]) => ({ key, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
}

function dedupeTransactions(items: ManualPaymentTransaction[]) {
  const byId = new Map<number, ManualPaymentTransaction>()
  for (const item of items) byId.set(item.id, item)
  return Array.from(byId.values())
}

function upsertTransaction(items: ManualPaymentTransaction[], next: ManualPaymentTransaction) {
  let found = false
  const updated = items.map((item) => {
    if (item.id !== next.id) return item
    found = true
    return next
  })
  return found ? updated : [next, ...updated]
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
  if (status === 'paid') return 'bg-[#f0fdf4] text-[#16a34a]'
  if (status === 'failed') return 'bg-[#fef2f2] text-[#dc2626]'
  if (status === 'mismatch') return 'bg-[#fff7ed] text-[#f5900b]'
  return 'bg-[#f0f0ff] text-[#5b60f9]'
}
