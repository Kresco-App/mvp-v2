'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  Database,
  Layers3,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminPanel,
  AdminRefreshButton,
  AdminSearchBox,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
  adminPanelHeaderClass,
} from '@/components/admin/AdminDesign'
import { getJson } from '@/lib/apiClient'
import { getBackendUrl } from '@/lib/apiConfig'
import {
  DOMAIN_LABELS,
  EMPTY_OVERVIEW,
  filterCrudCatalog,
  formatMoneyCentimes,
  formatNumber,
  groupByDomain,
  numberValue,
  percent,
  publishedRatio,
  recordEntries,
  sumValues,
  type AdminOverview,
  type CrudCatalogItem,
} from '@/lib/adminOverview'

const card = adminPanelClass

const statusLabels: Record<string, string> = {
  active: 'Active',
  answered: 'Answered',
  cancelled: 'Cancelled',
  completed: 'Completed',
  draft: 'Draft',
  false: 'False',
  failed: 'Failed',
  in_review: 'In review',
  live: 'Live',
  open: 'Open',
  paid: 'Paid',
  pending: 'Pending',
  pending_manual_review: 'Manual review',
  pending_provider: 'Provider pending',
  processed: 'Processed',
  published: 'Published',
  resolved: 'Resolved',
  scheduled: 'Scheduled',
  sent: 'Sent',
  urgent: 'Urgent',
  mismatch: 'Mismatch',
  communication_attention: 'Support attention',
  draft_content: 'Draft content',
  payment_review: 'Payment review',
  payments: 'Payments',
  ready_groups: 'Ready groups',
  saved_items: 'Saved items',
  messages: 'Messages',
  content: 'Content',
  access: 'Access',
  live_sessions: 'Live',
  admin: 'Admin',
  in_progress: 'In progress',
  expired: 'Expired',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  true: 'True',
  unread_notifications: 'Unread notif.',
}

const contentReadinessKeys = new Set([
  'subjects',
  'topics',
  'topic_items',
  'tab_contents',
  'resources',
  'exams',
  'exam_problems',
])

