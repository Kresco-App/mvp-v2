'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, ClipboardList, Clock3, Layers, MessageSquare, Pencil, Search, Trash2, X, XCircle } from 'lucide-react'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { apiDataErrorMessage } from '@/lib/apiData'
import { listProfessorChangeRequests, type ProfessorChangeSummary } from '@/lib/professor'
import { withdrawStudioChange } from '@/lib/studio'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'partially_applied', label: 'Partial' },
  { value: 'applied', label: 'Applied' },
  { value: 'rejected', label: 'Rejected' },
]

const CHANGE_FILTER_VALUES = new Set(FILTERS.map((filter) => filter.value))
const PROFESSOR_CHANGE_DATE_FORMATTER = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' })

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof Clock3 }> = {
  pending: { label: 'Pending review', className: 'bg-[#fff7ed] text-[#9a3412]', Icon: Clock3 },
  partially_applied: { label: 'Partial', className: 'bg-[#fff7ed] text-[#9a3412]', Icon: Clock3 },
  applied: { label: 'Applied', className: 'bg-[#f0fdf4] text-[#166534]', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', className: 'bg-[#fef2f2] text-[#991b1b]', Icon: XCircle },
  failed: { label: 'Failed', className: 'bg-[#fef2f2] text-[#991b1b]', Icon: XCircle },
  target_deleted: { label: 'Target deleted', className: 'bg-[#f4f4f5] text-[#71717b]', Icon: XCircle },
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, className: 'bg-[#f4f4f5] text-[#71717b]', Icon: Clock3 }
}

export default function ProfessorChangesPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeStatus = useMemo(() => normalizeChangeStatus(new URLSearchParams(searchKey).get('status')), [searchKey])
  const routeSearch = useMemo(() => new URLSearchParams(searchKey).get('q')?.trim() ?? '', [searchKey])
  const [requests, setRequests] = useState<ProfessorChangeSummary[]>([])
  const [status, setStatus] = useState(routeStatus)
  const [changeSearch, setChangeSearch] = useState(routeSearch)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const currentFilterLabel = FILTERS.find((filter) => filter.value === status)?.label ?? 'Requests'
  const normalizedChangeSearch = changeSearch.trim().toLowerCase()
  const visibleRequests = useMemo(() => (
    normalizedChangeSearch ? requests.filter((request) => changeRequestMatchesSearch(request, normalizedChangeSearch)) : requests
  ), [normalizedChangeSearch, requests])
  const queueStats = useMemo(() => buildChangeQueueStats(visibleRequests), [visibleRequests])

  function replaceChangeRequestUrlState(nextStatus: string, nextSearch: string) {
    const params = new URLSearchParams(searchKey)
    const normalizedStatus = normalizeChangeStatus(nextStatus)
    const normalizedSearch = nextSearch.trim()
    if (normalizedStatus === 'all') params.delete('status')
    else params.set('status', normalizedStatus)
    if (normalizedSearch) params.set('q', normalizedSearch)
    else params.delete('q')
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  function selectStatus(nextStatus: string) {
    const normalizedStatus = normalizeChangeStatus(nextStatus)
    setStatus(normalizedStatus)
    replaceChangeRequestUrlState(normalizedStatus, changeSearch)
  }

  function updateChangeSearch(value: string) {
    setChangeSearch(value)
    replaceChangeRequestUrlState(status, value)
  }

  function clearChangeSearch() {
    updateChangeSearch('')
  }

  function reload() {
    setLoading(true)
    setLoadError('')
    listProfessorChangeRequests(status)
      .then((items) => {
        setRequests(items)
        setLoadError('')
      })
      .catch((error) => {
        const message = apiDataErrorMessage(error, 'Impossible de charger les demandes.')
        setLoadError(message)
        showToastError(message)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError('')
    listProfessorChangeRequests(status)
      .then((items) => {
        if (!alive) return
        setRequests(items)
        setLoadError('')
      })
      .catch((error) => {
        if (!alive) return
        const message = apiDataErrorMessage(error, 'Impossible de charger les demandes.')
        setLoadError(message)
        showToastError(message)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [status])

  useEffect(() => {
    setStatus((current) => (current === routeStatus ? current : routeStatus))
    setChangeSearch((current) => (current === routeSearch ? current : routeSearch))
  }, [routeSearch, routeStatus])

  async function withdraw(id: number) {
    if (!window.confirm('Cancel this change request?')) return
    try {
      await withdrawStudioChange(id)
      showToastSuccess('Change request cancelled.')
      reload()
    } catch {
      showToastError('Could not cancel this request.')
    }
  }

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-6 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.12em] text-[#71717b]">Studio review</p>
            <h1 className="m-0 mt-1 text-[28px] font-black leading-tight text-[#27272a]">Change requests</h1>
            <p className="m-0 mt-1 text-[13px] font-bold text-[#71717b]">
              {visibleRequests.length} shown in {currentFilterLabel.toLowerCase()}
              {normalizedChangeSearch ? ` for "${changeSearch.trim()}"` : ''}
            </p>
          </div>
          <Link
            href="/professor/studio"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[#5b60f9] px-3 text-[13px] font-black text-white no-underline transition-[background-color,transform] duration-150 ease-out hover:bg-[#4a4fe0] active:scale-[0.96]"
          >
            <Layers size={15} /> Studio
          </Link>
        </header>

        <section className="mb-5 rounded-[16px] border border-[#e4e4e7] bg-white p-3 shadow-[0_1px_2px_rgba(24,24,27,0.04)]" aria-label="Change request controls">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap gap-1.5" role="tablist" aria-label="Change request status filters">
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => selectStatus(filter.value)}
                  className={`h-10 rounded-[10px] px-3 text-[12px] font-black transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
                    status === filter.value ? 'bg-[#5b60f9] text-white' : 'border border-[#e4e4e7] bg-[#fbfbfc] text-[#52525c] hover:border-[#5b60f9]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-[#fbfbfc] px-3 xl:w-[360px]">
              <Search size={15} className="shrink-0 text-[#71717b]" />
              <input
                aria-label="Search change requests"
                value={changeSearch}
                onChange={(event) => updateChangeSearch(event.target.value)}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] font-bold text-[#27272a] outline-none"
                placeholder="Search requests"
              />
              {changeSearch && (
                <button
                  type="button"
                  onClick={clearChangeSearch}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] border border-[#e4e4e7] bg-white text-[#71717b] transition-[border-color,color,transform] duration-150 ease-out hover:border-[#5b60f9] hover:text-[#5b60f9] active:scale-[0.96]"
                  aria-label="Clear change request search"
                >
                  <X size={13} />
                </button>
              )}
            </label>
          </div>

          {!loading && !loadError && visibleRequests.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-4" aria-label="Change request summary">
              <QueueStat label="Requests" value={visibleRequests.length} />
              <QueueStat label="Operations" value={queueStats.operations} />
              <QueueStat label="Pending" value={queueStats.pending} tone="attention" />
              <QueueStat label="Reviewed" value={queueStats.reviewed} tone="success" />
            </div>
          )}
        </section>

        {loading ? (
          <div className="grid gap-2" aria-label="Chargement des demandes">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[14px] border border-[#e4e4e7] bg-white" />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-[16px] border border-[#fecaca] bg-[#fef2f2] p-6">
            <h2 className="m-0 text-[18px] font-black text-[#991b1b]">Requests unavailable</h2>
            <p className="m-0 mt-2 text-[14px] font-bold leading-6 text-[#b91c1c]">{loadError}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#fecaca] bg-white px-4 text-[13px] font-black text-[#991b1b] transition-[background-color,transform] duration-150 ease-out hover:bg-red-50 active:scale-[0.96]"
            >
              Retry
            </button>
          </div>
        ) : requests.length === 0 ? (
          <EmptyChangeState
            icon={<ClipboardList size={32} />}
            title={status === 'all' ? 'No change requests' : `No ${currentFilterLabel.toLowerCase()} requests`}
            detail={status === 'all' ? 'Submitted Studio edits will appear here.' : 'Return to all requests to inspect the rest of the queue.'}
            action={status !== 'all' ? <button type="button" onClick={() => selectStatus('all')} className="mt-4 h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#5b60f9] transition-[border-color,transform] duration-150 ease-out hover:border-[#5b60f9] active:scale-[0.96]">View all requests</button> : null}
          />
        ) : visibleRequests.length === 0 ? (
          <EmptyChangeState
            icon={<Search size={32} />}
            title="No matching requests"
            detail={`Clear search to return to the ${currentFilterLabel.toLowerCase()} queue.`}
            action={<button type="button" onClick={clearChangeSearch} className="mt-4 h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#5b60f9]">Clear search</button>}
          />
        ) : (
          <section className="overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04)]" aria-label="Change request queue">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_110px_160px_150px] gap-4 border-b border-[#ececf0] bg-[#fbfbfc] px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-[#71717b] lg:grid">
              <span>Request</span>
              <span>Ops</span>
              <span>Progress</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-[#ececf0]">
              {visibleRequests.map((request) => (
                <ChangeRequestRow key={request.id} request={request} onWithdraw={withdraw} />
              ))}
            </div>
          </section>
        )}
      </main>
    </ProfessorShell>
  )
}

function ChangeRequestRow({
  request,
  onWithdraw,
}: {
  request: ProfessorChangeSummary
  onWithdraw: (id: number) => void
}) {
  const meta = statusMeta(request.status)
  const progress = changeRequestProgress(request)
  const action = changeRequestAction(request)

  return (
    <article className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_110px_160px_150px] lg:items-center lg:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-black text-[#27272a]">#{request.id}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${meta.className}`}>
            <meta.Icon size={12} /> {meta.label}
          </span>
        </div>
        <p className="m-0 mt-2 truncate text-[14px] font-black text-[#27272a]">{request.summary || request.offering_title}</p>
        <p className="m-0 mt-1 truncate text-[12px] font-bold text-[#71717b]">{request.offering_title} - {formatDate(request.created_at)}</p>
        {request.admin_note && (
          <p className="m-0 mt-2 flex items-start gap-2 text-[12px] font-bold leading-5 text-[#52525c]">
            <MessageSquare size={14} className="mt-0.5 shrink-0 text-[#5b60f9]" />
            <span className="line-clamp-2">{request.admin_note}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px] font-black lg:grid">
        <span className="rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[#52525c] tabular-nums">{request.operation_count} ops</span>
        {request.pending_count > 0 && <span className="rounded-full bg-[#fff7ed] px-2.5 py-1 text-[#9a3412] tabular-nums">{request.pending_count} pending</span>}
        {request.rejected_count > 0 && <span className="rounded-full bg-[#fef2f2] px-2.5 py-1 text-[#991b1b] tabular-nums">{request.rejected_count} rejected</span>}
      </div>

      <div aria-label={`Progression demande ${request.id}`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#71717b]">Reviewed</span>
          <span className="text-[12px] font-black text-[#27272a] tabular-nums">{progress.label}</span>
        </div>
        <progress
          className={`h-2 w-full overflow-hidden rounded-full bg-[#e4e4e7] ${progress.className}`}
          max={100}
          value={progress.percent}
          aria-label={`Progression validation ${request.id}`}
        />
      </div>

      <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
        <Link
          href={action.href}
          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-[11px] px-3 text-[12px] font-black no-underline transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96] ${action.className}`}
        >
          <Pencil size={13} />
          {action.cta}
        </Link>
        {request.status === 'pending' && (
          <button
            type="button"
            onClick={() => onWithdraw(request.id)}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[11px] border border-[#fecaca] bg-white px-3 text-[12px] font-black text-[#ef4444] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-red-50 active:scale-[0.96]"
          >
            <Trash2 size={13} /> Cancel
          </button>
        )}
      </div>
    </article>
  )
}

function QueueStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'attention' | 'success'
}) {
  const toneClass = tone === 'attention'
    ? 'text-[#9a3412]'
    : tone === 'success'
      ? 'text-[#166534]'
      : 'text-[#27272a]'

  return (
    <div className="rounded-[12px] bg-[#fbfbfc] px-3 py-2">
      <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-[#71717b]">{label}</span>
      <strong className={`mt-1 block text-[19px] font-black leading-none ${toneClass}`}>{value}</strong>
    </div>
  )
}

function EmptyChangeState({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  action?: React.ReactNode
}) {
  return (
    <div className="grid place-items-center rounded-[16px] border border-dashed border-[#d4d4d8] bg-white p-12 text-center">
      <span className="text-[#d4d4d8]">{icon}</span>
      <h2 className="m-0 mt-3 text-[18px] font-black text-[#27272a]">{title}</h2>
      <p className="m-0 mt-1 text-[14px] font-semibold text-[#a1a1aa]">{detail}</p>
      {action}
    </div>
  )
}

function buildChangeQueueStats(requests: ProfessorChangeSummary[]) {
  return requests.reduce((totals, request) => ({
    operations: totals.operations + request.operation_count,
    pending: totals.pending + request.pending_count,
    reviewed: totals.reviewed + request.applied_count + request.rejected_count,
  }), { operations: 0, pending: 0, reviewed: 0 })
}

function changeRequestMatchesSearch(request: ProfessorChangeSummary, query: string) {
  const meta = statusMeta(request.status)
  const haystack = [
    `demande ${request.id}`,
    `request ${request.id}`,
    request.offering_title,
    request.summary,
    request.status,
    meta.label,
    request.admin_note,
    formatDate(request.created_at),
  ].join(' ').toLowerCase()
  return haystack.includes(query)
}

function normalizeChangeStatus(value: string | null | undefined) {
  return value && CHANGE_FILTER_VALUES.has(value) ? value : 'all'
}

function changeRequestAction(request: ProfessorChangeSummary) {
  if (request.status === 'pending') {
    return {
      cta: 'Edit',
      href: `/professor/studio?request=${request.id}`,
      className: 'border border-[#c7c8ff] bg-[#5b60f9] text-white',
    }
  }
  if (request.status === 'partially_applied' || request.status === 'rejected') {
    return {
      cta: 'Revise',
      href: `/professor/studio?offering=${request.course_offering_id}`,
      className: 'border border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]',
    }
  }
  if (request.status === 'applied') {
    return {
      cta: 'Inspect',
      href: `/professor/studio?offering=${request.course_offering_id}`,
      className: 'border border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]',
    }
  }

  return {
    cta: 'Open',
    href: `/professor/studio?offering=${request.course_offering_id}`,
    className: 'border border-[#e4e4e7] bg-[#fbfbfc] text-[#52525c]',
  }
}

function changeRequestProgress(request: ProfessorChangeSummary) {
  const total = Math.max(request.operation_count, request.pending_count + request.applied_count + request.rejected_count)
  if (total <= 0) {
    return { percent: 0, label: '0/0', className: 'accent-[#d4d4d8]' }
  }

  const reviewed = request.applied_count + request.rejected_count
  const completeStatus = ['applied', 'rejected', 'failed', 'target_deleted'].includes(request.status)
  const reviewedCount = completeStatus && reviewed === 0 ? total : reviewed
  const percent = Math.max(0, Math.min(100, Math.round((reviewedCount / total) * 100)))
  const className = request.rejected_count > 0 || request.status === 'failed'
    ? 'accent-[#ef4444]'
    : request.pending_count > 0
      ? 'accent-[#f5900b]'
      : 'accent-[#16a34a]'

  return { percent, label: `${reviewedCount}/${total}`, className }
}

function formatDate(value: string) {
  return PROFESSOR_CHANGE_DATE_FORMATTER.format(new Date(value))
}
