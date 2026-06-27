'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Eye,
  KeyRound,
  MessageSquareText,
  ShieldCheck,
  Siren,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPanel,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  adminMetricStripFiveClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelHeaderClass,
} from '@/components/admin/AdminDesign'
import { getJson } from '@/lib/apiClient'
import { formatNumber } from '@/lib/adminOverview'
import {
  EMPTY_ADMIN_ACTIVITY,
  activityMatches,
  type AdminActivity,
  type AdminActivityEntry,
} from '@/lib/adminActivity'

type ActivityCategoryKey = 'access' | 'messages' | 'reports' | 'accounts' | 'content' | 'live' | 'system'
type ActivityLane = {
  key: ActivityCategoryKey
  label: string
  action: string
  icon: LucideIcon
  tone: 'default' | 'good' | 'warn'
  value: number
}

const activityCategories: Record<ActivityCategoryKey, Omit<ActivityLane, 'value'>> = {
  access: {
    key: 'access',
    label: 'Access & roles',
    action: 'Confirm permission and entitlement edits.',
    icon: KeyRound,
    tone: 'warn',
  },
  messages: {
    key: 'messages',
    label: 'Private messages',
    action: 'Check why transcripts were opened.',
    icon: MessageSquareText,
    tone: 'warn',
  },
  reports: {
    key: 'reports',
    label: 'Reports',
    action: 'Review unresolved or sensitive report work.',
    icon: Siren,
    tone: 'warn',
  },
  accounts: {
    key: 'accounts',
    label: 'Accounts',
    action: 'Confirm account status and student access edits.',
    icon: UserRound,
    tone: 'default',
  },
  content: {
    key: 'content',
    label: 'Content',
    action: 'Review publishing or course structure edits.',
    icon: Activity,
    tone: 'default',
  },
  live: {
    key: 'live',
    label: 'Live sessions',
    action: 'Check session edits, notifications, or stream access.',
    icon: Eye,
    tone: 'default',
  },
  system: {
    key: 'system',
    label: 'System',
    action: 'Watch for unusual work volume.',
    icon: ShieldCheck,
    tone: 'good',
  },
}

export default function AdminActivityPage() {
  const [data, setData] = useState<AdminActivity>(EMPTY_ADMIN_ACTIVITY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    getJson<AdminActivity>('/admin/activity?limit=120')
      .then((response) => {
        if (!alive) return
        setData(response ?? EMPTY_ADMIN_ACTIVITY)
      })
      .catch(() => {
        if (!alive) return
        setData(EMPTY_ADMIN_ACTIVITY)
        setError('Could not load operations health.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [nonce])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredEntries = useMemo(
    () => data.entries.filter((entry) => activityMatches(entry, normalizedQuery)),
    [data.entries, normalizedQuery],
  )
  const signals = useMemo(() => activitySignals(data.entries), [data.entries])
  const visibleSignals = useMemo(() => activitySignals(filteredEntries), [filteredEntries])
  const lanes = useMemo(() => activityLanes(filteredEntries), [filteredEntries])
  const reviewEntries = useMemo(() => filteredEntries.filter(isAttentionActivity).slice(0, 5), [filteredEntries])

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Activity}
        title="Operations health"
        syncLabel={data.generated_at ? `Last sync: ${new Date(data.generated_at).toLocaleString('fr-FR')}` : undefined}
        action={<AdminRefreshButton loading={loading} onClick={() => setNonce((value) => value + 1)} />}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripFiveClass}>
        <StatTile icon={Activity} label="Actions 24h" value={formatNumber(data.summary.created_24h)} loading={loading} />
        <StatTile icon={Siren} label="Needs check" value={formatNumber(signals.attentionCount)} loading={loading} />
        <StatTile icon={KeyRound} label="Access touched" value={formatNumber(signals.accessCount)} loading={loading} />
        <StatTile icon={Eye} label="Chats opened" value={formatNumber(signals.privateReadCount)} loading={loading} />
        <StatTile icon={UserRound} label="Team members" value={formatNumber(data.summary.actors_in_feed)} loading={loading} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <AdminPanel className="p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Action signals</h2>
            </div>
            <span className="rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-[12px] font-black text-[color:var(--primary)] tabular-nums">
              {formatNumber(filteredEntries.length)} shown
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SignalCard label="Needs confirmation" value={visibleSignals.attentionCount} detail="Access, report, or refund work to check." tone={visibleSignals.attentionCount ? 'warn' : 'good'} />
            <SignalCard label="Access touched" value={visibleSignals.accessCount} detail="Plans, permissions, or entitlements." tone={visibleSignals.accessCount ? 'warn' : 'default'} />
            <SignalCard label="Chats opened" value={visibleSignals.privateReadCount} detail="Private transcripts reviewed." tone={visibleSignals.privateReadCount ? 'warn' : 'default'} />
            <SignalCard label="Team members" value={visibleSignals.operatorCount} detail="People active in this feed." tone="default" />
          </div>
        </AdminPanel>

        <AdminPanel className="p-5">
          <h2 className="m-0 mb-4 text-[16px] font-black text-[#3f3f46]">Priority checks</h2>
          <ReviewQueue entries={reviewEntries} />
        </AdminPanel>
      </div>

      <AdminPanel className="mb-5 p-5">
        <h2 className="m-0 mb-4 text-[16px] font-black text-[#3f3f46]">Where work happened</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lanes.map((lane) => <LaneCard key={lane.key} lane={lane} />)}
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-hidden">
        <div className={adminPanelHeaderClass}>
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Action history</h2>
          </div>
          <AdminSearchBox value={query} onChange={setQuery} placeholder="Search team, access, report" label="Search action history" className="lg:w-[360px]" />
        </div>

        {loading ? (
          <div className="grid gap-0">
            {[1, 2, 3, 4].map((item) => <SkeletonRow key={item} />)}
          </div>
        ) : filteredEntries.length ? (
          <div className="divide-y divide-[#f4f4f5]">
            {filteredEntries.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
          </div>
        ) : (
          <div className="grid min-h-[260px] place-items-center p-8 text-center">
            <div>
              <ShieldCheck size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
              <p className="m-0 text-[15px] font-black text-[#3f3f46]">No matching activity.</p>
            </div>
          </div>
        )}
      </AdminPanel>
    </main>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  loading: boolean
}) {
  return (
    <div className={adminMetricTileClass}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46] tabular-nums">{loading ? '-' : value}</p>
    </div>
  )
}

function SignalCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'default' | 'good' | 'warn' }) {
  const toneClass = tone === 'good'
    ? 'border-[#dcfce7] bg-[#f0fdf4] text-[#16a34a]'
    : tone === 'warn'
      ? 'border-[#fed7aa] bg-[#fff7ed] text-[#f5900b]'
      : 'border-[#f4f4f5] bg-[#fbfbfc] text-[#3f3f46]'
  return (
    <div className={`rounded-[14px] border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[12px] font-black uppercase tracking-[0.04em] text-[#71717a]">{label}</p>
          <p className="m-0 mt-1 text-[12px] font-semibold text-[#71717a]">{detail}</p>
        </div>
        <span className="text-[24px] font-black leading-none tabular-nums">{formatNumber(value)}</span>
      </div>
    </div>
  )
}

function LaneCard({ lane }: { lane: ActivityLane }) {
  const Icon = lane.icon
  const toneClass = lane.tone === 'warn'
    ? 'bg-[#fff7ed] text-[#f5900b]'
    : lane.tone === 'good'
      ? 'bg-[#f0fdf4] text-[#16a34a]'
      : 'bg-[color:var(--primary-soft)] text-[color:var(--primary)]'

  return (
    <div className="rounded-[16px] bg-[#fbfbfc] p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${toneClass}`}>
          <Icon size={17} />
        </span>
        <span className="text-[24px] font-black leading-none text-[#111827] tabular-nums">{formatNumber(lane.value)}</span>
      </div>
      <h3 className="m-0 mt-3 text-[14px] font-black text-[#3f3f46]">{lane.label}</h3>
      <p className="m-0 mt-1 text-pretty text-[12px] font-semibold leading-snug text-[#71717a]">{lane.action}</p>
    </div>
  )
}

function ReviewQueue({ entries }: { entries: AdminActivityEntry[] }) {
  if (!entries.length) {
    return (
      <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-5 text-center text-[13px] font-semibold text-[#a1a1aa]">
        Nothing needs confirmation.
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[12.5px] font-black text-[#52525c]">{activityActionLabel(entry)}</span>
            <span className="shrink-0 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-black text-[#f5900b]">Review</span>
          </div>
          <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#a1a1aa]">{friendlyActivitySummary(entry)}</p>
          <p className="m-0 mt-2 text-[12px] font-black text-[#3f3f46]">{recommendedAction(entry)}</p>
        </div>
      ))}
    </div>
  )
}