export default function AdminStatisticsPage() {
  const [overview, setOverview] = useState<AdminOverview>(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    getJson<AdminOverview>('/admin/overview')
      .then((response) => {
        if (!alive) return
        setOverview(response ?? EMPTY_OVERVIEW)
      })
      .catch(() => {
        if (!alive) return
        setOverview(EMPTY_OVERVIEW)
        setError('Could not load admin statistics.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [nonce])

  const contentReadiness = useMemo(
    () => Object.entries(overview.content_status ?? {})
      .filter(([key]) => contentReadinessKeys.has(key))
      .map(([key, statuses]) => ({
        key,
        label: DOMAIN_LABELS[key] ?? titleCase(key),
        total: sumValues(statuses),
        ratio: publishedRatio(statuses),
        statuses,
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total),
    [overview.content_status],
  )
  const filteredCatalog = useMemo(
    () => filterCrudCatalog(overview.crud_catalog, query),
    [overview.crud_catalog, query],
  )
  const catalogByDomain = useMemo(() => groupByDomain(filteredCatalog), [filteredCatalog])

  const totals = overview.totals ?? {}
  const engagement = overview.engagement ?? {}
  const progress = overview.progress_xp ?? {}
  const examBank = overview.exam_bank ?? {}
  const calendar = overview.calendar ?? {}
  const notifications = overview.notifications ?? {}
  const access = overview.access_billing ?? {}
  const audit = overview.admin_audit ?? {}
  const readiness = overview.ops_readiness ?? {}
  const finance = overview.finance ?? {}
  const communications = overview.communications ?? {}
  const pendingPayments = numberValue(finance.pending_manual_review) + numberValue(finance.pending_provider)
  const communicationAttention =
    numberValue(communications.chat_unread_for_professors) +
    numberValue(communications.pending_live_interactions) +
    numberValue(communications.open_reports)
  const publishedContent = contentReadiness.reduce((sum, item) => sum + numberValue(item.statuses.published), 0)
  const draftContent = contentReadiness.reduce((sum, item) => sum + numberValue(item.statuses.draft), 0)
  const scheduledContent = contentReadiness.reduce((sum, item) => sum + numberValue(item.statuses.scheduled), 0)
  const activeContent = contentReadiness.reduce((sum, item) => sum + numberValue(item.statuses.active), 0)
  const readyContent = publishedContent + scheduledContent + activeContent
  const blockedContent = Math.max(0, contentReadiness.reduce((sum, item) => sum + item.total, 0) - readyContent)
  const communitySignals = {
    notes: numberValue(totals.notes),
    saved_items: numberValue(totals.saved_items),
    comments: numberValue(totals.comments),
    notifications: numberValue(totals.notifications),
  }
  const contentRecordTotal = contentReadiness.reduce((sum, item) => sum + item.total, 0)
  const readinessAverage = contentReadiness.length
    ? Math.round(contentReadiness.reduce((sum, item) => sum + item.ratio, 0) / contentReadiness.length)
    : 0
  const learningSignals = [
    { label: 'Active 7d', value: numberValue(engagement.active_users_7d), detail: `${percent(engagement.quiz_attempt_pass_rate)} pass` },
    { label: 'Watch min', value: numberValue(engagement.total_watch_minutes), detail: 'video' },
    { label: 'Quiz avg', value: numberValue(engagement.average_quiz_attempt_score), detail: 'score' },
    { label: 'XP total', value: numberValue(progress.total_xp), detail: 'earned' },
  ]
  const contentPipeline = [
    { label: 'Published', value: publishedContent, color: 'var(--primary)' },
    { label: 'Scheduled', value: scheduledContent, color: '#16a34a' },
    { label: 'Draft', value: draftContent, color: '#f59e0b' },
    { label: 'Other', value: Math.max(0, blockedContent - draftContent), color: '#94a3b8' },
  ].filter((item) => item.value > 0)
  const operationCards = [
    { label: 'Messages', value: communicationAttention, detail: 'private chat, live Q&A, reports', tone: communicationAttention ? 'warn' : 'good' },
    { label: 'Payments', value: pendingPayments, detail: 'manual/provider review', tone: pendingPayments ? 'warn' : 'good' },
    { label: 'Draft content', value: draftContent, detail: 'not publish-ready', tone: draftContent ? 'warn' : 'good' },
    { label: 'Unread alerts', value: numberValue(notifications.unread), detail: 'notification queue', tone: numberValue(notifications.unread) ? 'warn' : 'good' },
  ] as const
  const adminActivityMix = summarizeAuditActions(asRecord(audit.by_action))

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={BarChart3}
        title="Analytics"
        syncLabel={overview.generated_at ? `Last sync: ${new Date(overview.generated_at).toLocaleString('fr-FR')}` : undefined}
        action={<AdminRefreshButton loading={loading} onClick={() => setNonce((value) => value + 1)} />}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripClass}>
        <StatTile icon={Layers3} label="Content ready" value={`${formatNumber(readinessAverage)}%`} hint={`${formatNumber(contentRecordTotal)} records`} loading={loading} />
        <StatTile icon={Activity} label="Active 7d" value={formatNumber(engagement.active_users_7d)} hint={`${percent(engagement.quiz_attempt_pass_rate)} quiz pass`} loading={loading} />
        <StatTile icon={Bell} label="Attention" value={formatNumber(communicationAttention + pendingPayments + draftContent)} hint="messages, payments, drafts" loading={loading} />
        <StatTile icon={ShieldCheck} label="Changes 7d" value={formatNumber(audit.created_7d)} hint={`${formatNumber(audit.total)} logged`} loading={loading} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Section title="Content health">
          <ContentHealthBoard
            items={contentReadiness}
            average={readinessAverage}
            total={contentRecordTotal}
            ready={readyContent}
            blocked={blockedContent}
            pipeline={contentPipeline}
          />
        </Section>

        <Section title="Learning signal">
          <LearningSignalBoard
            stats={learningSignals}
            progress={recordEntries(asRecord(progress.topic_item_progress_by_status), 5)}
            difficulty={recordEntries(asRecord(examBank.problems_by_difficulty), 5)}
          />
        </Section>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Section title="Operations queue">
          <OperationsQueue cards={operationCards} />
        </Section>

        <Section title="Student activity">
          <SignalDistribution
            primary={{ label: 'Community actions', value: sumValues(communitySignals) }}
            data={recordEntries(communitySignals, 6)}
          />
        </Section>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Section title="Finance">
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
            <HeroMetric icon={ReceiptText} label="Paid revenue" value={formatMoneyCentimes(finance.paid_revenue_centimes)} tone="good" />
            <MiniMetric label="Needs review" value={formatNumber(pendingPayments)} tone={pendingPayments ? 'warn' : 'default'} />
            <MiniMetric label="Anomalies" value={formatNumber(finance.failed_or_mismatch)} tone={numberValue(finance.failed_or_mismatch) ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RankedList title="Payment status" data={recordEntries(asRecord(finance.transactions_by_status), 6)} />
            <RankedList title="Provider events" data={recordEntries(asRecord(finance.provider_events_by_status), 6)} />
          </div>
        </Section>

        <Section title="Private messages">
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <MiniMetric label="Attention" value={formatNumber(communicationAttention)} tone={communicationAttention ? 'warn' : 'default'} />
            <MiniMetric label="Messages 7d" value={formatNumber(communications.chat_messages_7d)} />
            <HeroMetric icon={MessageSquareText} label="Open reports" value={formatNumber(communications.open_reports)} tone={numberValue(communications.open_reports) ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <RankedList title="Chats" data={recordEntries(asRecord(communications.chat_conversations_by_status), 5)} />
            <RankedList title="Live Q&A" data={recordEntries(asRecord(communications.live_interactions_by_status), 5)} />
            <RankedList title="Reports" data={recordEntries(asRecord(communications.reports_by_status), 5)} />
          </div>
        </Section>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <Section title="Access">
          <div className="grid gap-4">
            <RankedList title="Users by role" data={recordEntries(asRecord(access.users_by_role), 5)} />
            <RankedList title="Entitlements" data={recordEntries(asRecord(access.entitlements_by_status), 5)} />
            <MiniMetric label="Gated content" value={formatNumber(readiness.gated_content_total ?? access.gated_content)} />
          </div>
        </Section>

        <Section title="Calendar">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <HeroMetric icon={CalendarDays} label="Upcoming" value={formatNumber(calendar.upcoming_events)} />
            <MiniMetric label="Live events" value={formatNumber(calendar.live_events)} />
          </div>
          <div className="grid gap-4">
            <RankedList title="Events" data={recordEntries(asRecord(calendar.events_by_status), 5)} />
            <RankedList title="Notifications" data={recordEntries(asRecord(notifications.by_type), 5)} />
          </div>
        </Section>

        <Section title="Admin activity">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <MiniMetric label="Logged" value={formatNumber(audit.total)} />
            <MiniMetric label="Unread notif." value={formatNumber(notifications.unread)} tone={numberValue(notifications.unread) ? 'warn' : 'default'} />
          </div>
          <SignalDistribution primary={{ label: '7d changes', value: numberValue(audit.created_7d) }} data={adminActivityMix} />
        </Section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className={adminPanelHeaderClass}>
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Data editor</h2>
          </div>
          <AdminSearchBox value={query} onChange={setQuery} placeholder="Search models" label="Search admin models" className="lg:w-[340px]" />
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2 xl:grid-cols-3">
          {Object.entries(catalogByDomain).map(([domain, items]) => (
            <CatalogDomain key={domain} domain={domain} items={items} />
          ))}
          {!filteredCatalog.length && <EmptyState label="-" />}
        </div>
      </section>
    </main>
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
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46]">{loading ? '-' : value}</p>
      <p className="m-0 mt-2 truncate text-[12px] font-bold text-[#a1a1aa]">{hint}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AdminPanel title={title}>
      {children}
    </AdminPanel>
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

function HeroMetric({ icon: Icon, label, value, tone = 'default' }: { icon: LucideIcon; label: string; value: ReactNode; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'warn' ? 'text-[#f5900b]' : tone === 'good' ? 'text-[#16a34a]' : 'text-[#3f3f46]'
  return (
    <div className="flex min-h-[84px] items-center gap-3 rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] px-4 py-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
        <span className={`mt-1 block truncate text-[22px] font-black leading-none ${toneClass}`}>{value}</span>
      </span>
    </div>
  )
}

function ContentHealthBoard({
  items,
  average,
  total,
  ready,
  blocked,
  pipeline,
}: {
  items: Array<{ key: string; label: string; total: number; ratio: number; statuses: Record<string, number> }>
  average: number
  total: number
  ready: number
  blocked: number
  pipeline: Array<{ label: string; value: number; color: string }>
}) {
  const topItems = items.slice(0, 6)
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="rounded-[16px] border border-[#edf1f7] bg-[#fbfcfe] p-4">
        <div
          className="mx-auto grid h-36 w-36 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--primary) ${average * 3.6}deg, #eef2f7 0deg)` }}
        >
          <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-sm">
            <span>
              <span className="block text-[28px] font-black leading-none text-[#111827]">{formatNumber(average)}%</span>
              <span className="mt-1 block text-[10px] font-black uppercase text-[#a1a1aa]">ready</span>
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniMetric label="Records" value={formatNumber(total)} />
          <MiniMetric label="Groups" value={formatNumber(items.length)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniMetric label="Ready" value={formatNumber(ready)} tone="good" />
          <MiniMetric label="Blocked" value={formatNumber(blocked)} tone={blocked ? 'warn' : 'good'} />
        </div>
      </div>
      <div className="grid gap-4">
        <StackedSegments data={pipeline} />
        <div className="grid gap-3 sm:grid-cols-2">
          {topItems.map((item) => (
            <div key={item.key} className="rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="m-0 min-w-0 truncate text-[13px] font-black text-[#3f3f46]">{item.label}</p>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#71717a]">{formatNumber(item.total)}</span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white">
                <span className="h-full rounded-full bg-[color:var(--primary)]" style={{ width: `${item.ratio}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {recordEntries(item.statuses, 3).map((status) => (
                  <span key={status.key} className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#71717a]">
                    {statusLabels[status.key] ?? titleCase(status.key)} {formatNumber(status.value)}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!topItems.length && <EmptyState label="-" compact />}
        </div>
      </div>
    </div>
  )
}

function LearningSignalBoard({
  stats,
  progress,
  difficulty,
}: {
  stats: Array<{ label: string; value: number; detail: string }>
  progress: Array<{ key: string; value: number }>
  difficulty: Array<{ key: string; value: number }>
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] px-4 py-3">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{stat.label}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="m-0 text-[26px] font-black leading-none text-[#111827]">{formatNumber(stat.value)}</p>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#71717a]">{stat.detail}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniColumnChart title="Progress" data={progress} />
        <MiniColumnChart title="Difficulty" data={difficulty} tone="warn" />
      </div>
    </div>
  )
}

function MiniColumnChart({ title, data, tone = 'default' }: { title: string; data: Array<{ key: string; value: number }>; tone?: 'default' | 'warn' }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const chartLabel = `${title}: ${formatNumber(total)} total`
  return (
    <div className="rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{title}</p>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#71717a] tabular-nums">
          {formatNumber(total)} total
        </span>
      </div>
      {data.length ? (
        <div className="relative mt-4 h-40 rounded-[14px] bg-white px-3 pb-3 pt-5 shadow-[var(--shadow-border)]" role="img" aria-label={chartLabel}>
          <div aria-hidden="true" className="absolute inset-x-3 top-5 grid h-24 grid-rows-4">
            {[0, 1, 2, 3].map((line) => (
              <span key={line} className="border-t border-[#eef2f7]" />
            ))}
          </div>
          <div className="relative z-10 flex h-full items-end gap-2">
            {data.map((item) => (
              <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="text-[12px] font-black text-[#3f3f46] tabular-nums">{formatNumber(item.value)}</span>
                <div
                  className={`w-full max-w-[32px] rounded-t-[8px] ${tone === 'warn' ? 'bg-[#f59e0b]' : 'bg-[color:var(--primary)]'}`}
                  style={{ height: `${Math.max(8, (item.value / max) * 100)}%` }}
                />
                <span className="max-w-full truncate text-[10px] font-bold uppercase text-[#a1a1aa]">{statusLabels[item.key] ?? titleCase(item.key)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyState label="-" compact />}
    </div>
  )
}

function OperationsQueue({
  cards,
}: {
  cards: ReadonlyArray<{ label: string; value: number; detail: string; tone: 'warn' | 'good' }>
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((item) => (
        <div key={item.label} className="rounded-[16px] border border-[#edf1f7] bg-[#fbfcfe] p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="m-0 text-[13px] font-black text-[#3f3f46]">{item.label}</p>
            <span className={`h-2.5 w-2.5 rounded-full ${item.tone === 'warn' ? 'bg-[#f59e0b]' : 'bg-[#16a34a]'}`} />
          </div>
          <p className={`m-0 mt-4 text-[34px] font-black leading-none ${item.tone === 'warn' ? 'text-[#f5900b]' : 'text-[#16a34a]'}`}>{formatNumber(item.value)}</p>
          <p className="m-0 mt-2 text-[12px] font-bold text-[#71717a]">{item.detail}</p>
        </div>
      ))}
    </div>
  )
}

function SignalDistribution({
  primary,
  data,
}: {
  primary: { label: string; value: number }
  data: Array<{ key: string; value: number }>
}) {
  const colors = ['var(--primary)', '#16a34a', '#f59e0b', '#0ea5e9', '#94a3b8']
  const segments = data.map((item, index) => ({
    label: statusLabels[item.key] ?? titleCase(item.key),
    value: item.value,
    color: colors[index % colors.length],
  }))
  return (
    <div className="grid min-w-0 gap-4">
      <div className="min-w-0 rounded-[16px] border border-[#edf1f7] bg-[#fbfcfe] p-4">
        <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{primary.label}</p>
        <p className="m-0 mt-2 text-[34px] font-black leading-none text-[#111827]">{formatNumber(primary.value)}</p>
      </div>
      <div className="min-w-0 rounded-[16px] border border-[#edf1f7] bg-[#fbfcfe] p-4">
        <StackedSegments data={segments} />
      </div>
    </div>
  )
}

function StackedSegments({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (!total) return <EmptyState label="-" compact />
  return (
    <div className="min-w-0">
      <div className="flex h-4 overflow-hidden rounded-full bg-white">
        {data.map((item) => (
          <span
            key={item.label}
            className="h-full"
            style={{ width: `${Math.max(2, (item.value / total) * 100)}%`, backgroundColor: item.color }}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[10px] bg-white px-3 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate text-[12px] font-bold text-[#52525c]">{item.label}</span>
            </span>
            <span className="shrink-0 text-[12px] font-black text-[#3f3f46]">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankedList({ title, data }: { title: string; data: Array<{ key: string; value: number }> }) {
  return (
    <div className="rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
      <p className="m-0 mb-2 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{title}</p>
      <div className="grid gap-1.5">
        {data.map((item) => (
          <div key={item.key} className="flex min-h-9 items-center justify-between gap-3 rounded-[10px] bg-white px-3 py-2">
            <span className="min-w-0 truncate text-[12.5px] font-bold text-[#52525c]">{statusLabels[item.key] ?? titleCase(item.key)}</span>
            <span className="shrink-0 text-[13px] font-black text-[#3f3f46]">{formatNumber(item.value)}</span>
          </div>
        ))}
        {!data.length && <EmptyState label="-" compact />}
      </div>
    </div>
  )
}

function CatalogDomain({ domain, items }: { domain: string; items: CrudCatalogItem[] }) {
  return (
    <div className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 truncate text-[14px] font-black text-[#3f3f46]">{DOMAIN_LABELS[domain] ?? titleCase(domain)}</h3>
          <p className="m-0 mt-0.5 text-[12px] font-bold text-[#a1a1aa]">{formatNumber(items.length)} model(s)</p>
        </div>
        <Database size={16} className="shrink-0 text-[#a1a1aa]" />
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <a
            key={item.model}
            href={getBackendUrl(item.admin_url)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-[10px] border border-[#f4f4f5] bg-white px-3 py-2 no-underline transition-[border-color] duration-150 ease-out hover:border-[color:var(--primary)]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-black text-[#52525c]">{item.name_plural}</span>
              <span className="block truncate text-[12px] font-semibold text-[#a1a1aa]">{item.model}</span>
            </span>
            <span className="shrink-0 rounded-full bg-[color:var(--primary-soft)] px-2 py-1 text-[11px] font-black text-[color:var(--primary)]">
              {item.actions.update ? 'CRUD' : 'Read'}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ compact = false }: { label: string; compact?: boolean }) {
  return (
    <p className={`m-0 rounded-[12px] border border-dashed border-[#e4e4e7] text-center text-[13px] font-semibold text-[#a1a1aa] ${compact ? 'px-3 py-4' : 'px-4 py-8'}`}>
      -
    </p>
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function summarizeAuditActions(record: Record<string, unknown>) {
  const buckets = {
    messages: 0,
    payments: 0,
    content: 0,
    access: 0,
    live_sessions: 0,
    admin: 0,
  }

  Object.entries(record).forEach(([key, value]) => {
    const normalized = key.toLowerCase()
    const amount = numberValue(value)
    if (!amount) return

    if (normalized.includes('message') || normalized.includes('chat') || normalized.includes('report')) {
      buckets.messages += amount
    } else if (normalized.includes('payment') || normalized.includes('transaction') || normalized.includes('finance')) {
      buckets.payments += amount
    } else if (normalized.includes('permission') || normalized.includes('user') || normalized.includes('login')) {
      buckets.access += amount
    } else if (normalized.includes('live') || normalized.includes('session') || normalized.includes('stream')) {
      buckets.live_sessions += amount
    } else if (normalized.includes('content') || normalized.includes('course') || normalized.includes('topic') || normalized.includes('exam')) {
      buckets.content += amount
    } else {
      buckets.admin += amount
    }
  })

  return recordEntries(buckets, 6)
}

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
