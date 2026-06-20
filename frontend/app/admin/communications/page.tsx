'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BellDot,
  CircleAlert,
  MessageSquareText,
  RadioTower,
  ShieldAlert,
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
import { getJson, patchJson } from '@/lib/apiClient'
import { formatNumber, percent, recordEntries } from '@/lib/adminOverview'
import {
  EMPTY_ADMIN_COMMUNICATIONS,
  communicationAttentionTotal,
  urgentReportRate,
  type AdminChatConversation,
  type AdminCommunications,
  type AdminLiveInteraction,
  type AdminReportQueueItem,
} from '@/lib/adminCommunications'

const card = adminPanelClass

type TabKey = 'conversations' | 'live' | 'reports'

const tabLabels: Record<TabKey, string> = {
  conversations: 'Conversations',
  live: 'Live',
  reports: 'Reports',
}

const statusLabels: Record<string, string> = {
  open: 'Open',
  pending: 'Pending',
  stale_chats: 'Stale chats',
  stale_live: 'Stale live',
  unassigned_reports: 'Unassigned reports',
  answered: 'Answered',
  resolved: 'Resolved',
  in_review: 'In review',
  dismissed: 'Dismissed',
}

export default function AdminCommunicationsPage() {
  const [data, setData] = useState<AdminCommunications>(EMPTY_ADMIN_COMMUNICATIONS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabKey>('conversations')
  const [busyReportId, setBusyReportId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    getJson<AdminCommunications>('/admin/communications?limit=100')
      .then((response) => {
        if (!alive) return
        setData(response ?? EMPTY_ADMIN_COMMUNICATIONS)
      })
      .catch(() => {
        if (!alive) return
        setData(EMPTY_ADMIN_COMMUNICATIONS)
        setError('Impossible de charger les communications admin.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [nonce])

  async function updateReportStatus(report: AdminReportQueueItem, status: 'in_review' | 'resolved' | 'dismissed') {
    const body: { status: string; resolution_note?: string } = { status }
    if (status === 'resolved') body.resolution_note = 'Resolved from the admin communications board.'
    if (status === 'dismissed') body.resolution_note = 'Dismissed from the admin communications board.'

    setBusyReportId(report.report_id)
    setError('')
    try {
      await patchJson(`/admin/reports/${report.report_id}`, body)
      setData((current) => applyReportStatus(current, report.report_id, status))
    } catch {
      setError('Impossible de mettre a jour ce report.')
    } finally {
      setBusyReportId(null)
    }
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredConversations = useMemo(
    () => data.conversations.filter((item) => matchesConversation(item, normalizedQuery)),
    [data.conversations, normalizedQuery],
  )
  const filteredLive = useMemo(
    () => data.live_interactions.filter((item) => matchesLiveInteraction(item, normalizedQuery)),
    [data.live_interactions, normalizedQuery],
  )
  const filteredReports = useMemo(
    () => data.reports.filter((item) => matchesReport(item, normalizedQuery)),
    [data.reports, normalizedQuery],
  )

  const activeCount = tab === 'conversations'
    ? filteredConversations.length
    : tab === 'live'
      ? filteredLive.length
      : filteredReports.length
  const responsePressure = useMemo(() => buildResponsePressure(data), [data])

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={MessageSquareText}
        eyebrow="Admin / Messages"
        title="Communications"
        description="Staff view of professor conversations, live questions and open content reports."
        syncLabel={data.generated_at ? `Last sync: ${formatDate(data.generated_at, true)}` : undefined}
        action={<AdminRefreshButton loading={loading} label="Refresh" onClick={() => setNonce((value) => value + 1)} />}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripClass}>
        <StatTile icon={BellDot} label="Attention" value={formatNumber(communicationAttentionTotal(data.summary))} hint="messages, live, reports" loading={loading} />
        <StatTile icon={MessageSquareText} label="Non lus profs" value={formatNumber(data.summary.unread_for_professors)} hint={`${formatNumber(data.summary.messages_7d)} messages 7j`} loading={loading} />
        <StatTile icon={RadioTower} label="Questions live" value={formatNumber(data.summary.pending_live_interactions)} hint={`${formatNumber(data.summary.live_sessions_live)} sessions live`} loading={loading} />
        <StatTile icon={ShieldAlert} label="Reports ouverts" value={formatNumber(data.summary.open_reports)} hint={`${percent(urgentReportRate(data.summary))} urgents`} loading={loading} />
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Etat des queues</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Repartition par statut.</p>
          <div className="grid gap-4">
            <BarList title="Chats" data={recordEntries(data.chat_conversations_by_status, 5)} emptyLabel="Aucun chat." />
            <BarList title="Live" data={recordEntries(data.live_interactions_by_status, 5)} emptyLabel="Aucune interaction live." />
          </div>
        </section>

        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Support</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Priorite et statut des reports.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Statuts" data={recordEntries(data.reports_by_status, 5)} emptyLabel="Aucun report." />
            <BarList title="Priorites" data={recordEntries(data.reports_by_priority, 5)} emptyLabel="Aucune priorite." />
          </div>
        </section>
      </div>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Response pressure</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
              Stale conversations, unanswered live questions and reports without owners.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[12px] font-black ${responsePressure.total ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
            {formatNumber(responsePressure.total)} signal(s)
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Stale chats" value={formatNumber(responsePressure.staleConversations)} tone={responsePressure.staleConversations ? 'warn' : 'default'} />
            <MiniMetric label="Stale live" value={formatNumber(responsePressure.staleLiveInteractions)} tone={responsePressure.staleLiveInteractions ? 'warn' : 'default'} />
            <MiniMetric label="Unassigned" value={formatNumber(responsePressure.unassignedReports)} tone={responsePressure.unassignedReports ? 'warn' : 'default'} />
            <MiniMetric label="Urgent" value={formatNumber(responsePressure.urgentReports)} tone={responsePressure.urgentReports ? 'warn' : 'default'} />
          </div>
          <BarList
            title="Pressure mix"
            data={recordEntries({
              stale_chats: responsePressure.staleConversations,
              stale_live: responsePressure.staleLiveInteractions,
              unassigned_reports: responsePressure.unassignedReports,
              urgent: responsePressure.urgentReports,
              unread_professors: data.summary.unread_for_professors,
            }, 6)}
            emptyLabel="No response pressure rows."
          />
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#f4f4f5] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Files de communication</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">{formatNumber(activeCount)} ligne(s) affichee(s)</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex rounded-[12px] border-[2px] border-[#e4e4e7] bg-[#fbfbfc] p-1">
              {(Object.keys(tabLabels) as TabKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`h-8 rounded-[9px] px-3 text-[12px] font-black transition ${tab === key ? 'bg-white text-[#5b60f9] shadow-sm' : 'text-[#71717a] hover:text-[#3f3f46]'}`}
                >
                  {tabLabels[key]}
                </button>
              ))}
            </div>
            <AdminSearchBox value={query} onChange={setQuery} placeholder="Search" label="Rechercher dans les communications" className="md:w-[320px]" />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-0">
            {[1, 2, 3, 4].map((item) => <SkeletonRow key={item} />)}
          </div>
        ) : tab === 'conversations' ? (
          <ConversationList items={filteredConversations} />
        ) : tab === 'live' ? (
          <LiveInteractionList items={filteredLive} />
        ) : (
          <ReportList items={filteredReports} busyReportId={busyReportId} onStatusChange={updateReportStatus} />
        )}
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

function BarList({ title, data, emptyLabel }: { title: string; data: Array<{ key: string; value: number }>; emptyLabel: string }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div>
      <p className="m-0 mb-2 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{title}</p>
      {!data.length ? (
        <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-4 text-center text-[13px] font-semibold text-[#a1a1aa]">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2.5">
          {data.map((item) => {
            const width = Math.max(5, Math.round((item.value / max) * 100))
            return (
              <div key={item.key}>
                <div className="mb-1 flex justify-between gap-3 text-[12.5px] font-bold">
                  <span className="text-[#52525c]">{statusLabels[item.key] ?? item.key}</span>
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

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-3">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[20px] font-black leading-none ${tone === 'warn' ? 'text-[#f5900b]' : 'text-[#3f3f46]'}`}>{value}</p>
    </div>
  )
}

function ConversationList({ items }: { items: AdminChatConversation[] }) {
  if (!items.length) return <EmptyQueue icon={MessageSquareText} title="Aucune conversation trouvee." />
  return (
    <div className="divide-y divide-[#f4f4f5]">
      {items.map((item) => (
        <article key={item.conversation_id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={item.status} />
              <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">#{item.conversation_id}</span>
            </div>
            <h3 className="m-0 mt-2 truncate text-[15px] font-black text-[#3f3f46]">{item.student_name || `Student #${item.student_user_id}`}</h3>
            <p className="m-0 mt-1 truncate text-[13px] font-semibold text-[#71717a]">{item.course_title || `Offering #${item.course_offering_id}`}</p>
            <p className="m-0 mt-2 line-clamp-2 text-[13px] font-semibold text-[#a1a1aa]">{item.last_message_preview || 'Aucun apercu de message.'}</p>
          </div>
          <div className="grid content-start gap-2 text-[12px] font-bold text-[#71717a]">
            <span>Prof: {item.professor_name || `#${item.professor_user_id}`}</span>
            <span>Non lus prof: <strong className="text-[#f5900b]">{formatNumber(item.unread_for_professor)}</strong></span>
            <span>Non lus eleve: {formatNumber(item.unread_for_student)}</span>
            <span>{formatDate(item.last_message_at)}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function LiveInteractionList({ items }: { items: AdminLiveInteraction[] }) {
  if (!items.length) return <EmptyQueue icon={RadioTower} title="Aucune interaction live trouvee." />
  return (
    <div className="divide-y divide-[#f4f4f5]">
      {items.map((item) => (
        <article key={item.interaction_id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={item.status} />
              <span className="rounded-full bg-[#f4f4f5] px-2 py-1 text-[11px] font-black text-[#71717a]">{item.kind}</span>
            </div>
            <h3 className="m-0 mt-2 truncate text-[15px] font-black text-[#3f3f46]">{item.session_title || `Live #${item.live_session_id}`}</h3>
            <p className="m-0 mt-2 line-clamp-2 text-[13px] font-semibold text-[#52525c]">{item.body}</p>
            {item.answer && <p className="m-0 mt-2 line-clamp-2 text-[13px] font-semibold text-[#16a34a]">Reponse: {item.answer}</p>}
          </div>
          <div className="grid content-start gap-2 text-[12px] font-bold text-[#71717a]">
            <span>Eleve: {item.student_name || `#${item.student_user_id}`}</span>
            <span>Prof: {item.professor_name || `#${item.professor_user_id}`}</span>
            <span>{formatDate(item.created_at)}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function ReportList({
  items,
  busyReportId,
  onStatusChange,
}: {
  items: AdminReportQueueItem[]
  busyReportId: number | null
  onStatusChange: (report: AdminReportQueueItem, status: 'in_review' | 'resolved' | 'dismissed') => void
}) {
  if (!items.length) return <EmptyQueue icon={ShieldAlert} title="Aucun report trouve." />
  return (
    <div className="divide-y divide-[#f4f4f5]">
      {items.map((item) => (
        <article key={item.report_id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_230px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={item.status} />
              <PriorityPill value={item.priority} />
              <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">#{item.report_id}</span>
            </div>
            <h3 className="m-0 mt-2 truncate text-[15px] font-black text-[#3f3f46]">{item.title || `${item.target_type}:${item.target_id}`}</h3>
            <p className="m-0 mt-1 text-[13px] font-semibold text-[#71717a]">{item.reason} on {item.target_type}</p>
            <p className="m-0 mt-2 line-clamp-2 text-[13px] font-semibold text-[#a1a1aa]">{item.description || 'Aucune description.'}</p>
          </div>
          <div className="grid content-start gap-2 text-[12px] font-bold text-[#71717a]">
            <span>Reporter: {item.reporter_name || `#${item.reporter_user_id}`}</span>
            <span>Assignee: {item.assigned_to_name || 'Non assigne'}</span>
            <span>{formatDate(item.created_at)}</span>
            {(item.status === 'open' || item.status === 'in_review') && (
              <div className="mt-1 grid gap-1.5">
                {item.status === 'open' && (
                  <button
                    type="button"
                    disabled={busyReportId === item.report_id}
                    onClick={() => onStatusChange(item, 'in_review')}
                    className="h-8 rounded-[10px] border-[2px] border-[#e4e4e7] bg-white px-2 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9] disabled:opacity-50"
                  >
                    Start review
                  </button>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={busyReportId === item.report_id}
                    onClick={() => onStatusChange(item, 'resolved')}
                    className="h-8 rounded-[10px] bg-[#16a34a] px-2 text-[12px] font-black text-white transition hover:bg-[#15803d] disabled:opacity-50"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    disabled={busyReportId === item.report_id}
                    onClick={() => onStatusChange(item, 'dismissed')}
                    className="h-8 rounded-[10px] bg-[#71717a] px-2 text-[12px] font-black text-white transition hover:bg-[#52525c] disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  const open = value === 'open' || value === 'pending' || value === 'in_review'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${open ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
      {open && <CircleAlert size={12} />}
      {statusLabels[value] ?? value}
    </span>
  )
}

function PriorityPill({ value }: { value: string }) {
  const urgent = value === 'urgent' || value === 'high'
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-black ${urgent ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#f4f4f5] text-[#71717a]'}`}>
      {value || 'normal'}
    </span>
  )
}

function EmptyQueue({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="grid min-h-[260px] place-items-center p-8 text-center">
      <div>
        <Icon size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
        <p className="m-0 text-[15px] font-black text-[#3f3f46]">{title}</p>
        <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Essayez un autre filtre ou actualisez les donnees.</p>
      </div>
    </div>
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

function formatDate(value: string | null, includeTime = false) {
  if (!value) return 'Date inconnue'
  return new Date(value).toLocaleString('fr-FR', includeTime ? undefined : { dateStyle: 'medium' })
}

function matchesConversation(item: AdminChatConversation, query: string) {
  if (!query) return true
  return [
    item.student_name,
    item.professor_name,
    item.course_title,
    item.status,
    item.last_message_preview,
  ].join(' ').toLowerCase().includes(query)
}

function matchesLiveInteraction(item: AdminLiveInteraction, query: string) {
  if (!query) return true
  return [
    item.student_name,
    item.professor_name,
    item.session_title,
    item.kind,
    item.status,
    item.body,
    item.answer,
  ].join(' ').toLowerCase().includes(query)
}

function matchesReport(item: AdminReportQueueItem, query: string) {
  if (!query) return true
  return [
    item.title,
    item.description,
    item.reporter_name,
    item.assigned_to_name,
    item.reason,
    item.status,
    item.priority,
    item.target_type,
    item.target_id,
  ].join(' ').toLowerCase().includes(query)
}

function applyReportStatus(data: AdminCommunications, reportId: number, status: 'in_review' | 'resolved' | 'dismissed') {
  const previous = data.reports.find((report) => report.report_id === reportId)
  const reports = data.reports.map((report) => (
    report.report_id === reportId
      ? { ...report, status, updated_at: new Date().toISOString() }
      : report
  ))
  const openDelta = previous ? openReportDelta(previous.status, status) : 0
  const urgentDelta = previous?.priority === 'urgent' ? openDelta : 0
  return {
    ...data,
    reports,
    reports_by_status: moveCount(data.reports_by_status, previous?.status, status),
    summary: {
      ...data.summary,
      open_reports: Math.max(0, data.summary.open_reports + openDelta),
      urgent_open_reports: Math.max(0, data.summary.urgent_open_reports + urgentDelta),
    },
  }
}

function moveCount(record: Record<string, number>, from: string | undefined, to: string) {
  const next = { ...record }
  if (from) next[from] = Math.max(0, (next[from] ?? 0) - 1)
  next[to] = (next[to] ?? 0) + 1
  return next
}

function openReportDelta(from: string, to: string) {
  const wasOpen = from === 'open' || from === 'in_review'
  const isOpen = to === 'open' || to === 'in_review'
  if (wasOpen === isOpen) return 0
  return isOpen ? 1 : -1
}

function buildResponsePressure(data: AdminCommunications) {
  const now = Date.now()
  const staleConversations = data.conversations.filter((item) => (
    item.unread_for_professor > 0 && isOlderThanHours(item.last_message_at ?? item.updated_at, now, 12)
  )).length
  const staleLiveInteractions = data.live_interactions.filter((item) => (
    item.status === 'pending' && isOlderThanHours(item.created_at, now, 2)
  )).length
  const openReports = data.reports.filter((item) => item.status === 'open' || item.status === 'in_review')
  const unassignedReports = openReports.filter((item) => !item.assigned_to_user_id).length
  const urgentReports = openReports.filter((item) => item.priority === 'urgent' || item.priority === 'high').length

  return {
    staleConversations,
    staleLiveInteractions,
    unassignedReports,
    urgentReports,
    total: staleConversations + staleLiveInteractions + unassignedReports + urgentReports,
  }
}

function isOlderThanHours(value: string | null, now: number, hours: number) {
  if (!value) return true
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return true
  return now - timestamp >= hours * 60 * 60 * 1000
}