function ActivityRow({ entry }: { entry: AdminActivityEntry }) {
  const visibleKeys = entry.changed_keys.filter((key) => key !== 'actor_user_id').slice(0, 5)
  const category = activityCategory(entry)
  return (
    <article className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <ActionPill entry={entry} />
          <span className="rounded-full bg-[#f4f4f5] px-2 py-1 text-[11px] font-black text-[#71717a]">{category.label}</span>
        </div>
        <h3 className="m-0 mt-2 truncate text-[15px] font-black text-[#3f3f46]">{friendlyActivitySummary(entry)}</h3>
        <p className="m-0 mt-1 truncate text-[13px] font-semibold text-[#71717a]">{formatDate(entry.created_at)}</p>
        <p className="m-0 mt-2 text-[12px] font-black text-[#3f3f46]">{recommendedAction(entry)}</p>
        {!!visibleKeys.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visibleKeys.map((key) => (
              <span key={key} className="rounded-full bg-[color:var(--primary-soft)] px-2 py-1 text-[11px] font-black text-[color:var(--primary)]">{fieldLabel(key)}</span>
            ))}
          </div>
        )}
      </div>
      <div className="grid content-start gap-2 text-[12px] font-bold text-[#71717a]">
        <span>{actorLabel(entry)}</span>
        <span className="truncate">{entrySummaryValue(entry)}</span>
      </div>
    </article>
  )
}

