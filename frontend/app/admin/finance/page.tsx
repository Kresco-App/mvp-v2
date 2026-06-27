'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  FilePlus2,
  Plus,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'

import {
  AdminAlert,
  AdminDatePicker,
  AdminMonthPicker,
  AdminPageHeader,
  AdminProgressBar,
  AdminTable,
  AdminTableActionButton,
  adminMonthInputClass,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminTableCellClass,
  adminTableHeadCellClass,
  adminTableHeadClass,
  adminTableHeadRowClass,
  adminTableRowClass,
} from '@/components/admin/AdminDesign'
import {
  EMPTY_FOUNDER_DASHBOARD,
  createFinanceExpense,
  formatMoneyCentimes,
  formatNumber,
  getFounderDashboard,
  moneyInputToCentimes,
  recordEntries,
  type FounderDashboard,
} from '@/lib/founderOps'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  approveManualPaymentReview,
  listPendingManualPaymentReviews,
  rejectManualPaymentReview,
  type ManualPaymentTransaction,
} from '@/lib/adminFinance'

const panel = adminPanelClass
const input = adminMonthInputClass
const primaryButton = adminPrimaryButtonClass

const expenseCategories = ['hosting', 'video', 'ai', 'ads', 'support', 'payroll', 'other']

type FinanceWorkspaceState = {
  dashboard: FounderDashboard
  manualPayments: ManualPaymentTransaction[]
  loading: boolean
  error: string
}

export type FinanceWorkspaceView = 'overview' | 'expenses' | 'revenue'

const initialFinanceWorkspaceState: FinanceWorkspaceState = {
  dashboard: EMPTY_FOUNDER_DASHBOARD,
  manualPayments: [],
  loading: true,
  error: '',
}

