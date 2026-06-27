'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useReducer, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CircleDollarSign,
  LayoutDashboard,
  MessageSquareText,
  RefreshCw,
  Ticket,
  TrendingUp,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'

import {
  EMPTY_FOUNDER_DASHBOARD,
  formatMoneyCentimes,
  formatNumber,
  getFounderDashboard,
  normalizeFounderGrowthRows,
  numberValue,
  recordEntries,
  type FounderDashboard,
  type FounderMetric,
} from '@/lib/founderOps'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  AdminMonthPicker,
  AdminPageHeader,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
} from '@/components/admin/AdminDesign'

const panel = adminPanelClass
const FounderGrowthChart = dynamic(() => import('@/components/admin/FounderCharts').then((module) => module.FounderGrowthChart), { ssr: false, loading: ChartSkeleton })
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

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
  const [growthMode, setGrowthMode] = useState<'new' | 'total'>('new')

  useEffect(() => {
    let alive = true
    dispatch({ type: 'load-start' })
    getFounderDashboard(month)
      .then((data) => { if (alive) dispatch({ type: 'load-success', dashboard: data }) })
      .catch((loadError) => { if (alive) dispatch({ type: 'load-error', error: apiDataErrorMessage(loadError, 'Founder dashboard could not be loaded.') }) })
    return () => { alive = false }
  }, [month, nonce])

  const metrics = useMemo(() => metricMap(dashboard.metrics), [dashboard.metrics])
  const growthRows = useMemo(() => visibleGrowthRows(dashboard.growth_by_day, month), [dashboard.growth_by_day, month])
  const chartGrowthRows = useMemo(
    () => normalizeFounderGrowthRows(growthRows, metrics.students?.value ?? 0),
    [growthRows, metrics.students?.value],
  )
  const visibleNewStudentTotal = chartGrowthRows.reduce((sum, row) => sum + numberValue(row.new_students), 0)
  const visibleStudentTotal = chartGrowthRows.length
    ? numberValue(chartGrowthRows[chartGrowthRows.length - 1]?.total_students)
    : numberValue(metrics.students?.value)
  const growthChartMode = growthMode === 'new'
    ? { key: 'new_students', label: 'New students', badge: `${formatNumber(visibleNewStudentTotal)} new` }
    : { key: 'total_students', label: 'Total students', badge: `${formatNumber(visibleStudentTotal)} total` }
  const finance = dashboard.finance
  const engagement = dashboard.engagement
  const messages = dashboard.messages
  const staffCodes = dashboard.staff_codes
  const hasDashboard = Boolean(dashboard.generated_at)
  const monthLabel = formatMonthLabel(month)
  const health = [
    { label: 'Active 7d', value: engagement.active_students_7d, icon: Activity },
    { label: 'Video minutes', value: engagement.approx_video_watch_minutes, icon: Video },
    { label: 'Live joins', value: engagement.live_joined_students_month, icon: Users },
    { label: 'AI units', value: engagement.ai_quota_units_month, icon: Brain },
  ]
  const cashCollected = numberValue(finance.paid_revenue_centimes) + numberValue(finance.staff_collected_revenue_centimes)
  const expenseTotal = numberValue(finance.expenses_centimes)
  const netCash = cashCollected - expenseTotal
  const financeSupportStats = [
    { label: 'Paid users', value: formatNumber(finance.paid_users) },
    { label: 'Entitlements', value: formatNumber(finance.active_entitlements) },
    { label: 'Refund exposure', value: formatMoneyCentimes(finance.open_refunds_centimes), tone: 'warn' as const },
  ]
  const actionRows = [
    { label: 'Finance review', value: formatMoneyCentimes(finance.open_refunds_centimes), hint: 'refund exposure and expense controls', href: '/admin/finance', icon: CircleDollarSign },
    { label: 'Private message search', value: formatNumber(messages.unread_for_professors), hint: 'unread professor private chats', href: '/admin/communications', icon: MessageSquareText },
    { label: 'Staff code operations', value: formatNumber(staffCodes.unused_total), hint: 'unused generated codes', href: '/admin/staff-payments', icon: Ticket },
    { label: 'Student/account status', value: formatNumber(metrics.students?.value ?? 0), hint: 'student status and access views', href: '/admin/students', icon: Users },
  ]

  const header = (
    <AdminPageHeader
      icon={LayoutDashboard}
      title="Admin dashboard"
      action={(
        <>
          <AdminMonthPicker label="Dashboard month" value={month} onChange={(nextMonth) => dispatch({ type: 'set-month', month: nextMonth })} />
        <button
          type="button"
          onClick={() => dispatch({ type: 'refresh' })}
          className={adminPrimaryButtonClass}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} /> Refresh
        </button>
        </>
      )}
    />
  )

  return (
    <main className={adminPageClass}>
      {header}

      {error && <div className="mb-4 rounded-[12px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-bold text-[#b91c1c]">{error}</div>}

      {!hasDashboard && loading && <DashboardLoadingState />}
      {!hasDashboard && !loading && error && <DashboardUnavailableState />}

      {hasDashboard && (
        <>
          <section className={`${panel} mb-5 overflow-hidden`}>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile icon={Users} metric={metrics.students} fallbackLabel="Students" label="Students" scope="Current" loading={loading} />
                <MetricTile icon={TrendingUp} metric={metrics.new_students} fallbackLabel="New students" label="New students" scope={monthLabel} loading={loading} />
                <MetricTile icon={CircleDollarSign} metric={metrics.mrr} fallbackLabel="Month run rate" label="Month run rate" scope={monthLabel} loading={loading} />
                <MetricTile icon={Activity} metric={metrics.profit} fallbackLabel="Net after estimates" label="Net after estimates" scope={monthLabel} loading={loading} />
              </div>
              <div className="border-t border-[#e6ebf2] bg-[#fbfcfe] p-5 lg:border-l lg:border-t-0">
                <p className="m-0 text-[12px] font-black uppercase text-[color:var(--primary)]">Scope</p>
                <h2 className="m-0 mt-2 text-[17px] font-black text-[#111827]">{monthLabel}</h2>
                <p className="m-0 mt-3 inline-flex rounded-[10px] bg-white px-3 py-2 text-[12px] font-black text-[#64748b] shadow-sm">{growthRows.length}d</p>
              </div>
            </div>
          </section>

          <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.34fr)_minmax(360px,0.66fr)]">
            <div className={`${panel} p-5`}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="m-0 text-[16px] font-black text-[#111827]">Student growth</h2>
                </div>
                <div className="flex items-center gap-2">
                  <GrowthModeToggle value={growthMode} onChange={setGrowthMode} />
                  <span className="rounded-[10px] bg-[color:var(--primary-soft)] px-3 py-1.5 text-[12px] font-black text-[color:var(--primary)]">
                    {growthChartMode.badge}
                  </span>
                </div>
              </div>
              <div className="h-[310px]">
                <FounderGrowthChart data={chartGrowthRows} dataKey={growthChartMode.key} label={growthChartMode.label} />
              </div>
            </div>

            <div className={`${panel} p-5`}>
              <h2 className="m-0 mb-4 text-[16px] font-black text-[#111827]">Student status</h2>
              <StudentStatusPie data={recordEntries(dashboard.students_by_status)} />
            </div>
          </section>

          <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.45fr)]">
            <div className={`${panel} p-5`}>
              <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(260px,0.38fr)_minmax(0,0.62fr)]">
                <div className="rounded-[18px] bg-[#111827] p-5 text-white shadow-[0_18px_40px_rgba(17,24,39,0.16)]">
                  <p className="m-0 text-[11px] font-black uppercase tracking-[0.08em] text-white/55">Finance</p>
                  <p className="m-0 mt-4 text-[13px] font-bold text-white/65">Cash collected</p>
                  <p className="m-0 mt-1 text-[31px] font-black leading-none tabular-nums">{formatMoneyCentimes(cashCollected)}</p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <FinancePill label="Net" value={formatMoneyCentimes(netCash)} tone={netCash >= 0 ? 'good' : 'warn'} />
                    <FinancePill label="Costs" value={formatMoneyCentimes(expenseTotal)} tone="warn" />
                  </div>
                </div>

                <FinanceComparisonChart
                  rows={[
                    { label: 'Collected', value: cashCollected, tone: 'primary' },
                    { label: 'Costs', value: expenseTotal, tone: 'warn' },
                    { label: 'Net cash', value: Math.max(0, netCash), tone: netCash >= 0 ? 'good' : 'warn' },
                  ]}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {financeSupportStats.map((item) => <FinanceCompactStat key={item.label} {...item} />)}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <FinanceMixList title="Revenue rails" data={recordEntries(finance.revenue_by_rail as Record<string, unknown>)} />
                <FinanceMixList title="Cost categories" data={recordEntries(finance.expenses_by_category as Record<string, unknown>)} tone="warn" />
              </div>
            </div>

            <div className={`${panel} p-5`}>
              <h2 className="m-0 mb-4 text-[16px] font-black text-[#111827]">Actions</h2>
              <div className="grid gap-2">
                {actionRows.map((row) => <ActionRow key={row.label} {...row} />)}
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className={`${panel} p-5`}>
              <h2 className="m-0 mb-4 text-[16px] font-black text-[#111827]">Engagement</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {health.map((item) => <Signal key={item.label} icon={item.icon} label={item.label} value={formatNumber(item.value)} />)}
              </div>
            </div>

            <div className={`${panel} p-5`}>
              <MessagesOverview messages={messages} />
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function MetricTile({
  icon: Icon,
  metric,
  fallbackLabel,
  label,
  scope,
  loading,
}: {
  icon: LucideIcon
  metric?: FounderMetric
  fallbackLabel: string
  label?: string
  scope: string
  loading: boolean
}) {
  const value = metric?.unit === 'centimes' ? formatMoneyCentimes(metric.value) : formatNumber(metric?.value ?? 0)
  const previous = numberValue(metric?.previous_value)
  const current = numberValue(metric?.value)
  const delta = previous ? Math.round(((current - previous) / previous) * 100) : 0
  return (
    <article className="min-h-[138px] border-b border-[#e6ebf2] p-4 tabular-nums sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]"><Icon size={20} /></span>
        <span className={`rounded-[9px] px-2 py-1 text-[11px] font-black ${delta >= 0 ? 'bg-[#ecfdf5] text-[#059669]' : 'bg-[#fef2f2] text-[#dc2626]'}`}>
          {previous ? `${delta >= 0 ? '+' : ''}${delta}%` : 'new'}
        </span>
      </div>
      <p className="m-0 mt-4 text-[13px] font-black uppercase text-[#9ca3af]">{label ?? metric?.label ?? fallbackLabel}</p>
      <p className="m-0 mt-1 text-[26px] font-black leading-none text-[#111827]">{loading ? '-' : value}</p>
      <p className="m-0 mt-2 text-[11px] font-black uppercase tracking-[0.04em] text-[#c0c7d2]">{scope}</p>
    </article>
  )
}