function ActionPill({ entry }: { entry: AdminActivityEntry }) {
  const warn = isAttentionActivity(entry)
  const good = entry.action.toLowerCase().includes('approve') || entry.action.toLowerCase().includes('resolve') || entry.action.toLowerCase().includes('grant')
  const className = warn
    ? 'bg-[#fef2f2] text-[#dc2626]'
    : good
      ? 'bg-[#f0fdf4] text-[#16a34a]'
      : 'bg-[#fff7ed] text-[#f5900b]'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-black ${className}`}>{activityActionLabel(entry)}</span>
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-t border-[#f4f4f5] px-5 py-4 first:border-t-0">
      <div className="h-10 w-10 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[12px] bg-[#f4f4f5]" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-56 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
        <div className="mt-2 h-3 w-72 max-w-full motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
      </div>
      <div className="hidden h-4 w-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5] sm:block" />
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return 'Date unknown'
  return new Date(value).toLocaleString('fr-FR')
}

function activitySignals(entries: AdminActivityEntry[]) {
  const actors = new Set<string>()
  let accessCount = 0
  let privateReadCount = 0

  for (const entry of entries) {
    const actor = actorLabel(entry)
    actors.add(actor)
    if (isAccessActivity(entry)) accessCount += 1
    if (activityCategory(entry).key === 'messages') privateReadCount += 1
  }

  return {
    attentionCount: entries.filter(isAttentionActivity).length,
    accessCount,
    privateReadCount,
    operatorCount: actors.size,
  }
}

function activityLanes(entries: AdminActivityEntry[]) {
  const counts: Record<ActivityCategoryKey, number> = {
    access: 0,
    messages: 0,
    reports: 0,
    accounts: 0,
    content: 0,
    live: 0,
    system: 0,
  }

  for (const entry of entries) {
    counts[activityCategory(entry).key] += 1
  }

  return Object.values(activityCategories)
    .map((lane) => ({ ...lane, value: counts[lane.key] }))
    .filter((lane) => lane.value > 0 || entries.length === 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 6)
}

function isAttentionActivity(entry: AdminActivityEntry) {
  const searchable = [
    entry.action,
    entry.model_name,
    entry.summary,
    entry.request_path,
    ...entry.changed_keys,
  ].join(' ').toLowerCase()
  return ['delete', 'revoke', 'reject', 'permission', 'refund', 'report', 'mismatch', 'failed'].some((term) => searchable.includes(term))
}

function isAccessActivity(entry: AdminActivityEntry) {
  const searchable = [
    entry.action,
    entry.model_name,
    ...entry.changed_keys,
  ].join(' ').toLowerCase()
  return ['permission', 'role', 'entitlement', 'access'].some((term) => searchable.includes(term))
}

function activityCategory(entry: AdminActivityEntry): ActivityLane {
  const searchable = [
    entry.action,
    entry.model_name,
    entry.summary,
    entry.request_path,
    ...entry.changed_keys,
  ].join(' ').toLowerCase()

  if (isAccessActivity(entry)) return { ...activityCategories.access, value: 0 }
  if (searchable.includes('private') || searchable.includes('professorchat') || searchable.includes('chat')) return { ...activityCategories.messages, value: 0 }
  if (searchable.includes('report')) return { ...activityCategories.reports, value: 0 }
  if (searchable.includes('student_account') || searchable.includes('user')) return { ...activityCategories.accounts, value: 0 }
  if (['content', 'course', 'topic', 'chapter', 'resource', 'exam', 'problem'].some((term) => searchable.includes(term))) return { ...activityCategories.content, value: 0 }
  if (searchable.includes('live')) return { ...activityCategories.live, value: 0 }
  return { ...activityCategories.system, value: 0 }
}

function activityActionLabel(entry: AdminActivityEntry) {
  const action = entry.action.toLowerCase()
  if (action.includes('permission_grant')) return 'Access granted'
  if (action.includes('permission_revoke')) return 'Access revoked'
  if (action.includes('read_private_messages')) return 'Private chat opened'
  if (action.includes('student_account_create')) return 'Student created'
  if (action.includes('student_account_update')) return 'Student updated'
  if (action.includes('report')) return 'Report updated'
  if (action.includes('login')) return 'Admin login'
  if (action.includes('approve')) return 'Approved'
  if (action.includes('reject')) return 'Rejected'
  if (action.includes('refund')) return 'Refund touched'
  return humanize(entry.action || 'activity')
}

function friendlyActivitySummary(entry: AdminActivityEntry) {
  const action = entry.action.toLowerCase()
  if (action.includes('permission_grant')) return `Permission granted${permissionSuffix(entry)}`
  if (action.includes('permission_revoke')) return `Permission revoked${permissionSuffix(entry)}`
  if (action.includes('read_private_messages')) return 'Private message transcript opened'
  if (action.includes('student_account_create')) return entry.object_repr || 'Student account created'
  if (action.includes('student_account_update')) return entry.object_repr || 'Student account updated'
  if (action.includes('report')) return cleanSummary(entry.summary) || 'Report updated'
  if (action.includes('login')) return 'Admin login'
  return cleanSummary(entry.summary) || entry.object_repr || activityCategory(entry).label
}

function permissionSuffix(entry: AdminActivityEntry) {
  const permission = entry.changed_data?.permission
  return typeof permission === 'string' ? `: ${permissionLabel(permission)}` : ''
}

function recommendedAction(entry: AdminActivityEntry) {
  const category = activityCategory(entry).key
  if (category === 'access') return 'Confirm the team member and permission are expected.'
  if (category === 'messages') return 'Confirm the private-chat review had a support reason.'
  if (category === 'reports') return 'Check resolution, owner, and whether follow-up is needed.'
  if (category === 'accounts') return 'Verify identity, plan, and active access.'
  if (category === 'content') return 'Check publish state and student-facing impact.'
  if (category === 'live') return 'Check schedule, notification, and stream access.'
  return 'No immediate action unless the volume looks abnormal.'
}

function entrySummaryValue(entry: AdminActivityEntry) {
  const permission = entry.changed_data?.permission
  if (typeof permission === 'string') return permissionLabel(permission)
  const status = entry.changed_data?.status
  if (typeof status === 'string') return `Status: ${humanize(status)}`
  return activityCategory(entry).action
}

function actorLabel(entry: AdminActivityEntry) {
  return entry.actor_user_id ? `Team member ${entry.actor_user_id}` : 'Unknown team member'
}

function permissionLabel(value: string) {
  const [area, action] = value.split(':').map((part) => humanize(part))
  if (!area || !action) return humanize(value)
  return `${titleCase(area)} ${action} access`
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    email: 'Email',
    full_name: 'Name',
    is_active: 'Access state',
    is_email_verified: 'Email status',
    niveau: 'Level',
    permission: 'Permission',
    reason: 'Reason',
    resolution_note: 'Resolution',
    status: 'Status',
    tier: 'Plan',
  }
  return labels[key] ?? humanize(key)
}

function cleanSummary(value: string) {
  return value.replaceAll('/api/', '').replaceAll('admin/', '').trim()
}

function humanize(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replaceAll(':', ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}
