'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useReducer } from 'react'
import {
  Activity,
  Brain,
  CircleDollarSign,
  MessageSquareText,
  RefreshCw,
  Ticket,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react'

import {
  EMPTY_FOUNDER_DASHBOARD,
  formatMoneyCentimes,
  formatNumber,
  getFounderDashboard,
  numberValue,
  recordEntries,
  type FounderDashboard,
  type FounderMetric,
} from '@/lib/founderOps'

const panel = 'rounded-[16px] border border-[#e6ebf2] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]'
const input = 'h-10 rounded-[10px] border border-[#d9e1ec] bg-white px-3 text-[13px] font-bold text-[#1f2937] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]'
const FounderGrowthChart = dynamic(() => import('@/components/admin/FounderCharts').then((module) => module.FounderGrowthChart), { ssr: false, loading: ChartSkeleton })
const FounderBarChartPanel = dynamic(() => import('@/components/admin/FounderCharts').then((module) => module.FounderBarChartPanel), { ssr: false, loading: ChartSkeleton })

type AdminDashboardState = {
  dashboard: FounderDashboard
  month: string
  loading: boolean
  error: string
  nonce: number
}

type AdminDashboardAction =
  | { type: 'set-month'; month: string }
  | { type: 'refresh' }
  | { type: 'load-start' }
  | { type: 'load-success'; dashboard: FounderDashboard }
  | { type: 'load-error'; error: string }

export default function AdminDashboard() {
  const [{ dashboard, month, loading, error, nonce }, dispatch] = useReducer(adminDashboardReducer, null, createInitialAdminDashboardState)

  useEffect(() => {
    let alive = true
    dispatch({ type: 'load-start' })
    getFounderDashboard(month)
      .then((data) => { if (alive) dispatch({ type: 'load-success', dashboard: data }) })
      .catch(() => { if (alive) dispatch({ type: 'load-error', error: 'Founder dashboard could not be loaded.' }) })
    return () => { alive = false }
  }, [month, nonce])

  const metrics = useMemo(() => metricMap(dashboard.metrics), [dashboard.metrics])
  const finance = dashboard.finance
  const engagement = dashboard.engagement
  const messages = dashboard.messages
  const staffCodes = dashboard.staff_codes
  const health = [
    { label: 'Active 7d', value: engagement.active_students_7d, icon: Activity },
    { label: 'Video minutes', value: engagement.approx_video_watch_minutes, icon: Video },
    { label: 'Live joins', value: engagement.live_joined_students_month, icon: Users },
    { label: 'AI units', value: engagement.ai_quota_units_month, icon: Brain },
  ]

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="m-0 text-[12px] font-black uppercase text-[#2563eb]">Founder operations</p>
          <h1 className="m-0 mt-1 text-[28px] font-black leading-tight text-[#111827]">Business dashboard</h1>
          <p className="m-0 mt-1 max-w-[760px] text-[14px] font-semibold leading-6 text-[#6b7280]">
            Growth, revenue, costs, learning activity, private messages, and WhatsApp-code operations in one workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Dashboard month" type="month" value={month} onChange={(event) => dispatch({ type: 'set-month', month: event.target.value })} className={input} />
          <button
            type="button"
            onClick={() => dispatch({ type: 'refresh' })}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[13px] font-black text-white transition hover:bg-[#1d4ed8]"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {error && <div className="mb-4 rounded-[12px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-bold text-[#b91c1c]">{error}</div>}

      <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={Users} metric={metrics.students} fallbackLabel="Students" loading={loading} />
        <MetricTile icon={TrendingUp} metric={metrics.new_students} fallbackLabel="New students" loading={loading} />
        <MetricTile icon={CircleDollarSign} metric={metrics.mrr} fallbackLabel="MRR" loading={loading} />
        <MetricTile icon={Activity} metric={metrics.profit} fallbackLabel="Profit" loading={loading} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
        <div className={`${panel} p-5`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[16px] font-black text-[#111827]">Student growth</h2>
              <p className="m-0 mt-1 text-[13px] font-semibold text-[#9ca3af]">Daily registrations for the selected month.</p>
            </div>
            <span className="rounded-[10px] bg-[#eef3ff] px-3 py-1.5 text-[12px] font-black text-[#2563eb]">
              {formatNumber(metrics.new_students?.value ?? 0)} new
            </span>
          </div>
          <div className="h-[310px]">
            <FounderGrowthChart data={dashboard.growth_by_day} />
          </div>
        </div>

        <div className={`${panel} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#111827]">Student status</h2>
          <p className="m-0 mt-1 mb-4 text-[13px] font-semibold text-[#9ca3af]">Paid access, trial activity, registered, and blocked accounts.</p>
          <BreakdownList data={recordEntries(dashboard.students_by_status)} />
        </div>
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-3">
        <div className={`${panel} p-5 xl:col-span-2`}>
          <h2 className="m-0 text-[16px] font-black text-[#111827]">Finance</h2>
          <p className="m-0 mt-1 mb-4 text-[13px] font-semibold text-[#9ca3af]">Revenue, manual collections, expenses, refunds, MRR, ARR, and profit.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Paid revenue" value={formatMoneyCentimes(finance.paid_revenue_centimes)} />
            <MiniMetric label="Staff collected" value={formatMoneyCentimes(finance.staff_collected_revenue_centimes)} />
            <MiniMetric label="Expenses" value={formatMoneyCentimes(finance.expenses_centimes)} tone="warn" />
            <MiniMetric label="ARR" value={formatMoneyCentimes(finance.arr_centimes)} />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <FounderBarChartPanel title="Revenue by rail" data={recordEntries(finance.revenue_by_rail as Record<string, unknown>)} />
            <FounderBarChartPanel title="Expenses by category" data={recordEntries(finance.expenses_by_category as Record<string, unknown>)} />
          </div>
        </div>

        <div className={`${panel} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#111827]">Staff codes</h2>
          <p className="m-0 mt-1 mb-4 text-[13px] font-semibold text-[#9ca3af]">Generated, redeemed, and unused one-use codes.</p>
          <div className="grid gap-3">
            <MiniMetric label="Generated" value={formatNumber(staffCodes.generated_month)} />
            <MiniMetric label="Redeemed" value={formatNumber(staffCodes.redeemed_month)} />
            <MiniMetric label="Unused total" value={formatNumber(staffCodes.unused_total)} tone="warn" />
            <MiniMetric label="Redeemed revenue" value={formatMoneyCentimes(staffCodes.redeemed_staff_revenue_centimes)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className={`${panel} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#111827]">Engagement</h2>
          <p className="m-0 mt-1 mb-4 text-[13px] font-semibold text-[#9ca3af]">Approximate progress signals, not raw noisy events.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {health.map((item) => <Signal key={item.label} icon={item.icon} label={item.label} value={formatNumber(item.value)} />)}
          </div>
        </div>

        <div className={`${panel} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#111827]">Private messages</h2>
          <p className="m-0 mt-1 mb-4 text-[13px] font-semibold text-[#9ca3af]">Professor-student private chats only; live messages stay separate.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Signal icon={MessageSquareText} label="Conversations" value={formatNumber(messages.private_conversations)} />
            <Signal icon={MessageSquareText} label="Messages month" value={formatNumber(messages.private_messages_month)} />
            <Signal icon={Activity} label="Unread profs" value={formatNumber(messages.unread_for_professors)} />
            <Signal icon={Ticket} label="Professors" value={formatNumber(messages.professors_with_chats)} />
          </div>
        </div>
      </section>
    </main>
  )
}

function MetricTile({ icon: Icon, metric, fallbackLabel, loading }: { icon: typeof Users; metric?: FounderMetric; fallbackLabel: string; loading: boolean }) {
  const value = metric?.unit === 'centimes' ? formatMoneyCentimes(metric.value) : formatNumber(metric?.value ?? 0)
  const previous = numberValue(metric?.previous_value)
  const current = numberValue(metric?.value)
  const delta = previous ? Math.round(((current - previous) / previous) * 100) : 0
  return (
    <article className={`${panel} min-h-[138px] p-4`}>
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-[#eef3ff] text-[#2563eb]"><Icon size={20} /></span>
        <span className={`rounded-[9px] px-2 py-1 text-[11px] font-black ${delta >= 0 ? 'bg-[#ecfdf5] text-[#059669]' : 'bg-[#fef2f2] text-[#dc2626]'}`}>
          {previous ? `${delta >= 0 ? '+' : ''}${delta}%` : 'new'}
        </span>
      </div>
      <p className="m-0 mt-4 text-[13px] font-black uppercase text-[#9ca3af]">{metric?.label ?? fallbackLabel}</p>
      <p className="m-0 mt-1 text-[26px] font-black leading-none text-[#111827]">{loading ? '-' : value}</p>
    </article>
  )
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] px-3 py-3">
      <p className="m-0 text-[11px] font-black uppercase text-[#9ca3af]">{label}</p>
      <p className={`m-0 mt-1 text-[18px] font-black ${tone === 'warn' ? 'text-[#f59e0b]' : 'text-[#111827]'}`}>{value}</p>
    </div>
  )
}

function Signal({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
      <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-white text-[#2563eb] shadow-sm"><Icon size={17} /></span>
      <div>
        <p className="m-0 text-[12px] font-black text-[#111827]">{value}</p>
        <p className="m-0 text-[12px] font-bold text-[#9ca3af]">{label}</p>
      </div>
    </div>
  )
}

function BreakdownList({ data }: { data: Array<{ key: string; value: number }> }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div className="grid gap-3">
      {data.length ? data.map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex justify-between gap-3 text-[12px] font-bold">
            <span className="capitalize text-[#4b5563]">{item.key.replaceAll('_', ' ')}</span>
            <span className="text-[#9ca3af]">{formatNumber(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#eef2f7]">
            <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      )) : <p className="m-0 rounded-[12px] border border-dashed border-[#d9e1ec] py-8 text-center text-[13px] font-bold text-[#9ca3af]">No data.</p>}
    </div>
  )
}

function metricMap(metrics: FounderMetric[]) {
  return metrics.reduce<Record<string, FounderMetric>>((acc, metric) => {
    acc[metric.key] = metric
    return acc
  }, {})
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function ChartSkeleton() {
  return <div className="h-full min-h-[160px] animate-pulse rounded-[12px] bg-[#eef2f7]" />
}

function createInitialAdminDashboardState(): AdminDashboardState {
  return {
    dashboard: EMPTY_FOUNDER_DASHBOARD,
    month: currentMonth(),
    loading: true,
    error: '',
    nonce: 0,
  }
}

function adminDashboardReducer(state: AdminDashboardState, action: AdminDashboardAction): AdminDashboardState {
  switch (action.type) {
    case 'set-month':
      return { ...state, month: action.month }
    case 'refresh':
      return { ...state, nonce: state.nonce + 1 }
    case 'load-start':
      return { ...state, loading: true, error: '' }
    case 'load-success':
      return { ...state, dashboard: action.dashboard, loading: false, error: '' }
    case 'load-error':
      return { ...state, loading: false, error: action.error }
  }
}