function GrowthModeToggle({
  value,
  onChange,
}: {
  value: 'new' | 'total'
  onChange: (value: 'new' | 'total') => void
}) {
  const options = [
    { value: 'new' as const, label: 'Daily' },
    { value: 'total' as const, label: 'Total' },
  ]
  return (
    <div className="inline-grid h-9 grid-cols-2 rounded-[11px] bg-[#eef2f7] p-1 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]" aria-label="Student growth metric">
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option.value)}
            className={`min-w-[58px] rounded-[8px] px-3 text-[12px] font-black transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] ${
              isSelected
                ? 'bg-white text-[color:var(--primary)] shadow-[0_6px_14px_rgba(15,23,42,0.08)]'
                : 'text-[#64748b] hover:text-[#111827]'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function FinancePill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'good' ? 'text-[#86efac]' : tone === 'warn' ? 'text-[#fbbf24]' : 'text-white'
  return (
    <div className="rounded-[13px] bg-white/10 px-3 py-2">
      <p className="m-0 text-[10px] font-black uppercase tracking-[0.06em] text-white/45">{label}</p>
      <p className={`m-0 mt-1 text-[13px] font-black tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function FinanceComparisonChart({
  rows,
}: {
  rows: Array<{ label: string; value: number; tone: 'primary' | 'warn' | 'good' }>
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  return (
    <div className="rounded-[18px] border border-[#edf1f7] bg-[#fbfcfe] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-[16px] font-black text-[#111827]">Cash shape</h2>
        <span className="rounded-[999px] bg-white px-3 py-1.5 text-[11px] font-black uppercase text-[#9ca3af] shadow-sm">current month</span>
      </div>
      <div className="grid gap-4">
        {rows.map((row) => {
          const width = Math.max(3, Math.round((row.value / max) * 100))
          const fillClass = row.tone === 'warn' ? 'bg-[#f59e0b]' : row.tone === 'good' ? 'bg-[#16a34a]' : 'bg-[color:var(--primary)]'
          return (
            <div key={row.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-[12px] font-black uppercase text-[#71717a]">{row.label}</span>
                <span className="text-[13px] font-black text-[#111827] tabular-nums">{formatMoneyCentimes(row.value)}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
                <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FinanceCompactStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] px-4 py-3">
      <p className="m-0 text-[11px] font-black uppercase text-[#9ca3af]">{label}</p>
      <p className={`m-0 mt-1 text-[17px] font-black tabular-nums ${tone === 'warn' ? 'text-[#f59e0b]' : 'text-[#111827]'}`}>{value}</p>
    </div>
  )
}

function FinanceMixList({ title, data, tone = 'primary' }: { title: string; data: Array<{ key: string; value: number }>; tone?: 'primary' | 'warn' }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div className="rounded-[16px] border border-[#edf1f7] bg-[#fbfcfe] p-4">
      <h3 className="m-0 mb-4 text-[14px] font-black text-[#111827]">{title}</h3>
      <div className="grid gap-3">
        {data.map((item) => {
          const width = Math.max(4, Math.round((item.value / max) * 100))
          return (
            <div key={item.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[12px] font-bold capitalize text-[#52525c]">{item.key.replaceAll('_', ' ')}</span>
                <span className="shrink-0 text-[12px] font-black text-[#111827] tabular-nums">{formatMoneyCentimes(item.value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
                <div className={`h-full rounded-full ${tone === 'warn' ? 'bg-[#f59e0b]' : 'bg-[color:var(--primary)]'}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
        {!data.length && <p className="m-0 rounded-[12px] border border-dashed border-[#d9e1ec] py-8 text-center text-[13px] font-bold text-[#9ca3af]">-</p>}
      </div>
    </div>
  )
}

function Signal({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
      <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-white text-[color:var(--primary)] shadow-sm"><Icon size={17} /></span>
      <div>
        <p className="m-0 text-[12px] font-black text-[#111827]">{value}</p>
        <p className="m-0 text-[12px] font-bold text-[#9ca3af]">{label}</p>
      </div>
    </div>
  )
}

function MessagesOverview({
  messages,
}: {
  messages: FounderDashboard['messages']
}) {
  const unread = numberValue(messages.unread_for_professors)
  const conversations = numberValue(messages.private_conversations)
  const monthlyMessages = numberValue(messages.private_messages_month)
  const unreadShare = monthlyMessages ? Math.round((unread / monthlyMessages) * 100) : 0
  const messagesPerConversation = conversations ? Math.round(monthlyMessages / conversations) : 0

  return (
    <div>
      <div className="mb-4">
        <h2 className="m-0 text-[16px] font-black text-[#111827]">Messages</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-[18px] bg-[color:var(--primary)] p-5 text-white shadow-[0_16px_34px_rgba(69,61,238,0.18)]">
          <p className="m-0 text-[11px] font-black uppercase tracking-[0.08em] text-white/60">Private messages</p>
          <p className="m-0 mt-3 text-[34px] font-black leading-none tabular-nums">{formatNumber(monthlyMessages)}</p>
          <p className="m-0 mt-2 text-[12px] font-bold text-white/65">{formatNumber(conversations)} conversations</p>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(4, unreadShare))}%` }} />
          </div>
          <p className="m-0 mt-2 text-[11px] font-black uppercase tracking-[0.04em] text-white/55">{formatNumber(unreadShare)}% unread load</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <MessageStat icon={Activity} label="Unread profs" value={formatNumber(unread)} tone={unread ? 'warn' : 'default'} />
          <MessageStat icon={TrendingUp} label="Msg / chat" value={formatNumber(messagesPerConversation)} />
          <MessageStat icon={MessageSquareText} label="Conversations" value={formatNumber(conversations)} />
        </div>
      </div>
    </div>
  )
}

function MessageStat({ icon: Icon, label, value, tone = 'default' }: { icon: LucideIcon; label: string; value: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-white shadow-sm ${tone === 'warn' ? 'text-[#d97706]' : 'text-[color:var(--primary)]'}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className={`block text-[18px] font-black leading-none tabular-nums ${tone === 'warn' ? 'text-[#d97706]' : 'text-[#111827]'}`}>{value}</span>
        <span className="mt-1 block text-[12px] font-bold text-[#9ca3af]">{label}</span>
      </span>
    </div>
  )
}

function ActionRow({ label, value, href, icon: Icon }: { label: string; value: string; hint: string; href: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="group grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-[13px] border border-[#edf1f7] bg-[#fbfcfe] p-3 no-underline transition-[background-color,border-color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:bg-white active:scale-[0.96]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-white text-[color:var(--primary)] shadow-sm"><Icon size={17} /></span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black text-[#111827]">{label}</span>
      </span>
      <span className="flex items-center gap-2 text-[12px] font-black text-[#64748b]">
        {value}
        <ArrowRight size={14} className="transition-[transform] duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" aria-hidden="true" />
      </span>
    </Link>
  )
}

function StudentStatusPie({ data }: { data: Array<{ key: string; value: number }> }) {
  const statuses = normalizeStudentStatuses(data)
  const total = statuses.reduce((sum, item) => sum + item.value, 0)
  let cursor = 0
  const stops = total > 0
    ? statuses.map((item) => {
      const start = cursor
      const end = cursor + (item.value / total) * 100
      cursor = end
      return `${item.color} ${start}% ${end}%`
    }).join(', ')
    : '#eef2f7 0% 100%'

  return (
    <div className="grid min-h-[260px] content-start gap-5">
      <div className="grid place-items-center">
        <div
          aria-label="Student status pie chart"
          className="grid h-[168px] w-[168px] place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]"
          style={{ background: `conic-gradient(${stops})` }}
        >
          <div className="grid h-[108px] w-[108px] place-items-center rounded-full bg-white text-center shadow-[0_8px_24px_rgba(24,24,27,0.08)]">
            <span>
              <span className="block text-[30px] font-black leading-none text-[#111827] tabular-nums">{formatNumber(total)}</span>
              <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.06em] text-[#9ca3af]">students</span>
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {statuses.map((item) => {
          const share = total > 0 ? Math.round((item.value / total) * 100) : 0
          return (
          <div key={item.key} className="flex min-h-10 items-center justify-between gap-3 rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] px-3 py-2 transition-[background-color] duration-150 ease-out hover:bg-white motion-reduce:transition-none">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="truncate text-[12.5px] font-black text-[#4b5563]">{item.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-right">
              <span className="text-[11px] font-black text-[#9ca3af] tabular-nums">{share}%</span>
              <span className="min-w-5 text-[13px] font-black text-[#111827] tabular-nums">{formatNumber(item.value)}</span>
            </span>
          </div>
          )
        })}
      </div>
    </div>
  )
}

const STUDENT_STATUS_META = [
  { key: 'registered', label: 'Registered', color: '#94a3b8' },
  { key: 'active_basic', label: 'Active Basic', color: '#16a34a' },
  { key: 'pro', label: 'Pro', color: 'var(--primary)' },
  { key: 'vip', label: 'VIP', color: '#f59e0b' },
] as const

function normalizeStudentStatuses(data: Array<{ key: string; value: number }>) {
  const values = Object.fromEntries(STUDENT_STATUS_META.map((item) => [item.key, 0])) as Record<(typeof STUDENT_STATUS_META)[number]['key'], number>
  for (const item of data) {
    const key = normalizeStudentStatusKey(item.key)
    if (key) values[key] += item.value
  }
  return STUDENT_STATUS_META.map((item) => ({ ...item, value: values[item.key] }))
}

function normalizeStudentStatusKey(key: string): (typeof STUDENT_STATUS_META)[number]['key'] | null {
  const normalized = key.toLowerCase().replaceAll('-', '_').trim()
  if (normalized === 'registered') return 'registered'
  if (normalized === 'active_basic' || normalized === 'trial' || normalized === 'trial_or_active' || normalized === 'basic') return 'active_basic'
  if (normalized === 'pro' || normalized === 'paid' || normalized === 'active_paid') return 'pro'
  if (normalized === 'vip') return 'vip'
  return null
}

function DashboardLoadingState() {
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="border-b border-[#e6ebf2] p-5">
        <div className="h-4 w-48 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#eef2f7]" />
        <div className="mt-3 h-3 w-72 max-w-full motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#eef2f7]" />
      </div>
      <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="min-h-[138px] border-b border-[#e6ebf2] p-4 sm:border-r xl:border-b-0 xl:last:border-r-0">
            <div className="h-11 w-11 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[13px] bg-[#eef2f7]" />
            <div className="mt-5 h-3 w-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#eef2f7]" />
            <div className="mt-3 h-7 w-32 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#eef2f7]" />
          </div>
        ))}
      </div>
    </section>
  )
}

function DashboardUnavailableState() {
  return (
    <section className={`${panel} grid min-h-[320px] place-items-center p-8 text-center`}>
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-[15px] bg-[#fef2f2] text-[#dc2626]">
          <AlertTriangle size={22} />
        </span>
        <h2 className="m-0 mt-4 text-[18px] font-black text-[#111827]">Dashboard unavailable</h2>
      </div>
    </section>
  )
}

function metricMap(metrics: FounderMetric[]) {
  return metrics.reduce<Record<string, FounderMetric>>((acc, metric) => {
    acc[metric.key] = metric
    return acc
  }, {})
}

function visibleGrowthRows(rows: Array<Record<string, unknown>>, selectedMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(selectedMonth)) return rows

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = selectedMonth.split('-').map(Number)
  const monthLength = new Date(year, month, 0).getDate()
  const endDay = selectedMonth === currentMonth ? Math.min(now.getDate(), monthLength) : monthLength
  const rowsByDate = new Map<string, Record<string, unknown>>()

  for (const row of rows) {
    const value = row.date
    if (typeof value !== 'string' || !value.startsWith(`${selectedMonth}-`)) continue
    const day = Number(value.slice(8, 10))
    if (!Number.isFinite(day) || day < 1 || day > endDay) continue
    rowsByDate.set(value, row)
  }

  return Array.from({ length: endDay }, (_, index) => {
    const date = `${selectedMonth}-${String(index + 1).padStart(2, '0')}`
    return rowsByDate.get(date) ?? {
      date,
      new_students: 0,
      total_students: null,
    }
  })
}

function formatMonthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value || 'Selected month'
  const [year, month] = value.split('-').map(Number)
  return MONTH_LABEL_FORMATTER.format(new Date(year, month - 1, 1))
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function ChartSkeleton() {
  return <div className="h-full min-h-[160px] motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[12px] bg-[#eef2f7]" />
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
