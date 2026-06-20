'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Database,
  LibraryBig,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AdminAlert,
  AdminPageHeader,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
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
  const readinessAverage = contentReadiness.length
    ? Math.round(contentReadiness.reduce((sum, item) => sum + item.ratio, 0) / contentReadiness.length)
    : 0
  const contentGaps = overview.ops_readiness?.content_gaps as Record<string, unknown> | undefined
  const contentGapEntries = recordEntries(contentGaps, 5)
  const contentModels = overview.crud_catalog.filter((item) => (
    ['knowledge-base', 'resources', 'quiz', 'exam-bank'].includes(item.domain)
  ))

  useEffect(() => {
    if (!errorMessage) {
      lastErrorToastRef.current = ''
      return
    }
    if (errorMessage === lastErrorToastRef.current) return
    lastErrorToastRef.current = errorMessage
    toast.error(errorMessage)
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
        eyebrow="Admin / Courses"
        title="Course management"
        description="Control subjects, topics and published learning items from one staff workspace."
        action={(
          <Link
            href="/admin/courses/new"
            className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#5b60f9] px-4 text-[13px] font-black text-white no-underline transition hover:bg-[#4b50e8]"
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
              <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
                Published, draft and scheduled content across the learning catalog.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f0ff] px-3 py-1 text-[12px] font-black text-[#5b60f9]">
              <ShieldCheck size={13} />
              {overviewLoading ? 'Syncing' : `${formatNumber(readinessAverage)}% ready`}
            </span>
          </div>

          {overviewError ? (
            <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-4 py-6 text-center text-[13px] font-semibold text-[#a1a1aa]">
              Content readiness is unavailable. Course list data remains loaded.
            </p>
          ) : overviewLoading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-[12px] bg-[#f4f4f5]" />)}
            </div>
          ) : contentReadiness.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {contentReadiness.slice(0, 6).map((item) => <ReadinessRow key={item.key} item={item} />)}
            </div>
          ) : (
            <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-4 py-6 text-center text-[13px] font-semibold text-[#a1a1aa]">
              No content status rows loaded.
            </p>
          )}
        </section>

        <aside className={`${card} p-5`}>
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f0ff] text-[#5b60f9]">
              <Sparkles size={18} />
            </span>
            <div>
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Publishing gaps</h2>
              <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">Operational signals before students see content.</p>
            </div>
          </div>

          <div className="mb-4 grid gap-2">
            {contentGapEntries.length ? contentGapEntries.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-2">
                <span className="truncate text-[12.5px] font-bold text-[#52525c]">{titleCase(item.key)}</span>
                <span className="text-[13px] font-black text-[#f5900b]">{formatNumber(item.value)}</span>
              </div>
            )) : (
              <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-5 text-center text-[13px] font-semibold text-[#a1a1aa]">
                No publishing gaps reported.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            {contentModels.slice(0, 4).map((item) => (
              <a
                key={item.model}
                href={getBackendUrl(item.admin_url)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-[12px] border border-[#f4f4f5] px-3 py-2 no-underline transition hover:border-[#5b60f9] hover:bg-[#fbfbfc]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-black text-[#52525c]">{item.name_plural}</span>
                  <span className="block truncate text-[12px] font-semibold text-[#a1a1aa]">{item.model}</span>
                </span>
                <Database size={14} className="shrink-0 text-[#a1a1aa]" />
              </a>
            ))}
          </div>
        </aside>
      </div>

      {loading ? (
        <section className={`${card} overflow-hidden`}>
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-4 border-b border-[#f4f4f5] px-5 py-4 last:border-b-0">
              <div className="h-10 w-10 animate-pulse rounded-[12px] bg-[#f4f4f5]" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-44 animate-pulse rounded-full bg-[#f4f4f5]" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded-full bg-[#f4f4f5]" />
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
            className="inline-flex h-10 items-center gap-2 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
          >
            <RotateCcw size={15} /> Reessayer
          </button>
        </section>
      ) : subjects.length === 0 ? (
        <section className={`${card} grid min-h-[280px] place-items-center p-8 text-center`}>
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-[15px] bg-[#f0f0ff] text-[#5b60f9]">
              <BookOpen size={22} />
            </span>
            <h2 className="m-0 mt-4 text-[16px] font-black text-[#3f3f46]">Aucun cours trouve.</h2>
            <p className="mx-auto m-0 mt-1 max-w-[360px] text-[13px] font-semibold text-[#a1a1aa]">
              Creez une matiere pour commencer a organiser les topics et les items.
            </p>
            <Link
              href="/admin/courses/new"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#5b60f9] px-4 text-[13px] font-black text-white no-underline transition hover:bg-[#4b50e8]"
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
              className={`group flex items-center gap-4 px-5 py-4 no-underline transition hover:bg-[#fbfbfc] ${
                index < subjects.length - 1 ? 'border-b border-[#f4f4f5]' : ''
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f0ff] text-[#5b60f9] transition group-hover:bg-[#5b60f9] group-hover:text-white">
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
              <ChevronRight size={16} className="shrink-0 text-[#d4d4d8] transition group-hover:text-[#5b60f9]" />
            </Link>
          ))}
        </section>
      )}

      {loading && (
        <p className="mt-3 flex items-center gap-2 text-[12px] font-bold text-[#a1a1aa]">
          <Loader2 size={13} className="animate-spin" /> Synchronisation des cours...
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
            {titleCase(status.key)} {formatNumber(status.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ')
}
