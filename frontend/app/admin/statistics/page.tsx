'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Database,
  Layers3,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
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
  true: 'True',
}

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
  const draftContent = contentReadiness.reduce((sum, item) => sum + numberValue(item.statuses.draft), 0)
  const scheduledContent = contentReadiness.reduce((sum, item) => sum + numberValue(item.statuses.scheduled), 0)
  const readyGroups = contentReadiness.filter((item) => item.ratio >= 80).length
  const communitySignals = {
    notes: numberValue(totals.notes),
    saved_items: numberValue(totals.saved_items),
    comments: numberValue(totals.comments),
    notifications: numberValue(totals.notifications),
  }
  const operationalLoad = {
    payment_review: pendingPayments,
    communication_attention: communicationAttention,
    unread_notifications: numberValue(notifications.unread),
    draft_content: draftContent,
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={BarChart3}
        eyebrow="Admin / Stats"
        title="Statistics and operations"
        description="Content readiness, engagement, access, calendar, notifications, audit and SQLAdmin catalog."
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
        <StatTile icon={Layers3} label="Content records" value={formatNumber(contentReadiness.reduce((sum, item) => sum + item.total, 0))} hint={`${formatNumber(contentReadiness.length)} content groups`} loading={loading} />
        <StatTile icon={Activity} label="Active 7d" value={formatNumber(engagement.active_users_7d)} hint={`${percent(engagement.quiz_attempt_pass_rate)} quiz pass`} loading={loading} />
        <StatTile icon={Bell} label="Unread notif." value={formatNumber(notifications.unread)} hint={`${formatNumber(notifications.created_7d)} created 7d`} loading={loading} />
        <StatTile icon={ShieldCheck} label="Audit 7d" value={formatNumber(audit.created_7d)} hint={`${formatNumber(audit.total)} total audit rows`} loading={loading} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Section title="Content readiness" subtitle="Published, draft and scheduled content by model.">
          <div className="grid gap-3">
            {contentReadiness.slice(0, 9).map((item) => <ReadinessRow key={item.key} item={item} />)}
            {!contentReadiness.length && <EmptyState label="No content status rows loaded." />}
          </div>
        </Section>

        <Section title="Learning analytics" subtitle="Engagement, progress, XP and exam-bank depth.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Watch min" value={formatNumber(engagement.total_watch_minutes)} />
            <MiniMetric label="Avg quiz" value={formatNumber(engagement.average_quiz_attempt_score)} />
            <MiniMetric label="XP total" value={formatNumber(progress.total_xp)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Progress status" data={recordEntries(asRecord(progress.topic_item_progress_by_status), 5)} emptyLabel="No progress rows." />
            <BarList title="Exam difficulty" data={recordEntries(asRecord(examBank.problems_by_difficulty), 5)} emptyLabel="No exam difficulty rows." />
          </div>
        </Section>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Section title="Operational load" subtitle="Queues and attention signals that need staff follow-up.">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Payment review" value={formatNumber(operationalLoad.payment_review)} tone={operationalLoad.payment_review ? 'warn' : 'default'} />
            <MiniMetric label="Support attention" value={formatNumber(operationalLoad.communication_attention)} tone={operationalLoad.communication_attention ? 'warn' : 'default'} />
            <MiniMetric label="Draft content" value={formatNumber(operationalLoad.draft_content)} tone={operationalLoad.draft_content ? 'warn' : 'default'} />
            <MiniMetric label="Unread notif." value={formatNumber(operationalLoad.unread_notifications)} tone={operationalLoad.unread_notifications ? 'warn' : 'default'} />
          </div>
          <BarList title="Attention mix" data={recordEntries(operationalLoad, 6)} emptyLabel="No operational load rows." />
        </Section>

        <Section title="Community signals" subtitle="Student notes, saved items, comments and notification volume.">
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <MiniMetric label="Notes" value={formatNumber(communitySignals.notes)} />
            <MiniMetric label="Saved" value={formatNumber(communitySignals.saved_items)} />
            <MiniMetric label="Comments" value={formatNumber(communitySignals.comments)} />
            <MiniMetric label="Notif." value={formatNumber(communitySignals.notifications)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Community totals" data={recordEntries(communitySignals, 6)} emptyLabel="No community rows." />
            <BarList
              title="Content pipeline"
              data={recordEntries({ draft: draftContent, scheduled: scheduledContent, ready_groups: readyGroups }, 6)}
              emptyLabel="No pipeline rows."
            />
          </div>
        </Section>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Section title="Finance analytics" subtitle="Revenue, manual review load and provider health.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Paid revenue" value={formatMoneyCentimes(finance.paid_revenue_centimes)} tone="good" />
            <MiniMetric label="Needs review" value={formatNumber(pendingPayments)} tone={pendingPayments ? 'warn' : 'default'} />
            <MiniMetric label="Anomalies" value={formatNumber(finance.failed_or_mismatch)} tone={numberValue(finance.failed_or_mismatch) ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Payment status" data={recordEntries(asRecord(finance.transactions_by_status), 6)} emptyLabel="No payment status rows." />
            <BarList title="Provider events" data={recordEntries(asRecord(finance.provider_events_by_status), 6)} emptyLabel="No provider event rows." />
          </div>
        </Section>

        <Section title="Communication analytics" subtitle="Professor chat, live questions and support reports.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Attention" value={formatNumber(communicationAttention)} tone={communicationAttention ? 'warn' : 'default'} />
            <MiniMetric label="Messages 7d" value={formatNumber(communications.chat_messages_7d)} />
            <MiniMetric label="Open reports" value={formatNumber(communications.open_reports)} tone={numberValue(communications.open_reports) ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <BarList title="Chats" data={recordEntries(asRecord(communications.chat_conversations_by_status), 5)} emptyLabel="No chat rows." />
            <BarList title="Live Q&A" data={recordEntries(asRecord(communications.live_interactions_by_status), 5)} emptyLabel="No live rows." />
            <BarList title="Reports" data={recordEntries(asRecord(communications.reports_by_status), 5)} emptyLabel="No report rows." />
          </div>
        </Section>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <Section title="Access and billing" subtitle="Roles, tiers and gated content policy.">
          <div className="grid gap-4">
            <BarList title="Users by role" data={recordEntries(asRecord(access.users_by_role), 5)} emptyLabel="No user role rows." />
            <BarList title="Entitlements" data={recordEntries(asRecord(access.entitlements_by_status), 5)} emptyLabel="No entitlement rows." />
            <MiniMetric label="Gated content" value={formatNumber(readiness.gated_content_total ?? access.gated_content)} />
          </div>
        </Section>

        <Section title="Calendar and notifications" subtitle="Upcoming events and notification health.">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <MiniMetric label="Upcoming" value={formatNumber(calendar.upcoming_events)} />
            <MiniMetric label="Live events" value={formatNumber(calendar.live_events)} />
          </div>
          <div className="grid gap-4">
            <BarList title="Events" data={recordEntries(asRecord(calendar.events_by_status), 5)} emptyLabel="No event rows." />
            <BarList title="Notifications" data={recordEntries(asRecord(notifications.by_type), 5)} emptyLabel="No notification rows." />
          </div>
        </Section>

        <Section title="Governance" subtitle="Admin audit trail and operational readiness.">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <MiniMetric label="Audit total" value={formatNumber(audit.total)} />
            <MiniMetric label="Unread notif." value={formatNumber(notifications.unread)} tone={numberValue(notifications.unread) ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4">
            <BarList title="Audit actions" data={recordEntries(asRecord(audit.by_action), 5)} emptyLabel="No audit actions." />
            <BarList title="Audit models" data={recordEntries(asRecord(audit.by_model), 5)} emptyLabel="No audit models." />
          </div>
        </Section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#f4f4f5] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">SQLAdmin catalog</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">{formatNumber(filteredCatalog.length)} model(s) visible</p>
          </div>
          <AdminSearchBox value={query} onChange={setQuery} placeholder="Search models" label="Search admin models" className="lg:w-[340px]" />
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2 xl:grid-cols-3">
          {Object.entries(catalogByDomain).map(([domain, items]) => (
            <CatalogDomain key={domain} domain={domain} items={items} />
          ))}
          {!filteredCatalog.length && <EmptyState label="No admin models match this search." />}
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
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#f0f0ff] text-[#5b60f9]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46]">{loading ? '-' : value}</p>
      <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">{hint}</p>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={`${card} p-5`}>
      <div className="mb-4">
        <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">{title}</h2>
        <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">{subtitle}</p>
      </div>
      {children}
    </section>
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

function BarList({ title, data, emptyLabel }: { title: string; data: Array<{ key: string; value: number }>; emptyLabel: string }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div>
      <p className="m-0 mb-2 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{title}</p>
      {!data.length ? (
        <EmptyState label={emptyLabel} compact />
      ) : (
        <div className="grid gap-2.5">
          {data.map((item) => {
            const width = Math.max(5, Math.round((item.value / max) * 100))
            return (
              <div key={item.key}>
                <div className="mb-1 flex justify-between gap-3 text-[12.5px] font-bold">
                  <span className="truncate text-[#52525c]">{statusLabels[item.key] ?? titleCase(item.key)}</span>
                  <span className="text-[#a1a1aa]">{formatNumber(item.value)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#f4f4f5]">
                  <div className="h-full rounded-full bg-[#5b60f9]" style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ReadinessRow({ item }: { item: { label: string; total: number; ratio: number; statuses: Record<string, number> } }) {
  return (
    <div className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-[13px] font-black">
        <span className="truncate text-[#52525c]">{item.label}</span>
        <span className="text-[#a1a1aa]">{formatNumber(item.total)} rows</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#f4f4f5]">
        <div className="h-full rounded-full bg-[#5b60f9]" style={{ width: `${Math.max(4, item.ratio)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {recordEntries(item.statuses, 4).map((status) => (
          <span key={status.key} className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#71717a]">
            {statusLabels[status.key] ?? titleCase(status.key)} {formatNumber(status.value)}
          </span>
        ))}
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
            className="flex items-center justify-between gap-3 rounded-[10px] border border-[#f4f4f5] bg-white px-3 py-2 no-underline transition hover:border-[#5b60f9]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-black text-[#52525c]">{item.name_plural}</span>
              <span className="block truncate text-[12px] font-semibold text-[#a1a1aa]">{item.model}</span>
            </span>
            <span className="shrink-0 rounded-full bg-[#f0f0ff] px-2 py-1 text-[11px] font-black text-[#5b60f9]">
              {item.actions.update ? 'CRUD' : 'Read'}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <p className={`m-0 rounded-[12px] border border-dashed border-[#e4e4e7] text-center text-[13px] font-semibold text-[#a1a1aa] ${compact ? 'px-3 py-4' : 'px-4 py-8'}`}>
      {label}
    </p>
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ')
}
