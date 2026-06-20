'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  FileClock,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  adminMetricStripFiveClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
} from '@/components/admin/AdminDesign'
import { getJson } from '@/lib/apiClient'
import { formatNumber, recordEntries } from '@/lib/adminOverview'
import {
  EMPTY_ADMIN_ACTIVITY,
  activityMatches,
  formatActivityLabel,
  type AdminActivity,
  type AdminActivityEntry,
} from '@/lib/adminActivity'

const card = adminPanelClass

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
        setError('Could not load admin activity.')
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

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Activity}
        eyebrow="Admin / Activity"
        title="Activity feed"
        description="Recent staff, professor and system audit events with touched models, paths and changed fields."
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
        <StatTile icon={FileClock} label="Audit rows" value={formatNumber(data.summary.total_audit_rows)} hint={`${formatNumber(data.summary.created_7d)} in 7d`} loading={loading} />
        <StatTile icon={Clock3} label="Last 24h" value={formatNumber(data.summary.created_24h)} hint="recent changes" loading={loading} />
        <StatTile icon={UserRound} label="Actors" value={formatNumber(data.summary.actors_in_feed)} hint="in loaded feed" loading={loading} />
        <StatTile icon={Database} label="Models" value={formatNumber(data.summary.models_in_feed)} hint="touched entities" loading={loading} />
        <StatTile icon={AlertTriangle} label="Attention" value={formatNumber(signals.attentionCount)} hint={`${formatNumber(signals.changedFieldCount)} changed fields`} loading={loading} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Action mix</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Most common audit actions in the system.</p>
          <BarList data={recordEntries(data.by_action, 8)} emptyLabel="No audit actions loaded." />
        </section>

        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Touched models</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Entities with recent operational changes.</p>
          <BarList data={recordEntries(data.by_model, 8)} emptyLabel="No model activity loaded." />
        </section>

        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">API paths</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Endpoints behind recent admin and staff actions.</p>
          <BarList data={signals.pathEntries} emptyLabel="No request paths loaded." />
        </section>
      </div>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Audit coverage</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">Who changed data, which fields moved, and which events need extra review.</p>
          </div>
          <span className="rounded-full bg-[#f0f0ff] px-3 py-1 text-[12px] font-black text-[#5b60f9]">
            {formatNumber(filteredEntries.length)} visible
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <BarList data={visibleSignals.actorEntries} emptyLabel="No actors loaded." />
          <BarList data={visibleSignals.fieldEntries} emptyLabel="No changed fields loaded." />
          <AttentionList entries={filteredEntries.filter(isAttentionActivity).slice(0, 5)} />
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#f4f4f5] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Recent events</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">{formatNumber(filteredEntries.length)} event(s) visible</p>
          </div>
          <AdminSearchBox value={query} onChange={setQuery} placeholder="Search actions, models, paths" label="Search admin activity" className="lg:w-[360px]" />
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
              <p className="m-0 text-[15px] font-black text-[#3f3f46]">No activity found.</p>
              <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Try another search or refresh the audit feed.</p>
            </div>
          </div>
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
              <span className="truncate text-[#52525c]">{formatActivityLabel(item.key)}</span>
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

function AttentionList({ entries }: { entries: AdminActivityEntry[] }) {
  if (!entries.length) {
    return (
      <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-5 text-center text-[13px] font-semibold text-[#a1a1aa]">
        No attention events loaded.
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[12.5px] font-black text-[#52525c]">{formatActivityLabel(entry.action)}</span>
            <span className="shrink-0 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-black text-[#f5900b]">review</span>
          </div>
          <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#a1a1aa]">{entry.summary || entry.object_repr || entry.model_name}</p>
        </div>
      ))}
    </div>
  )
}

function ActivityRow({ entry }: { entry: AdminActivityEntry }) {
  const details = Object.entries(entry.changed_data ?? {}).slice(0, 5)
  return (
    <article className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_230px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <ActionPill value={entry.action} />
          <span className="rounded-full bg-[#f4f4f5] px-2 py-1 text-[11px] font-black text-[#71717a]">{entry.model_name || 'Model'}</span>
          <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">#{entry.id}</span>
        </div>
        <h3 className="m-0 mt-2 truncate text-[15px] font-black text-[#3f3f46]">{entry.summary || entry.object_repr || entry.model_name}</h3>
        <p className="m-0 mt-1 truncate text-[13px] font-semibold text-[#71717a]">
          {entry.object_pk ? `${entry.model_name} #${entry.object_pk}` : entry.model_name}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.changed_keys.slice(0, 6).map((key) => (
            <span key={key} className="rounded-full bg-[#f0f0ff] px-2 py-1 text-[11px] font-black text-[#5b60f9]">{formatActivityLabel(key)}</span>
          ))}
          {!entry.changed_keys.length && <span className="text-[12px] font-semibold text-[#a1a1aa]">No changed fields recorded</span>}
        </div>
        {!!details.length && (
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {details.map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-[10px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-2">
                <p className="m-0 truncate text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{formatActivityLabel(key)}</p>
                <p className="m-0 mt-1 truncate text-[12px] font-bold text-[#52525c]">{formatValue(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid content-start gap-2 text-[12px] font-bold text-[#71717a]">
        <span>Actor: {entry.actor_user_id ? `#${entry.actor_user_id}` : 'Unknown'}</span>
        <span className="truncate">Path: {entry.request_path || '-'}</span>
        <span className="truncate">Host: {entry.client_host || '-'}</span>
        <span>{formatDate(entry.created_at)}</span>
      </div>
    </article>
  )
}

function ActionPill({ value }: { value: string }) {
  const normalized = value.toLowerCase()
  const warn = normalized.includes('delete') || normalized.includes('revoke') || normalized.includes('reject')
  const good = normalized.includes('approve') || normalized.includes('resolve') || normalized.includes('grant')
  const className = warn
    ? 'bg-[#fef2f2] text-[#dc2626]'
    : good
      ? 'bg-[#f0fdf4] text-[#16a34a]'
      : 'bg-[#fff7ed] text-[#f5900b]'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-black ${className}`}>{formatActivityLabel(value || 'event')}</span>
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

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function formatDate(value: string | null) {
  if (!value) return 'Date unknown'
  return new Date(value).toLocaleString('fr-FR')
}

function activitySignals(entries: AdminActivityEntry[]) {
  const actors: Record<string, number> = {}
  const paths: Record<string, number> = {}
  const fields: Record<string, number> = {}

  for (const entry of entries) {
    const actor = entry.actor_user_id ? `Actor #${entry.actor_user_id}` : 'Unknown actor'
    actors[actor] = (actors[actor] ?? 0) + 1

    const path = entry.request_path || 'Unknown path'
    paths[path] = (paths[path] ?? 0) + 1

    for (const field of entry.changed_keys) {
      fields[field] = (fields[field] ?? 0) + 1
    }
  }

  return {
    actorEntries: recordEntries(actors, 6),
    pathEntries: recordEntries(paths, 6),
    fieldEntries: recordEntries(fields, 6),
    attentionCount: entries.filter(isAttentionActivity).length,
    changedFieldCount: Object.keys(fields).length,
  }
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