export default function AdminFinancePage({ view = 'overview' }: { view?: FinanceWorkspaceView } = {}) {
  const [{ dashboard, manualPayments, loading, error }, setFinanceState] = useState<FinanceWorkspaceState>(initialFinanceWorkspaceState)
  const [month, setMonth] = useState(() => currentMonth())
  const [busyAction, setBusyAction] = useState<'expense' | null>(null)
  const [busyManualPaymentId, setBusyManualPaymentId] = useState<number | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    expense_date: today(),
    category: 'hosting',
    vendor: '',
    description: '',
    amount: '',
    source: 'manual',
    status: 'paid',
  })
  const loadFinanceWorkspace = useCallback(async (targetMonth: string, isAlive: () => boolean = () => true) => {
    setFinanceState((state) => ({ ...state, loading: true, error: '' }))
    if (!isAlive()) return
    try {
      const [nextDashboard, nextManualPayments] = await Promise.all([
        getFounderDashboard(targetMonth),
        listPendingManualPaymentReviews(50),
      ])
      if (isAlive()) {
        setFinanceState({
          dashboard: nextDashboard,
          manualPayments: nextManualPayments,
          loading: false,
          error: '',
        })
      }
    } catch (loadError) {
      if (!isAlive()) return
      setFinanceState((state) => ({
        ...state,
        loading: false,
        error: apiDataErrorMessage(loadError, 'Finance workspace could not be loaded.'),
      }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    void loadFinanceWorkspace(month, () => alive)
    return () => { alive = false }
  }, [loadFinanceWorkspace, month])

  const refreshFinanceWorkspace = useCallback(() => {
    void loadFinanceWorkspace(month)
  }, [loadFinanceWorkspace, month])

  const finance = dashboard.finance
  const showOverview = view === 'overview'
  const showExpenses = view === 'expenses'
  const showRevenue = view === 'revenue'
  const title = view === 'expenses' ? 'Expenses' : view === 'revenue' ? 'Revenue' : 'Finance'
  const breakdownTitle = showRevenue ? 'Revenue mix' : 'Overview'
  const expenseRows = recordEntries(finance.expenses_by_category)
  const railRows = recordEntries(finance.revenue_by_rail)
  const planRows = recordEntries(finance.revenue_by_plan)
  const manualPaymentTotal = manualPayments.reduce((total, payment) => total + (payment.amount_centimes || 0), 0)

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyAction) return
    if (expenseForm.expense_date.slice(0, 7) !== month) {
      showToastError('Expense date must be inside the selected finance month.')
      return
    }
    const amount = moneyInputToCentimes(expenseForm.amount)
    if (!amount) {
      showToastError('Enter a valid expense amount.')
      return
    }
    setBusyAction('expense')
    try {
      await createFinanceExpense({
        expense_date: expenseForm.expense_date,
        category: expenseForm.category,
        vendor: expenseForm.vendor || undefined,
        description: expenseForm.description || undefined,
        amount_centimes: amount,
        source: expenseForm.source as 'manual' | 'vendor' | 'estimate',
        status: expenseForm.status as 'planned' | 'paid' | 'cancelled',
      })
      setExpenseForm((value) => ({ ...value, vendor: '', description: '', amount: '' }))
      refreshFinanceWorkspace()
      showToastSuccess('Expense added.')
    } catch (submitError) {
      showToastError(apiDataErrorMessage(submitError, 'Could not add expense.'))
    } finally {
      setBusyAction(null)
    }
  }

  async function reviewManualPayment(payment: ManualPaymentTransaction, decision: 'approve' | 'reject') {
    if (busyManualPaymentId) return
    setBusyManualPaymentId(payment.id)
    try {
      const reason = decision === 'approve'
        ? 'Confirmed from founder finance workspace.'
        : 'Rejected from founder finance workspace.'
      const nextPayment = decision === 'approve'
        ? await approveManualPaymentReview(payment.id, reason)
        : await rejectManualPaymentReview(payment.id, reason)
      setFinanceState((state) => ({
        ...state,
        manualPayments: state.manualPayments.filter((item) => item.id !== payment.id),
      }))
      refreshFinanceWorkspace()
      showToastSuccess(decision === 'approve'
        ? `Manual payment ${nextPayment.reference_code} approved.`
        : `Manual payment ${nextPayment.reference_code} rejected.`)
    } catch (reviewError) {
      showToastError(apiDataErrorMessage(reviewError, 'Could not review manual payment.'))
    } finally {
      setBusyManualPaymentId(null)
    }
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={CircleDollarSign}
        title={title}
        action={(
          <>
            <AdminMonthPicker label="Finance month" value={month} onChange={setMonth} />
            <button type="button" aria-label="Refresh finance" title="Refresh" onClick={refreshFinanceWorkspace} className={`${primaryButton} px-3`}>
              <RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            </button>
          </>
        )}
      />

      {error && (
        <AdminAlert tone="danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CircleDollarSign} label="MRR" value={formatMoneyCentimes(finance.mrr_centimes)} hint={`${formatNumber(finance.paid_users)} paid`} loading={loading} />
        <Stat icon={TrendingUp} label="ARR" value={formatMoneyCentimes(finance.arr_centimes)} loading={loading} />
        <Stat icon={ReceiptText} label="Costs" value={formatMoneyCentimes(finance.expenses_centimes)} loading={loading} tone="warn" />
        <Stat icon={Coins} label="Profit" value={formatMoneyCentimes(finance.profit_centimes)} loading={loading} tone={finance.profit_centimes >= 0 ? 'good' : 'warn'} />
      </section>

      {showOverview && (
        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Finance workspaces">
          <FinanceRouteCard
            icon={TrendingUp}
            title="Revenue"
            value={formatMoneyCentimes(finance.paid_revenue_centimes)}
            meta={`${formatNumber(finance.paid_users)} paid users`}
            href="/admin/finance/revenue"
          />
          <FinanceRouteCard
            icon={ReceiptText}
            title="Costs ledger"
            value={formatMoneyCentimes(finance.expenses_centimes)}
            meta={`${formatNumber(dashboard.expenses.length)} rows`}
            href="/admin/finance/expenses"
            tone="warn"
          />
          <FinanceRouteCard
            icon={Banknote}
            title="Payment review"
            value={formatNumber(manualPayments.length)}
            meta={formatMoneyCentimes(manualPaymentTotal)}
            href="/admin/finance/revenue"
            tone={manualPayments.length ? 'warn' : 'default'}
          />
        </section>
      )}

      {(showOverview || showRevenue) && (
      <section className="mb-5">
        <div className={`${panel} p-5`}>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="m-0 text-[16px] font-black text-[#111827]">{breakdownTitle}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <MiniMetric label="Paid" value={formatMoneyCentimes(finance.paid_revenue_centimes)} />
              <MiniMetric label="Staff" value={formatMoneyCentimes(finance.staff_collected_revenue_centimes)} />
              <MiniMetric label="Refunds" value={formatMoneyCentimes(finance.open_refunds_centimes)} tone="warn" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <BarList title="Rail" data={railRows} money />
            <BarList title="Plan" data={planRows} money />
            <BarList title="Costs" data={expenseRows} money tone="warn" />
          </div>
        </div>
      </section>
      )}

      {(showOverview || showRevenue) && (
      <section className={`${panel} mb-5 overflow-hidden`}>
        <div className="grid border-b border-[#edf1f7] bg-[#fbfcfe] lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="p-5">
            <h2 className="m-0 text-[16px] font-black text-[#111827]">Payment review</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-[#edf1f7] p-5 lg:border-l lg:border-t-0">
            <MiniMetric label="Pending" value={formatNumber(manualPayments.length)} tone={manualPayments.length ? 'warn' : 'good'} />
            <MiniMetric label="Amount" value={formatMoneyCentimes(manualPaymentTotal)} />
          </div>
        </div>
        <AdminTable minWidthClass="min-w-[860px]">
            <thead className={adminTableHeadClass}>
              <tr className={adminTableHeadRowClass}>
                <th className={adminTableHeadCellClass}>Ref</th>
                <th className={adminTableHeadCellClass}>Rail</th>
                <th className={adminTableHeadCellClass}>Plan</th>
                <th className={`${adminTableHeadCellClass} text-right`}>MAD</th>
                <th className={adminTableHeadCellClass}>Status</th>
                <th className={`${adminTableHeadCellClass} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {manualPayments.map((payment) => (
                <tr key={payment.id} className={adminTableRowClass}>
                  <td className={adminTableCellClass}>
                    <p className="m-0 font-black text-[#111827]">{payment.reference_code}</p>
                    <p className="m-0 mt-1 text-[11px] text-[#9ca3af]">{payment.provider_reference || '-'}</p>
                  </td>
                  <td className={`${adminTableCellClass} capitalize`}>{payment.payment_method.replaceAll('_', ' ')}</td>
                  <td className={`${adminTableCellClass} uppercase`}>{payment.plan}</td>
                  <td className={`${adminTableCellClass} text-right font-black text-[#111827]`}>{formatMoneyCentimes(payment.amount_centimes)}</td>
                  <td className={adminTableCellClass}>
                    <span className="rounded-[10px] bg-[#fff7ed] px-3 py-1.5 text-[12px] font-black text-[#d97706]">
                      {payment.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className={adminTableCellClass}>
                    <div className="flex justify-end gap-2">
                      <AdminTableActionButton
                        disabled={busyManualPaymentId === payment.id}
                        onClick={() => void reviewManualPayment(payment, 'approve')}
                        tone="success"
                      >
                        <CheckCircle2 size={14} /> Approve
                      </AdminTableActionButton>
                      <AdminTableActionButton
                        disabled={busyManualPaymentId === payment.id}
                        onClick={() => void reviewManualPayment(payment, 'reject')}
                        tone="danger"
                      >
                        <XCircle size={14} /> Reject
                      </AdminTableActionButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!manualPayments.length && (
                <tr>
                  <td colSpan={6} className={`${adminTableCellClass} py-12 text-center text-[13px] font-bold text-[#9ca3af]`}>No pending payments.</td>
                </tr>
              )}
            </tbody>
        </AdminTable>
      </section>
      )}

      {showExpenses && (
      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={submitExpense} className={`${panel} p-5`}>
          <div className="mb-4 flex items-center gap-2 text-[16px] font-black text-[#111827]">
            <FilePlus2 size={17} className="text-[color:var(--primary)]" /> Expense
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" className="col-span-2">
              <AdminDatePicker
                name="expense_date"
                label="Expense date"
                required
                value={expenseForm.expense_date}
                onChange={(nextDate) => setExpenseForm((value) => ({ ...value, expense_date: nextDate }))}
              />
            </Field>
            <Field label="Category">
              <select name="expense_category" aria-label="Expense category" value={expenseForm.category} onChange={(event) => setExpenseForm((value) => ({ ...value, category: event.target.value }))} className={input}>
                {expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Amount MAD">
            <input name="expense_amount" aria-label="Expense amount in MAD" required inputMode="decimal" autoComplete="off" value={expenseForm.amount} onChange={(event) => setExpenseForm((value) => ({ ...value, amount: event.target.value }))} className={input} placeholder="1200" />
          </Field>
          <Field label="Vendor">
            <input name="expense_vendor" aria-label="Expense vendor" autoComplete="organization" value={expenseForm.vendor} onChange={(event) => setExpenseForm((value) => ({ ...value, vendor: event.target.value }))} className={input} placeholder="Vercel, video, AI provider" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <select name="expense_source" aria-label="Expense source" value={expenseForm.source} onChange={(event) => setExpenseForm((value) => ({ ...value, source: event.target.value }))} className={input}>
                <option value="manual">manual</option>
                <option value="vendor">vendor</option>
                <option value="estimate">estimate</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="expense_status" aria-label="Expense status" value={expenseForm.status} onChange={(event) => setExpenseForm((value) => ({ ...value, status: event.target.value }))} className={input}>
                <option value="paid">paid</option>
                <option value="planned">planned</option>
                <option value="cancelled">cancelled</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea name="expense_description" aria-label="Expense description" value={expenseForm.description} onChange={(event) => setExpenseForm((value) => ({ ...value, description: event.target.value }))} className={`${input} min-h-[78px] py-3`} />
          </Field>
          <button type="submit" disabled={busyAction === 'expense'} className={`mt-2 w-full bg-[#111827] text-white hover:bg-[#374151] ${primaryButton}`}>
            <Plus size={15} /> {busyAction === 'expense' ? 'Adding...' : 'Add expense'}
          </button>
        </form>
      </section>
      )}

      {showExpenses && (
      <section className={`${panel} mt-5 overflow-hidden`}>
        <div className="border-b border-[#edf1f7] p-5">
          <h2 className="m-0 text-[16px] font-black text-[#111827]">Expenses</h2>
        </div>
        <AdminTable minWidthClass="min-w-[780px]">
            <thead className={adminTableHeadClass}>
              <tr className={adminTableHeadRowClass}>
                <th className={adminTableHeadCellClass}>Date</th>
                <th className={adminTableHeadCellClass}>Cat</th>
                <th className={adminTableHeadCellClass}>Vendor</th>
                <th className={adminTableHeadCellClass}>Source</th>
                <th className={adminTableHeadCellClass}>Status</th>
                <th className={`${adminTableHeadCellClass} text-right`}>MAD</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.expenses.map((expense) => (
                <tr key={expense.id} className={adminTableRowClass}>
                  <td className={adminTableCellClass}>{expense.expense_date}</td>
                  <td className={`${adminTableCellClass} capitalize`}>{expense.category}</td>
                  <td className={adminTableCellClass}>{expense.vendor || '-'}</td>
                  <td className={`${adminTableCellClass} capitalize`}>{expense.source}</td>
                  <td className={`${adminTableCellClass} capitalize`}>{expense.status}</td>
                  <td className={`${adminTableCellClass} text-right font-black text-[#111827]`}>{formatMoneyCentimes(expense.amount_centimes)}</td>
                </tr>
              ))}
              {!dashboard.expenses.length && (
                <tr>
                  <td colSpan={6} className={`${adminTableCellClass} py-12 text-center text-[13px] font-bold text-[#9ca3af]`}>No expenses.</td>
                </tr>
              )}
            </tbody>
        </AdminTable>
      </section>
      )}
    </main>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  loading,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  loading: boolean
  tone?: 'default' | 'warn' | 'good'
}) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[#111827]'
  return (
    <article className={`${panel} min-h-[132px] p-4`}>
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]"><Icon size={20} /></span>
        <Banknote size={18} className="text-[#cbd5e1]" />
      </div>
      <p className="m-0 mt-4 text-[12px] font-black uppercase text-[#9ca3af]">{label}</p>
      <p className={`m-0 mt-1 text-[25px] font-black leading-none ${toneClass}`}>{loading ? '-' : value}</p>
    </article>
  )
}

function FinanceRouteCard({
  href,
  icon: Icon,
  meta,
  title,
  value,
  tone = 'default',
}: {
  href: string
  icon: LucideIcon
  meta: string
  title: string
  value: string
  tone?: 'default' | 'warn'
}) {
  const valueClass = tone === 'warn' ? 'text-[#d97706]' : 'text-[#111827]'

  return (
    <Link
      href={href}
      className={`${panel} group flex min-h-[118px] items-center justify-between gap-4 p-4 no-underline transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#fbfcfe] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)] transition-[background-color,color] duration-150 ease-out group-hover:bg-[color:var(--primary)] group-hover:text-white">
          <Icon size={19} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-black text-[#111827]">{title}</span>
          <span className="mt-1 block truncate text-[12px] font-bold text-[#9ca3af]">{meta}</span>
        </span>
      </span>
      <span className={`shrink-0 text-right text-[20px] font-black tabular-nums ${valueClass}`}>
        {value}
      </span>
    </Link>
  )
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[#111827]'
  return (
    <div className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] px-3 py-2.5">
      <p className="m-0 text-[11px] font-black uppercase text-[#9ca3af]">{label}</p>
      <p className={`m-0 mt-1 text-[16px] font-black leading-none ${toneClass}`}>{value}</p>
    </div>
  )
}

function BarList({ title, data, money = false, tone = 'default' }: { title: string; data: Array<{ key: string; value: number }>; money?: boolean; tone?: 'default' | 'warn' }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
      <h3 className="m-0 mb-3 text-[13px] font-black text-[#111827]">{title}</h3>
      <div className="grid gap-3">
        {data.map((item) => (
          <div key={item.key}>
            <div className="mb-1 flex justify-between gap-3 text-[12px] font-bold">
              <span className="truncate capitalize text-[#4b5563]">{item.key.replaceAll('_', ' ')}</span>
              <span className="shrink-0 text-[#9ca3af]">{money ? formatMoneyCentimes(item.value) : formatNumber(item.value)}</span>
            </div>
            <AdminProgressBar value={Math.max(6, (item.value / max) * 100)} tone={tone === 'warn' ? 'warn' : 'primary'} className="h-2 bg-[#eef2f7]" />
          </div>
        ))}
        {!data.length && <p className="m-0 rounded-[12px] border border-dashed border-[#d9e1ec] py-8 text-center text-[13px] font-bold text-[#9ca3af]">-</p>}
      </div>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`mb-3 block text-[12px] font-black uppercase text-[#9ca3af] ${className}`}>
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}
