'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowRight,
  Banknote,
  ClipboardCheck,
  Database,
  FileQuestion,
  FileText,
  GraduationCap,
  KeyRound,
  LibraryBig,
  MessageSquareText,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  AdminAlert,
  AdminPageHeader,
  AdminPanel,
  AdminRefreshButton,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
  adminSubtlePanelClass,
} from '@/components/admin/AdminDesign'
import { getJson } from '@/lib/apiClient'
import { getAdminRootUrl } from '@/lib/apiConfig'
import { listAdminChangeRequests, type AdminChangeRequestListItem } from '@/lib/studio'
import {
  EMPTY_OVERVIEW,
  DOMAIN_LABELS,
  formatMoneyCentimes,
  formatNumber,
  numberValue,
  percent,
  publishedRatio,
  recordEntries,
  type AdminOverview,
  type LoadState,
} from '@/lib/adminOverview'

const card = adminPanelClass
const READINESS_WIDTH_CLASSES = [
  'w-[4%]',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  answered: 'Answered',
  cancelled: 'Cancelled',
  completed: 'Completed',
  draft: 'Draft',
  expired: 'Expired',
  failed: 'Failed',
  in_review: 'In review',
  live: 'Live',
  mismatch: 'Mismatch',
  open: 'Open',
  paid: 'Paid',
  pending: 'Pending',
  pending_manual_review: 'Manual review',
  pending_provider: 'Provider pending',
  processed: 'Processed',
  published: 'Published',
  refunded: 'Refunded',
  requested: 'Requested',
  resolved: 'Resolved',
  scheduled: 'Scheduled',
  sent: 'Sent',
  submitted: 'Submitted',
  urgent: 'Urgent',
}

function readinessWidthClass(pct: number) {
  if (pct >= 100) return 'w-full'
  if (pct <= 0) return READINESS_WIDTH_CLASSES[0]
  const bucket = Math.max(1, Math.min(19, Math.round(pct / 5)))
  return READINESS_WIDTH_CLASSES[bucket]
}

