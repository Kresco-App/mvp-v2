'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  FileWarning,
  LibraryBig,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { showToastError } from '@/lib/lazyToast'

import {
  AdminAlert,
  AdminPageHeader,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
} from '@/components/admin/AdminDesign'
import { apiDataErrorMessage } from '@/lib/apiData'
import { getJson } from '@/lib/apiClient'
import { getBackendUrl } from '@/lib/apiConfig'
import {
  DOMAIN_LABELS,
  EMPTY_OVERVIEW,
  formatNumber,
  publishedRatio,
  recordEntries,
  sumValues,
  type AdminOverview,
} from '@/lib/adminOverview'
import { useAdminSubjectsData } from '@/lib/courseDiscoveryData'

const card = adminPanelClass
const courseReadinessKeys = new Set([
  'concept_tags',
  'exam_problems',
  'exams',
  'question_sets',
  'questions',
  'resources',
  'subjects',
  'tab_contents',
  'topic_items',
  'topic_sections',
  'topics',
])

export default function AdminCoursesPage() {
  const { subjects, loading, error, retry } = useAdminSubjectsData()
  const [overview, setOverview] = useState<AdminOverview>(EMPTY_OVERVIEW)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState(false)
  const lastErrorToastRef = useRef('')
  const errorMessage = error ? apiDataErrorMessage(error, 'Impossible de charger les cours.') : ''
  const topicCount = subjects.reduce((sum, subject) => sum + Number(subject.chapter_count ?? 0), 0)
  const itemCount = subjects.reduce((sum, subject) => sum + Number(subject.lesson_count ?? 0), 0)
  const hasBlockingError = Boolean(errorMessage && subjects.length === 0)
  const contentReadiness = useMemo(
    () => Object.entries(overview.content_status ?? {})
      .filter(([key]) => courseReadinessKeys.has(key))
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
  const readinessTotals = useMemo(() => {
    let ready = 0
    let total = 0
    let draft = 0
    let other = 0
    for (const item of contentReadiness) {
      const publishedCount = Number(item.statuses.published ?? 0)
      const activeCount = Number(item.statuses.active ?? 0)
      const scheduledCount = Number(item.statuses.scheduled ?? 0)
      const draftCount = Number(item.statuses.draft ?? 0)
      const readyCount = publishedCount + activeCount + scheduledCount
      ready += readyCount
      draft += draftCount
      total += item.total
      other += Math.max(0, item.total - readyCount - draftCount)
    }
    return {
      ready,
      total,
      draft,
      other,
      blocked: Math.max(0, total - ready),
      topModel: contentReadiness[0]?.label ?? 'Content',
    }
  }, [contentReadiness])
  const readinessAverage = readinessTotals.total ? Math.round((readinessTotals.ready / readinessTotals.total) * 100) : 0
  const readinessPriorities = useMemo(
    () => contentReadiness
      .map((item) => {
        const ready = Number(item.statuses.published ?? 0) + Number(item.statuses.active ?? 0) + Number(item.statuses.scheduled ?? 0)
        const draft = Number(item.statuses.draft ?? 0)
        return {
          key: item.key,
          label: item.label,
          draft,
          other: Math.max(0, item.total - ready - draft),
          blocked: Math.max(0, item.total - ready),
          total: item.total,
        }
      })
      .filter((item) => item.blocked > 0)
      .sort((a, b) => b.blocked - a.blocked)
      .slice(0, 4),
    [contentReadiness],
  )
  const contentGaps = overview.ops_readiness?.content_gaps as Record<string, unknown> | undefined
  const contentGapEntries = recordEntries(contentGaps, 5)
  const editorShortcuts = overview.crud_catalog.filter((item) => (
    ['knowledge-base', 'resources', 'quiz', 'exam-bank'].includes(item.domain)
  ))

  useEffect(() => {
    if (!errorMessage) {
      lastErrorToastRef.current = ''
      return
    }
    if (errorMessage === lastErrorToastRef.current) return
    lastErrorToastRef.current = errorMessage
    showToastError(errorMessage)
  }, [errorMessage])

  useEffect(() => {
    let alive = true
    setOverviewLoading(true)
    setOverviewError(false)
    getJson<AdminOverview>('/admin/overview')
      .then((response) => {
        if (!alive) return
        setOverview(response ?? EMPTY_OVERVIEW)
      })
      .catch(() => {
        if (!alive) return
        setOverview(EMPTY_OVERVIEW)
        setOverviewError(true)
      })
      .finally(() => {
        if (alive) setOverviewLoading(false)
      })
    return () => { alive = false }
  }, [])

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={LibraryBig}
        title="Course management"
        action={(
          <Link
            href="/admin/courses/new"
            className={`${adminPrimaryButtonClass} no-underline`}
          >
            <Plus size={15} /> New course
          </Link>
        )}
      />

      {errorMessage && subjects.length > 0 && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Derniere actualisation en echec. Cached courses remain visible.</span>
        </AdminAlert>
      )}

      <section className={`${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-3`}>
        <StatTile label="Subjects" value={loading ? '...' : String(subjects.length)} />
        <StatTile label="Topics" value={loading ? '...' : String(topicCount)} />
        <StatTile label="Items" value={loading ? '...' : String(itemCount)} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className={`${card} p-5`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Content readiness</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-[12px] font-black text-[color:var(--primary)]">
              <ShieldCheck size={13} />
              {overviewLoading ? 'Syncing' : `${formatNumber(readinessAverage)}% ready`}
            </span>
          </div>

          {overviewError ? (
            <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-4 py-6 text-center text-[13px] font-semibold text-[#a1a1aa]">
              -
            </p>
          ) : overviewLoading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((item) => <div key={item} className="h-12 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[12px] bg-[#f4f4f5]" />)}
            </div>
          ) : contentReadiness.length ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
                <div className="rounded-[16px] bg-[#111827] p-4 text-white">
                  <p className="m-0 text-[11px] font-black uppercase tracking-[0.06em] text-white/60">Publish readiness</p>
                  <p className="m-0 mt-3 text-[44px] font-black leading-none tabular-nums">{formatNumber(readinessAverage)}%</p>
                  <p className="m-0 mt-2 text-[12px] font-bold text-white/65">
                    {formatNumber(readinessTotals.ready)} of {formatNumber(readinessTotals.total)} items ready
                  </p>
                  <p className="m-0 mt-3 rounded-[10px] bg-white/10 px-2.5 py-2 text-[12px] font-black text-white/75">
                    Largest collection: {readinessTotals.topModel}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <ReadinessMetric label="Ready items" value={readinessTotals.ready} tone="good" />
                  <ReadinessMetric label="Draft items" value={readinessTotals.draft} tone={readinessTotals.draft ? 'warn' : 'default'} />
                  <ReadinessMetric label="Other" value={readinessTotals.other} tone={readinessTotals.other ? 'warn' : 'default'} />
                  <ReadinessMetric label="Open work" value={readinessTotals.blocked} tone={readinessTotals.blocked ? 'warn' : 'good'} />
                </div>
              </div>
              <ReadinessDistribution totals={readinessTotals} />
              <ReadinessPriorityList items={readinessPriorities} />
              <div className="grid gap-3 md:grid-cols-2">
                {contentReadiness.slice(0, 6).map((item) => <ReadinessRow key={item.key} item={item} />)}
              </div>
            </div>
          ) : (
            <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-4 py-6 text-center text-[13px] font-semibold text-[#a1a1aa]">
              -
            </p>
          )}
        </section>

        <aside className={`${card} p-5`}>
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
              <Sparkles size={18} />
            </span>
            <div>
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Publish blockers</h2>
            </div>
          </div>

          <div className="mb-4 grid gap-2">
            {contentGapEntries.length ? contentGapEntries.map((item) => (
              <div key={item.key} className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-[13px] font-black text-[#52525c]">{gapLabel(item.key)}</span>
                  <span className="shrink-0 text-[20px] font-black leading-none text-[#f5900b] tabular-nums">{formatNumber(item.value)}</span>
                </div>
                <p className="m-0 mt-1 text-[12px] font-semibold text-[#92660b]">{gapAction(item.key)}</p>
              </div>
            )) : (
              <p className="m-0 rounded-[12px] border border-[#dcfce7] bg-[#f0fdf4] px-3 py-5 text-center text-[13px] font-black text-[#16a34a]">
                No publish blockers
              </p>
            )}
          </div>

          <div className="grid gap-2">
            {editorShortcuts.slice(0, 4).map((item) => (
              <a
                key={item.model}
                href={getBackendUrl(item.admin_url)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-10 items-center justify-between gap-3 rounded-[12px] border border-[#f4f4f5] px-3 py-2 no-underline transition-[background-color,border-color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:bg-[#fbfbfc] active:scale-[0.96]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-black text-[#52525c]">Open {item.name_plural}</span>
                  <span className="block truncate text-[12px] font-semibold text-[#a1a1aa]">{DOMAIN_LABELS[item.domain] ?? titleCase(item.domain)}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-[#a1a1aa]" />
              </a>
            ))}
          </div>
        </aside>
      </div>

      {loading ? (
        <section className={`${card} overflow-hidden`}>
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-4 border-b border-[#f4f4f5] px-5 py-4 last:border-b-0">
              <div className="h-10 w-10 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[12px] bg-[#f4f4f5]" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-44 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
                <div className="mt-2 h-3 w-28 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
              </div>
            </div>
          ))}
        </section>
      ) : hasBlockingError ? (
        <section className={`${card} flex flex-wrap items-center justify-between gap-4 p-5`}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#fef2f2] text-[#ef4444]">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h2 className="m-0 text-[15px] font-black text-[#3f3f46]">Chargement indisponible</h2>
              <p className="m-0 mt-1 text-[13px] font-semibold text-[#71717b]">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void retry()}
            className="inline-flex h-10 items-center gap-2 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#52525c] transition-[border-color,color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96]"
          >
            <RotateCcw size={15} /> Reessayer
          </button>
        </section>
      ) : subjects.length === 0 ? (
        <section className={`${card} grid min-h-[280px] place-items-center p-8 text-center`}>
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-[15px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
              <BookOpen size={22} />
            </span>
            <h2 className="m-0 mt-4 text-[16px] font-black text-[#3f3f46]">Aucun cours trouve.</h2>
            <Link
              href="/admin/courses/new"
              className={`${adminPrimaryButtonClass} mt-4 no-underline`}
            >
              <Plus size={15} /> Nouveau cours
            </Link>
          </div>
        </section>
      ) : (
        <section className={`${card} overflow-hidden`}>
          {subjects.map((subject, index) => (
            <Link
              key={subject.id}
              href={`/admin/courses/${subject.id}`}
              className={`group flex items-center gap-4 px-5 py-4 no-underline transition-[background-color] duration-150 ease-out hover:bg-[#fbfbfc] ${
                index < subjects.length - 1 ? 'border-b border-[#f4f4f5]' : ''
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)] transition-[background-color,color] duration-150 ease-out group-hover:bg-[color:var(--primary)] group-hover:text-white">
                <BookOpen size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-black text-[#3f3f46]">{subject.title}</span>
                <span className="mt-0.5 block text-[12.5px] font-semibold text-[#a1a1aa]">
                  {Number(subject.chapter_count ?? 0)} topics / {Number(subject.lesson_count ?? 0)} items
                </span>
              </span>
              {errorMessage ? (
                <span className="hidden items-center gap-1 rounded-full bg-[#fffbeb] px-2 py-1 text-[11px] font-black text-[#92660b] sm:inline-flex">
                  <AlertTriangle size={12} /> Cache
                </span>
              ) : null}
              <ChevronRight size={16} className="shrink-0 text-[#d4d4d8] transition-[color] duration-150 ease-out group-hover:text-[color:var(--primary)]" />
            </Link>
          ))}
        </section>
      )}

      {loading && (
        <p className="mt-3 flex items-center gap-2 text-[12px] font-bold text-[#a1a1aa]">
          <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> Synchronisation des cours...
        </p>
      )}
    </main>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={adminMetricTileClass}>
      <p className="m-0 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className="m-0 mt-2 text-[24px] font-black leading-none text-[#3f3f46]">{value}</p>
    </div>
  )
}

function ReadinessPriorityList({
  items,
}: {
  items: Array<{ key: string; label: string; draft: number; other: number; blocked: number; total: number }>
}) {
  if (!items.length) {
    return (
      <div className="rounded-[16px] border border-[#dcfce7] bg-[#f0fdf4] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-white text-[#16a34a]">
            <ShieldCheck size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-black text-[#166534]">Ready to publish</span>
            <span className="mt-0.5 block text-[12px] font-black text-[#16a34a]">Ready for the next publish pass.</span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[16px] bg-[#fbfbfc] p-3 shadow-[var(--shadow-border)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#fff7ed] text-[#f5900b]">
          <FileWarning size={15} />
        </span>
        <h3 className="m-0 text-[14px] font-black text-[#3f3f46]">Publish queue</h3>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 rounded-[12px] bg-white px-3 py-2 shadow-[var(--shadow-border)]">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-black text-[#52525c]">{item.label}</span>
              <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#a1a1aa]">
                {formatNumber(item.draft)} draft / {formatNumber(item.other)} other
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[#fff7ed] px-2.5 py-1 text-[12px] font-black text-[#f5900b] tabular-nums">
              {formatNumber(item.blocked)} open
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReadinessMetric({ label, value, tone }: { label: string; value: number; tone: 'default' | 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-[#16a34a]' : tone === 'warn' ? 'text-[#f5900b]' : 'text-[#3f3f46]'
  return (
    <div className="rounded-[14px] border border-[#f4f4f5] bg-[#fbfbfc] px-4 py-3">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-2 text-[26px] font-black leading-none tabular-nums ${toneClass}`}>{formatNumber(value)}</p>
    </div>
  )
}

function ReadinessDistribution({
  totals,
}: {
  totals: { ready: number; draft: number; other: number; total: number }
}) {
  const readyPct = ratio(totals.ready, totals.total)
  const draftPct = ratio(totals.draft, totals.total)
  const otherPct = Math.max(0, 100 - readyPct - draftPct)
  const segments = [
    { label: 'Ready', value: totals.ready, pct: readyPct, className: 'bg-[#16a34a]' },
    { label: 'Draft', value: totals.draft, pct: draftPct, className: 'bg-[#f5900b]' },
    { label: 'Other', value: totals.other, pct: otherPct, className: 'bg-[#a1a1aa]' },
  ].filter((item) => item.value > 0)

  return (
    <div className="rounded-[16px] bg-[#fbfbfc] p-4 shadow-[var(--shadow-border)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14px] font-black text-[#3f3f46]">Content state</h3>
        <span className="text-[12px] font-black text-[#a1a1aa] tabular-nums">{formatNumber(totals.total)} total</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white shadow-[var(--shadow-border)]" aria-label="Content state distribution">
        {segments.length ? segments.map((item) => (
          <span
            key={item.label}
            className={item.className}
            style={{ width: `${Math.max(item.pct, 3)}%` }}
            title={`${item.label}: ${formatNumber(item.value)}`}
          />
        )) : <span className="w-full bg-[#e4e4e7]" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {segments.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#52525c] shadow-[var(--shadow-border)]">
            <span className={`h-2 w-2 rounded-full ${item.className}`} />
            {item.label} {formatNumber(item.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

function ReadinessRow({ item }: { item: { label: string; total: number; ratio: number; statuses: Record<string, number> } }) {
  const published = Number(item.statuses.published ?? 0)
  const active = Number(item.statuses.active ?? 0)
  const scheduled = Number(item.statuses.scheduled ?? 0)
  const ready = published + active + scheduled
  const draft = Number(item.statuses.draft ?? 0)
  const other = Math.max(0, item.total - ready - draft)
  const blocked = Math.max(0, item.total - ready)
  const segments = [
    { key: 'ready', value: ready, pct: ratio(ready, item.total), className: 'bg-[#16a34a]' },
    { key: 'draft', value: draft, pct: ratio(draft, item.total), className: 'bg-[#f5900b]' },
    { key: 'other', value: other, pct: ratio(other, item.total), className: 'bg-[#a1a1aa]' },
  ].filter((segment) => segment.value > 0)
  return (
    <div className="rounded-[14px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-3">
      <div className="flex items-start justify-between gap-3 text-[13px] font-black">
        <span className="truncate text-[#52525c]">{item.label}</span>
        <span className={`rounded-full px-2 py-1 text-[11px] tabular-nums ${blocked ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
          {formatNumber(item.ratio)}%
        </span>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white shadow-[var(--shadow-border)]" aria-label={`${item.label} readiness state`}>
        {segments.length ? segments.map((segment) => (
          <span
            key={segment.key}
            className={segment.className}
            style={{ width: `${Math.max(segment.pct, 4)}%` }}
            title={`${segment.key}: ${formatNumber(segment.value)}`}
          />
        )) : <span className="w-full bg-[#e4e4e7]" />}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <StatusChip label="ready" value={ready} tone="good" />
        <StatusChip label="draft" value={draft} tone={draft ? 'warn' : 'default'} />
        <StatusChip label="other" value={other} tone={other ? 'warn' : 'default'} />
      </div>
      <p className="m-0 mt-2 text-[11px] font-black text-[#a1a1aa] tabular-nums">
        {formatNumber(blocked)} need work / {formatNumber(item.total)} total
      </p>
    </div>
  )
}

function StatusChip({ label, value, tone }: { label: string; value: number; tone: 'default' | 'good' | 'warn' }) {
  const toneClass = tone === 'good'
    ? 'bg-[#f0fdf4] text-[#16a34a]'
    : tone === 'warn'
      ? 'bg-[#fff7ed] text-[#f5900b]'
      : 'bg-white text-[#71717a]'
  return (
    <span className={`rounded-[10px] px-2 py-1.5 text-[11px] font-black tabular-nums ${toneClass}`}>
      {formatNumber(value)} {label}
    </span>
  )
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ')
}

function ratio(value: number, total: number) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function gapLabel(key: string) {
  const labels: Record<string, string> = {
    topic_items_without_primary_resource: 'Items missing media',
    topic_items_without_tabs: 'Items missing workspace tabs',
    topics_without_sections: 'Topics missing sections',
    topics_without_items: 'Topics missing items',
  }
  return labels[key] ?? titleCase(key)
}

function gapAction(key: string) {
  const normalized = key.toLowerCase()
  if (normalized.includes('primary_resource')) return 'Attach the missing file or video.'
  if (normalized.includes('sections')) return 'Add a section before publishing.'
  if (normalized.includes('items')) return 'Add at least one lesson item.'
  if (normalized.includes('tabs')) return 'Complete the learning workspace.'
  return 'Review before the next publish pass.'
}