function sectionRecord(section: Record<string, unknown> | undefined, key: string) {
  const value = section?.[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function metric(section: Record<string, unknown> | undefined, key: string) {
  return numberValue(section?.[key])
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: string
  loading: boolean
}) {
  return (
    <div className={adminMetricTileClass}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#f0f0ff] text-[#5b60f9]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[26px] font-black leading-none text-[#3f3f46]">{loading ? '-' : value}</p>
      {hint && <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">{hint}</p>}
    </div>
  )
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'warn' ? 'text-[#f5900b]' : tone === 'good' ? 'text-[#16a34a]' : 'text-[#3f3f46]'
  return (
    <div className={`${adminSubtlePanelClass} px-3 py-2.5`}>
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[18px] font-black leading-none ${toneClass}`}>{value}</p>
    </div>
  )
}

function BarList({
  title,
  data,
  emptyLabel,
}: {
  title?: string
  data: Array<{ key: string; value: number }>
  emptyLabel: string
}) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div>
      {title && <p className="m-0 mb-2 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{title}</p>}
      {data.length ? (
        <div className="grid gap-2.5">
          {data.map((item) => {
            const pct = Math.max(5, Math.round((item.value / max) * 100))
            return (
              <div key={item.key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px] font-bold">
                  <span className="truncate text-[#52525c]">{STATUS_LABELS[item.key] ?? item.key}</span>
                  <span className="text-[#a1a1aa]">{formatNumber(item.value)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#f4f4f5]">
                  <div className="h-full rounded-full bg-[#5b60f9]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-4 text-center text-[13px] font-semibold text-[#a1a1aa]">
          {emptyLabel}
        </p>
      )}
    </div>
  )
}

function ReadinessBar({ label, ratio }: { label: string; ratio: number }) {
  const pct = Math.round(ratio)
  const widthClass = readinessWidthClass(pct)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12.5px] font-bold">
        <span className="text-[#52525c]">{label}</span>
        <span className="text-[#a1a1aa]">{pct}% publié</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#f4f4f5]">
        <div className={`h-full rounded-full bg-[#5b60f9] ${widthClass}`} />
      </div>
    </div>
  )
}

function QueueItem({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint: string
  href?: string
  tone?: 'default' | 'warn' | 'good'
}) {
  const valueClass = tone === 'warn' ? 'text-[#f5900b]' : tone === 'good' ? 'text-[#16a34a]' : 'text-[#3f3f46]'
  const content = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f0ff] text-[#5b60f9]">
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-black text-[#52525c]">{label}</span>
        <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#a1a1aa]">{hint}</span>
      </span>
      <span className={`shrink-0 text-[20px] font-black leading-none ${valueClass}`}>{value}</span>
      {href && <ArrowRight size={15} className="shrink-0 text-[#d4d4d8]" />}
    </>
  )

  const className = 'flex items-center gap-3 rounded-[13px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-3 no-underline transition hover:border-[#d4d4d8] hover:bg-white'
  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <AdminPanel title={title} subtitle={subtitle}>
      {children}
    </AdminPanel>
  )
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview>(EMPTY_OVERVIEW)
  const [state, setState] = useState<LoadState>('loading')
  const [reviews, setReviews] = useState<AdminChangeRequestListItem[]>([])
  const [nonce, setNonce] = useState(0)
  const root = useMemo(getAdminRootUrl, [])

  useEffect(() => {
    let alive = true
    setState('loading')
    getJson<AdminOverview>('/admin/overview')
      .then((data) => { if (alive) { setOverview(data ?? EMPTY_OVERVIEW); setState('ready') } })
      .catch((error) => { if (alive) setState(error?.response?.status === 403 ? 'forbidden' : 'fallback') })
    listAdminChangeRequests('pending').then((items) => { if (alive) setReviews(items) }).catch(() => {})
    return () => { alive = false }
  }, [nonce])

  const loading = state === 'loading'
  const totals = overview.totals
  const finance = overview.finance ?? {}
  const communications = overview.communications ?? {}
  const engagement = overview.engagement ?? {}
  const progress = overview.progress_xp ?? {}
  const access = overview.access_billing ?? {}
  const examBank = overview.exam_bank ?? {}
  const calendar = overview.calendar ?? {}
  const notifications = overview.notifications ?? {}
  const adminAudit = overview.admin_audit ?? {}

  const pendingOps = reviews.reduce((sum, r) => sum + (r.pending_count || r.operation_count), 0)
  const pendingPayments = metric(finance, 'pending_manual_review') + metric(finance, 'pending_provider')
  const unreadMessages = metric(communications, 'chat_unread_for_professors') + metric(communications, 'pending_live_interactions')
  const openReports = metric(communications, 'open_reports')
  const completedProgress = metric(progress, 'completed_topic_items') + metric(progress, 'completed_lessons')
  const activeUsers = metric(engagement, 'active_users_7d')

  const kpis = [
    { icon: Users, label: 'Utilisateurs', value: formatNumber(totals.users), hint: `${formatNumber(totals.pro_users)} pro` },
    { icon: Activity, label: 'Actifs 7j', value: formatNumber(activeUsers), hint: `${percent(engagement.quiz_attempt_pass_rate)} réussite quiz` },
    { icon: Banknote, label: 'Revenu payé', value: formatMoneyCentimes(finance.paid_revenue_centimes), hint: `${formatMoneyCentimes(finance.paid_revenue_7d_centimes)} sur 7j` },
    { icon: ShieldAlert, label: 'Paiements à traiter', value: formatNumber(pendingPayments), hint: `${formatNumber(metric(finance, 'failed_or_mismatch'))} échec/mismatch` },
    { icon: MessageSquareText, label: 'Messages à suivre', value: formatNumber(unreadMessages), hint: `${formatNumber(metric(communications, 'chat_messages_7d'))} messages sur 7j` },
    { icon: TrendingUp, label: 'Progression', value: formatNumber(completedProgress), hint: `${formatNumber(progress.total_xp)} XP total` },
  ]

  const readiness = Object.entries(overview.content_status ?? {})
    .map(([key, statuses]) => ({ label: DOMAIN_LABELS[key] ?? key, ratio: publishedRatio(statuses) }))
    .slice(0, 6)

  const shortcuts: [string, string, LucideIcon][] = [
    ['Contenu (chapitres)', `${root}/topic/list`, LibraryBig],
    ['Ressources', `${root}/resource/list`, FileText],
    ['Quiz', `${root}/questionset/list`, FileQuestion],
    ['Banque d’examens', `${root}/exam/list`, GraduationCap],
    ['Utilisateurs', `${root}/user/list`, Users],
    ['Accès / abonnements', `${root}/usersubjectentitlement/list`, KeyRound],
  ]

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Database}
        eyebrow="Admin / Overview"
        title="Operations overview"
        description="Payments, messages, student progress, content readiness and staff work in one operator view."
        syncLabel={overview.generated_at ? `Last sync: ${new Date(overview.generated_at).toLocaleString('fr-FR')}` : undefined}
        action={<AdminRefreshButton loading={loading} label="Refresh" onClick={() => setNonce((n) => n + 1)} />}
      />

      {state === 'fallback' && (
        <AdminAlert>Live analytics could not be loaded. Shortcuts remain available.</AdminAlert>
      )}

      <section className={`${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-6`}>
        {kpis.map((k) => <KpiTile key={k.label} {...k} loading={loading} />)}
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <SectionCard title="Files d’attention" subtitle="Ce qui demande une action staff maintenant.">
          <div className="grid gap-2.5">
            <QueueItem
              href="/admin/reviews"
              icon={ClipboardCheck}
              label={reviews.length > 0 ? `${reviews.length} demande(s) à réviser` : 'Aucune demande en attente'}
              value={formatNumber(pendingOps)}
              hint={reviews.length > 0 ? 'Opérations proposées par les professeurs' : 'Les nouvelles demandes professeurs apparaissent ici.'}
              tone={reviews.length > 0 ? 'warn' : 'good'}
            />
            <QueueItem
              href="/admin/finance"
              icon={Banknote}
              label="Paiements manuels"
              value={formatNumber(pendingPayments)}
              hint="Revue manuelle, provider en attente, remboursements et anomalies"
              tone={pendingPayments > 0 ? 'warn' : 'good'}
            />
            <QueueItem
              href="/admin/communications"
              icon={MessageSquareText}
              label="Messages et live"
              value={formatNumber(unreadMessages)}
              hint="Non lus professeurs + questions live en attente"
              tone={unreadMessages > 0 ? 'warn' : 'good'}
            />
            <QueueItem
              href="/admin/communications"
              icon={ShieldAlert}
              label="Signalements ouverts"
              value={formatNumber(openReports)}
              hint={`${formatNumber(metric(communications, 'urgent_open_reports'))} urgent(s), ${formatNumber(metric(communications, 'reports_created_7d'))} créés sur 7j`}
              tone={openReports > 0 ? 'warn' : 'good'}
            />
          </div>
        </SectionCard>

        <SectionCard title="Activité élèves" subtitle="Progression, quiz et engagement récents.">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <MiniMetric label="Actifs 7j" value={formatNumber(activeUsers)} />
            <MiniMetric label="Quiz pass" value={percent(engagement.quiz_attempt_pass_rate)} tone="good" />
            <MiniMetric label="Watch min" value={formatNumber(engagement.total_watch_minutes)} />
          </div>
          <div className="mt-4">
            <BarList
              title="Progression par statut"
              data={recordEntries(sectionRecord(progress, 'topic_item_progress_by_status'), 5)}
              emptyLabel="Aucune progression chargée."
            />
          </div>
        </SectionCard>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <SectionCard title="Paiements" subtitle="Statuts, revenu et santé provider.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Payé total" value={formatMoneyCentimes(finance.paid_revenue_centimes)} tone="good" />
            <MiniMetric label="En attente" value={formatNumber(pendingPayments)} tone={pendingPayments ? 'warn' : 'default'} />
            <MiniMetric label="Provider 7j" value={formatNumber(metric(finance, 'provider_events_7d'))} />
          </div>
          <BarList
            title="Transactions par statut"
            data={recordEntries(sectionRecord(finance, 'transactions_by_status'), 7)}
            emptyLabel="Aucune transaction chargée."
          />
        </SectionCard>

        <SectionCard title="Messages, live et support" subtitle="Conversation professeurs, Q&A live et signalements.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Non lus profs" value={formatNumber(communications.chat_unread_for_professors)} tone={metric(communications, 'chat_unread_for_professors') ? 'warn' : 'default'} />
            <MiniMetric label="Live maintenant" value={formatNumber(communications.live_sessions_live)} />
            <MiniMetric label="Questions live" value={formatNumber(communications.pending_live_interactions)} tone={metric(communications, 'pending_live_interactions') ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList
              title="Conversations"
              data={recordEntries(sectionRecord(communications, 'chat_conversations_by_status'), 4)}
              emptyLabel="Aucune conversation."
            />
            <BarList
              title="Signalements"
              data={recordEntries(sectionRecord(communications, 'reports_by_status'), 4)}
              emptyLabel="Aucun signalement."
            />
          </div>
        </SectionCard>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <SectionCard title="Utilisateurs et accès" subtitle="Rôles, abonnements et contenu sous contrôle d'accès.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Utilisateurs" value={formatNumber(totals.users)} />
            <MiniMetric label="Pro" value={formatNumber(totals.pro_users)} tone="good" />
            <MiniMetric label="Gated content" value={formatNumber(metric(access, 'gated_content'))} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList
              title="Rôles"
              data={recordEntries(sectionRecord(access, 'users_by_role'), 5)}
              emptyLabel="Aucun rôle chargé."
            />
            <BarList
              title="Abonnements"
              data={recordEntries(sectionRecord(access, 'entitlements_by_status'), 5)}
              emptyLabel="Aucun abonnement chargé."
            />
          </div>
        </SectionCard>

        <SectionCard title="Examens et calendrier" subtitle="Banque d'examens, solutions et événements à venir.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Problèmes" value={formatNumber(totals.exam_problems)} />
            <MiniMetric label="Solutions" value={formatNumber(metric(examBank, 'problems_with_written_solution') + metric(examBank, 'problems_with_video_solution'))} />
            <MiniMetric label="À venir" value={formatNumber(metric(calendar, 'upcoming_events'))} tone={metric(calendar, 'upcoming_events') ? 'good' : 'default'} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList
              title="Difficulté examens"
              data={recordEntries(sectionRecord(examBank, 'problems_by_difficulty'), 5)}
              emptyLabel="Aucune difficulté chargée."
            />
            <BarList
              title="Événements"
              data={recordEntries(sectionRecord(calendar, 'events_by_status'), 5)}
              emptyLabel="Aucun événement chargé."
            />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SectionCard title="Préparation du contenu" subtitle="Part de contenu publié par domaine.">
          <div className="flex flex-col gap-3.5">
            {readiness.length > 0 ? readiness.map((r) => <ReadinessBar key={r.label} {...r} />)
              : <p className="m-0 text-[13px] font-semibold text-[#a1a1aa]">Aucune donnée de contenu.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Gouvernance" subtitle="Notifications, audit admin et accès direct.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <MiniMetric label="Notif. non lues" value={formatNumber(notifications.unread)} tone={metric(notifications, 'unread') ? 'warn' : 'default'} />
            <MiniMetric label="Audit 7j" value={formatNumber(adminAudit.created_7d)} />
            <MiniMetric label="Exports ledger 7j" value={formatNumber(finance.ledger_entries_7d)} />
          </div>
          <div className="grid gap-2">
            {shortcuts.map(([label, href, Icon]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer"
                className="flex items-center justify-between rounded-[12px] border border-[#f4f4f5] px-3 py-2.5 no-underline transition hover:bg-[#fbfbfc]">
                <span className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#52525c]"><Icon size={16} className="text-[#a1a1aa]" /> {label}</span>
                <ArrowRight size={14} className="text-[#d4d4d8]" />
              </a>
            ))}
            <a href={root} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-black text-[#5b60f9] no-underline">
              <Database size={14} /> Ouvrir SQLAdmin
            </a>
          </div>
        </SectionCard>
      </div>
    </main>
  )
}
