'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, BellRing, CheckCircle2, ClipboardList, Clock3, MessageCircle, Radio, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import RouteErrorState from '@/components/RouteErrorState'
import { apiDataErrorMessage } from '@/lib/apiData'
import { formatLiveDateTime as formatDateTime } from '@/lib/liveInteractions'
import { useProfessorDashboardData } from '@/lib/professorDashboardData'
import {
  notifyProfessorLiveSession,
  startProfessorLiveSession,
  type CourseOffering,
  type ProfessorLiveSession,
} from '@/lib/professor'

export default function ProfessorDashboardPage() {
  const [liveActionBusy, setLiveActionBusy] = useState<'notify' | 'start' | null>(null)
  const {
    dashboard,
    error,
    loading,
    isValidating,
    mutate,
  } = useProfessorDashboardData()
  const loadError = error ? apiDataErrorMessage(error, 'Could not load professor dashboard.') : ''
  const lastToastErrorRef = useRef('')

  useEffect(() => {
    if (!loadError) {
      lastToastErrorRef.current = ''
      return
    }
    if (loadError === lastToastErrorRef.current) return
    lastToastErrorRef.current = loadError
    toast.error(loadError)
  }, [loadError])

  async function retryDashboard() {
    try {
      await mutate()
    } catch {
      // SWR owns the latest error state; the effect above owns user-visible reporting.
    }
  }

  async function runDashboardLiveAction(action: 'notify' | 'start', task: () => Promise<unknown>, success: string, failure: string) {
    if (liveActionBusy) return
    setLiveActionBusy(action)
    try {
      await task()
      toast.success(success)
      await mutate()
    } catch {
      toast.error(failure)
    } finally {
      setLiveActionBusy(null)
    }
  }

  if (loading && !dashboard) {
    return (
      <ProfessorShell>
        <DashboardLoadingSkeleton />
      </ProfessorShell>
    )
  }

  const activeOffering = dashboard?.active_offering ?? null
  const liveSessions = sortDashboardLiveSessions(dashboard?.upcoming_live_sessions ?? [])
  const live = liveSessions[0] ?? null
  const pending = dashboard?.pending_change_requests ?? []
  const title = activeOffering ? offeringTitle(activeOffering) : 'No active offering'
  const readyLiveCount = liveSessions.filter((session) => session.status === 'live' || Boolean(session.vdocipher_live_id) || session.has_stream_credentials).length
  const liveReadiness = liveSessions.length > 0 ? Math.round((readyLiveCount / liveSessions.length) * 100) : 0
  const pendingOperations = pending.reduce((total, request) => total + request.pending_count, 0)
  const chatUnreadCount = dashboard?.chat_unread_count ?? 0
  const pinnedChatCount = dashboard?.chat_pinned_count ?? 0
  const liveChecklist = live ? dashboardLiveChecklist(live) : []
  const liveReadyCount = liveChecklist.filter((item) => item.ready).length
  const liveNotificationSent = live ? isDashboardLiveNotificationSent(live.notification_status) : false
  const liveCanStart = live ? live.status !== 'live' && isDashboardStreamConfigured(live) : false
  const liveLineup = liveSessions.slice(0, 3)
  const dashboardHealth = buildDashboardHealth({
    activeOffering,
    chatUnreadCount,
    liveReadiness,
    liveSessions,
    pendingOperations,
  })
  const liveAnalyticsHref = liveSessions.some((session) => session.status === 'live')
    ? '/professor/live?status=live'
    : liveSessions.some((session) => session.status === 'scheduled')
      ? '/professor/live?status=scheduled'
      : '/professor/live'
  const chatAnalyticsHref = chatUnreadCount > 0
    ? '/professor/chat?filter=unread'
    : pinnedChatCount > 0
      ? '/professor/chat?filter=pinned'
      : '/professor/chat'
  const reviewAnalyticsHref = pending.length > 0 ? '/professor/changes?status=pending' : '/professor/changes'
  const studioAnalyticsHref = activeOffering ? `/professor/studio?offering=${activeOffering.id}` : '/professor/studio'
  const dashboardRiskRadar = buildDashboardRiskRadar({
    signals: dashboardHealth.signals,
    liveHref: liveAnalyticsHref,
    chatHref: chatAnalyticsHref,
    reviewHref: reviewAnalyticsHref,
    studioHref: studioAnalyticsHref,
  })
  const dashboardPriorityRows = dashboardRiskRadar.slice(0, 3)

  if (!dashboard && !loading) {
    return (
      <ProfessorShell>
        <main className="grid min-h-[520px] place-items-center px-6 py-12">
          <RouteErrorState
            eyebrow="Professor dashboard unavailable"
            title="This professor dashboard could not be loaded."
            message={loadError || 'The dashboard data was empty or incomplete. Retry the request.'}
            homeHref="/professor/live"
            homeLabel="Open live sessions"
            onRetry={() => void retryDashboard()}
          />
        </main>
      </ProfessorShell>
    )
  }

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-6 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <section className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.12em] text-[#71717b]">Current offering</p>
            <h1 className="m-0 mt-1 text-[28px] font-black leading-[1.05] text-[#27272a]">Professor Dashboard</h1>
            <p className="m-0 mt-1 text-[14px] font-bold text-[#71717b]">{title}</p>
            {activeOffering && <OfferingChips offering={activeOffering} />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={studioAnalyticsHref} className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-white px-3 text-[13px] font-black text-[#3f3f46] no-underline">
              <ClipboardList size={15} />
              Studio
            </Link>
            <Link href="/professor/live" className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[#453dee] px-3 text-[13px] font-black text-white no-underline">
              <Radio size={15} />
              Live
            </Link>
          </div>
        </section>

        {loadError && (
          <section role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
            <div>
              <p className="m-0 text-[13px] font-black text-[#92400e]">Professor dashboard could not be refreshed.</p>
              <p className="m-0 mt-1 text-[12px] font-bold text-[#b45309]">Cached dashboard data stays visible while you retry.</p>
            </div>
            <button
              type="button"
              onClick={() => void retryDashboard()}
              disabled={isValidating}
              className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#92400e] px-3 text-[12px] font-black text-white disabled:opacity-60"
            >
              <RotateCcw size={15} />
              {isValidating ? 'Retrying...' : 'Retry'}
            </button>
          </section>
        )}

        <section className="mb-5 rounded-[16px] border border-[#e4e4e7] bg-white p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)] sm:p-5" aria-label="Professor dashboard overview">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="m-0 text-[12px] font-black uppercase tracking-[0.12em] text-[#71717b]">Overview</p>
              <h2 className="m-0 mt-1 text-[19px] font-black text-[#27272a]">Today</h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f7f7f9] px-3 py-1.5 text-[12px] font-black text-[#52525c]">
              <BarChart3 size={15} />
              {dashboardHealth.status}
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
            <div className="flex items-center gap-4 rounded-[14px] bg-[#fbfbfc] p-4">
              <span
                className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(#453dee ${dashboardHealth.score}%, #e4e4e7 0)` }}
                role="progressbar"
                aria-label="Overall professor operations health"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={dashboardHealth.score}
              >
                <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-white text-[20px] font-black text-[#27272a]">{dashboardHealth.score}%</span>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-black text-[#27272a]">{dashboardHealth.status}</span>
                <span className="mt-1 block text-[12px] font-bold leading-5 text-[#71717b]">{dashboardHealth.detail}</span>
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DashboardMetricCard
                label="Live readiness"
                value={liveSessions.length > 0 ? `${liveReadiness}%` : 'None'}
                detail={liveSessions.length > 0 ? `${readyLiveCount}/${liveSessions.length} ready` : 'Schedule live'}
                progress={liveSessions.length > 0 ? liveReadiness : 0}
                href={liveAnalyticsHref}
                bars={[65, 72, liveReadiness]}
              />
              <DashboardMetricCard
                label="Unread chat"
                value={chatUnreadCount}
                detail={`${pinnedChatCount} pinned`}
                progress={attentionProgress(chatUnreadCount)}
                href={chatAnalyticsHref}
                bars={[80, 64, attentionProgress(chatUnreadCount)]}
              />
              <DashboardMetricCard
                label="Review queue"
                value={pendingOperations}
                detail={`${pending.length} request${pending.length === 1 ? '' : 's'}`}
                progress={attentionProgress(pendingOperations)}
                href={reviewAnalyticsHref}
                bars={[92, 76, attentionProgress(pendingOperations)]}
              />
              <DashboardMetricCard
                label="Offering"
                value={activeOffering?.subject_title ?? 'None'}
                detail={activeOffering ? activeOffering.track.niveau : 'Choose course'}
                progress={activeOffering ? 100 : 0}
                href={studioAnalyticsHref}
                bars={[activeOffering ? 82 : 0, activeOffering ? 92 : 0, activeOffering ? 100 : 0]}
              />
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="grid gap-5">
            <article className="rounded-[16px] border border-[#e4e4e7] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#f0f0ff] px-3 py-1.5 text-[12px] font-black text-[#453dee]">
                    <Clock3 size={15} />
                    {live?.status ?? 'No session'}
                  </div>
                  <h2 className="m-0 text-[21px] font-black leading-[1.15] text-[#27272a]">{live?.title ?? 'No upcoming live session'}</h2>
                  <p className="m-0 mt-1 text-[13px] font-bold text-[#71717b]">
                    {live ? formatDateTime(live.starts_at) : 'Schedule a live session for this offering.'}
                  </p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[#fff7df] text-[#f5900b]">
                  <Radio size={20} />
                </span>
              </div>
              {live && (
                <section className="mb-4" aria-label="Next live readiness">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#71717b]">Readiness</span>
                    <span className="text-[12px] font-black text-[#52525c]">{liveReadyCount}/{liveChecklist.length} ready</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {liveChecklist.map((item) => <DashboardReadinessPill key={item.label} item={item} />)}
                  </div>
                </section>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!live || loading || isValidating || liveNotificationSent || liveActionBusy !== null}
                  onClick={() => {
                    if (!live) return
                    void runDashboardLiveAction('notify', () => notifyProfessorLiveSession(live.id), 'Live notification marked as sent.', 'Could not notify students.')
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] border-0 bg-[#453dee] px-4 text-[14px] font-black text-white disabled:opacity-40"
                >
                  <BellRing size={16} />
                  {liveActionBusy === 'notify' ? 'Notifying...' : liveNotificationSent ? 'Students notified' : 'Notify students'}
                </button>
                <button
                  type="button"
                  disabled={!liveCanStart || liveActionBusy !== null}
                  onClick={() => {
                    if (!live) return
                    void runDashboardLiveAction('start', () => startProfessorLiveSession(live.id), 'Live session started.', 'Could not start live session.')
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#f5900b] bg-white px-4 text-[14px] font-black text-[#f5900b] disabled:opacity-40"
                >
                  <Radio size={16} />
                  {liveActionBusy === 'start' ? 'Starting...' : 'Start live'}
                </button>
              </div>
              {live && !liveCanStart && live.status !== 'live' && (
                <p className="m-0 mt-3 text-[12px] font-bold text-[#9a3412]">Add a VdoCipher live ID or generated stream credentials before starting.</p>
              )}
            </article>

            <article className="rounded-[16px] border border-[#e4e4e7] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]" aria-label="Professor priority queue">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[18px] font-black text-[#27272a]">Priority queue</h2>
                  <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">Lowest health signals first.</p>
                </div>
                <span className="rounded-full bg-[#f7f7f9] px-2.5 py-1 text-[11px] font-black text-[#71717b]">{dashboardPriorityRows.length} items</span>
              </div>
              <div className="grid gap-2">
                {dashboardPriorityRows.map((item) => <DashboardQueueRow key={item.label} item={item} />)}
              </div>
            </article>
          </section>

          <aside className="grid content-start gap-4">
            <article className="rounded-[16px] border border-[#e4e4e7] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[17px] font-black text-[#27272a]">Live lineup</h2>
                  <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">{liveLineup.length} shown</p>
                </div>
                <Link href="/professor/live" className="text-[12px] font-black text-[#453dee] no-underline">Manage</Link>
              </div>
              <div className="grid gap-2" aria-label="Upcoming live lineup">
                {liveLineup.length > 0 ? (
                  liveLineup.map((session) => <DashboardLiveLineupItem key={session.id} session={session} />)
                ) : (
                  <Link href="/professor/live" className="rounded-[12px] border border-dashed border-[#d4d4d8] bg-[#fbfbfc] px-3 py-3 text-[12px] font-black text-[#453dee] no-underline">
                    Schedule next live
                  </Link>
                )}
              </div>
            </article>

            <article className="rounded-[16px] border border-[#e4e4e7] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="m-0 text-[17px] font-black text-[#27272a]">Course ops</h2>
                <span className="text-[12px] font-black text-[#71717b]">{activeOffering ? activeOffering.subject_title : 'No course'}</span>
              </div>
              <div className="grid gap-2">
                <DashboardCompactLink href={chatAnalyticsHref} icon={<MessageCircle size={15} />} label="Unread chat" value={chatUnreadCount} />
                <DashboardCompactLink href={reviewAnalyticsHref} icon={<ClipboardList size={15} />} label="Pending review" value={pendingOperations} />
                <DashboardCompactLink href={studioAnalyticsHref} icon={<CheckCircle2 size={15} />} label="Studio context" value={activeOffering ? 'Active' : 'Missing'} />
              </div>
            </article>
          </aside>
        </div>
      </main>
    </ProfessorShell>
  )
}

function DashboardLoadingSkeleton() {
  return (
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-6 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]" aria-label="Loading professor dashboard">
      <section className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="h-3 w-32 animate-pulse rounded-full bg-[#e4e4e7]" />
          <div className="mt-3 h-8 w-64 animate-pulse rounded-full bg-[#f4f4f5]" />
          <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-full bg-[#f4f4f5]" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-[12px] bg-[#e4e4e7] sm:w-32" />
      </section>

      <section className="mb-5 rounded-[16px] border border-[#e4e4e7] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="h-3 w-20 animate-pulse rounded-full bg-[#e4e4e7]" />
            <div className="mt-3 h-5 w-36 animate-pulse rounded-full bg-[#f4f4f5]" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-full bg-[#f4f4f5]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
          <div className="h-28 animate-pulse rounded-[14px] bg-[#fbfbfc]" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[14px] bg-[#fbfbfc]" />
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="grid gap-5">
          <div className="h-56 animate-pulse rounded-[16px] border border-[#e4e4e7] bg-white" />
          <div className="h-48 animate-pulse rounded-[16px] border border-[#e4e4e7] bg-white" />
        </section>
        <aside className="grid content-start gap-4">
          <div className="h-48 animate-pulse rounded-[16px] border border-[#e4e4e7] bg-white" />
          <div className="h-40 animate-pulse rounded-[16px] border border-[#e4e4e7] bg-white" />
        </aside>
      </div>
    </main>
  )
}

function DashboardMetricCard({
  label,
  value,
  detail,
  progress,
  href,
  bars,
}: {
  label: string
  value: number | string
  detail: string
  progress: number
  href: string
  bars: number[]
}) {
  const clampedProgress = Math.max(0, Math.min(100, progress))

  return (
    <Link href={href} className="group grid min-h-[112px] content-between rounded-[14px] border border-[#ececf0] bg-[#fbfbfc] p-3 no-underline transition hover:-translate-y-0.5 hover:border-[#c7c8ff] hover:bg-white">
      <span>
        <span className="block truncate text-[11px] font-black uppercase tracking-[0.1em] text-[#71717b]">{label}</span>
        <span className="mt-2 flex items-end justify-between gap-2">
          <strong className="block truncate text-[24px] font-black leading-none text-[#27272a]">{value}</strong>
          <span className="flex h-8 items-end gap-1" aria-hidden="true">
            {bars.map((bar, index) => (
              <span key={`${label}-${index}`} className="w-1.5 rounded-full bg-[#c7c8ff]" style={{ height: `${Math.max(20, Math.min(100, bar))}%` }} />
            ))}
          </span>
        </span>
        <span className="mt-1 block truncate text-[12px] font-bold text-[#71717b]">{detail}</span>
      </span>
      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[#e4e4e7]" aria-hidden="true">
        <span className="block h-full rounded-full bg-[#453dee] transition-all duration-500 group-hover:bg-[#5b60f9]" style={{ width: `${clampedProgress}%` }} />
      </span>
    </Link>
  )
}

type DashboardHealthSignalItem = {
  label: string
  status: string
  detail: string
  score: number
  tone: 'good' | 'warn' | 'critical'
}

type DashboardHealth = {
  score: number
  status: string
  detail: string
  signals: DashboardHealthSignalItem[]
}

type DashboardHealthInput = {
  activeOffering: CourseOffering | null
  chatUnreadCount: number
  liveReadiness: number
  liveSessions: ProfessorLiveSession[]
  pendingOperations: number
}

type DashboardRiskRadarItem = {
  label: string
  status: string
  detail: string
  score: number
  href: string
  action: string
  tone: DashboardHealthSignalItem['tone']
}

type DashboardRiskRadarInput = {
  signals: DashboardHealthSignalItem[]
  liveHref: string
  chatHref: string
  reviewHref: string
  studioHref: string
}

function DashboardQueueRow({ item }: { item: DashboardRiskRadarItem }) {
  const dotClass = item.tone === 'critical'
    ? 'bg-[#dc2626]'
    : item.tone === 'warn'
      ? 'bg-[#f5900b]'
      : 'bg-[#16a34a]'
  const clampedScore = Math.max(0, Math.min(100, item.score))

  return (
    <Link href={item.href} className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-[12px] border border-[#ececf0] bg-[#fbfbfc] px-3 py-3 no-underline transition hover:-translate-y-0.5 hover:border-[#c7c8ff] hover:bg-white">
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
          <span className="truncate text-[13px] font-black text-[#27272a]">{item.label}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#71717b]">{clampedScore}%</span>
        </span>
        <span className="mt-1 block truncate text-[12px] font-bold text-[#71717b]">{item.status} - {item.detail}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-[12px] font-black text-[#453dee]">
        {item.action}
        <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

function DashboardLiveLineupItem({ session }: { session: ProfessorLiveSession }) {
  const streamReady = isDashboardStreamConfigured(session)
  const notified = isDashboardLiveNotificationSent(session.notification_status)
  const liveNow = session.status === 'live'

  return (
    <Link href={`/professor/live/${session.id}`} className="group grid gap-2 rounded-[12px] border border-[#ececf0] bg-[#fbfbfc] px-3 py-3 no-underline transition hover:-translate-y-0.5 hover:border-[#c7c8ff] hover:bg-white">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-black text-[#27272a]">{session.title}</span>
          <span className="mt-1 block text-[11px] font-bold leading-4 text-[#71717b]">{formatDateTime(session.starts_at)}</span>
        </span>
        <ArrowRight size={14} className="mt-0.5 shrink-0 text-[#453dee] transition group-hover:translate-x-0.5" />
      </span>
      <span className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#52525c]">{liveNow ? 'On air' : session.status}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#52525c]">{streamReady ? 'Stream ready' : 'Stream gap'}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#52525c]">{notified ? 'Notified' : 'Notify pending'}</span>
      </span>
    </Link>
  )
}

function DashboardCompactLink({
  href,
  icon,
  label,
  value,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: number | string
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#ececf0] bg-[#fbfbfc] px-3 py-3 text-[#27272a] no-underline transition hover:border-[#c7c8ff] hover:bg-white">
      <span className="flex min-w-0 items-center gap-2 text-[13px] font-black">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-white text-[#453dee]">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <strong className="shrink-0 text-[13px] font-black text-[#27272a]">{value}</strong>
    </Link>
  )
}

type DashboardReadinessItem = {
  label: string
  detail: string
  ready: boolean
}

function DashboardReadinessPill({ item }: { item: DashboardReadinessItem }) {
  const toneClass = item.ready
    ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
    : 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]'

  return (
    <div className={`min-w-0 rounded-[12px] border px-3 py-2 ${toneClass}`}>
      <span className="flex items-center gap-2">
        {item.ready ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
        <span className="truncate text-[12px] font-black">{item.label}</span>
      </span>
      <span className="mt-1 block truncate text-[11px] font-bold opacity-80">{item.detail}</span>
    </div>
  )
}

function dashboardLiveChecklist(session: ProfessorLiveSession): DashboardReadinessItem[] {
  const streamConfigured = isDashboardStreamConfigured(session)
  const credentialsStored = Boolean(session.has_stream_credentials)
  const studentsNotified = isDashboardLiveNotificationSent(session.notification_status)
  const roomActive = session.status === 'live'

  return [
    {
      label: streamConfigured ? 'Stream linked' : 'Stream missing',
      detail: streamConfigured ? 'VdoCipher attached' : 'Add live ID',
      ready: streamConfigured,
    },
    {
      label: credentialsStored ? 'OBS saved' : 'OBS not saved',
      detail: credentialsStored ? 'Key stored' : 'Reveal credentials',
      ready: credentialsStored,
    },
    {
      label: studentsNotified ? 'Students notified' : 'Notify pending',
      detail: studentsNotified ? 'Reminder sent' : 'Send reminder',
      ready: studentsNotified,
    },
    {
      label: roomActive ? 'On air' : 'Room ready',
      detail: roomActive ? 'Broadcast live' : 'Open at start',
      ready: true,
    },
  ]
}

function isDashboardStreamConfigured(session: ProfessorLiveSession) {
  return Boolean(session.vdocipher_live_id || session.has_stream_credentials)
}

function isDashboardLiveNotificationSent(status: string) {
  return status === 'sent' || status === 'notified' || status === 'delivered'
}

const DASHBOARD_LIVE_STATUS_ORDER: Record<string, number> = {
  live: 0,
  scheduled: 1,
  completed: 2,
  cancelled: 3,
}

function sortDashboardLiveSessions(sessions: ProfessorLiveSession[]) {
  return [...sessions].sort((a, b) => {
    const statusDelta = (DASHBOARD_LIVE_STATUS_ORDER[a.status] ?? 9) - (DASHBOARD_LIVE_STATUS_ORDER[b.status] ?? 9)
    if (statusDelta !== 0) return statusDelta
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  })
}

function OfferingChips({ offering }: { offering: CourseOffering }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {[offering.subject_title, offering.track.niveau, offering.track.filiere].map((chip) => (
        <span key={chip} className="rounded-full border border-[#e4e4e7] bg-white px-3 py-1 text-[12px] font-black text-[#52525c]">
          {chip}
        </span>
      ))}
    </div>
  )
}

function offeringTitle(offering: CourseOffering) {
  return offering.title || `${offering.subject_title} - ${offering.track.niveau} ${offering.track.filiere}`
}

function attentionProgress(value: number) {
  if (value <= 0) return 100
  return Math.max(15, 100 - Math.min(value, 10) * 8)
}

function healthTone(score: number): DashboardHealthSignalItem['tone'] {
  if (score >= 85) return 'good'
  if (score >= 60) return 'warn'
  return 'critical'
}

function buildDashboardHealth({
  activeOffering,
  chatUnreadCount,
  liveReadiness,
  liveSessions,
  pendingOperations,
}: DashboardHealthInput): DashboardHealth {
  const liveScore = liveSessions.length > 0 ? liveReadiness : 35
  const chatScore = attentionProgress(chatUnreadCount)
  const reviewScore = attentionProgress(pendingOperations)
  const offeringScore = activeOffering ? 100 : 0
  const score = Math.round((liveScore + chatScore + reviewScore + offeringScore) / 4)
  const status = score >= 85 ? 'Healthy' : score >= 65 ? 'Needs attention' : 'At risk'
  const weakestSignals = [
    { label: 'live setup', score: liveScore },
    { label: 'student replies', score: chatScore },
    { label: 'studio review', score: reviewScore },
    { label: 'course context', score: offeringScore },
  ].filter((signal) => signal.score < 85)
  const detail = weakestSignals.length === 0
    ? 'All operations are in range.'
    : `Watch ${weakestSignals.map((signal) => signal.label).join(', ')}.`

  return {
    score,
    status,
    detail,
    signals: [
      {
        label: 'Live setup',
        status: liveSessions.length > 0 ? `${liveReadiness}% ready` : 'No sessions',
        detail: liveSessions.length > 0 ? `${liveSessions.length} live room${liveSessions.length === 1 ? '' : 's'} tracked.` : 'Schedule a room.',
        score: liveScore,
        tone: healthTone(liveScore),
      },
      {
        label: 'Student replies',
        status: chatUnreadCount > 0 ? `${chatUnreadCount} unread` : 'Clear',
        detail: chatUnreadCount > 0 ? 'Unread VIP messages need a response.' : 'Inbox is clear.',
        score: chatScore,
        tone: healthTone(chatScore),
      },
      {
        label: 'Studio review',
        status: pendingOperations > 0 ? `${pendingOperations} waiting` : 'Clear',
        detail: pendingOperations > 0 ? 'Pending content operations are with admin.' : 'No pending review.',
        score: reviewScore,
        tone: healthTone(reviewScore),
      },
      {
        label: 'Course context',
        status: activeOffering ? 'Active' : 'Missing',
        detail: activeOffering ? `${activeOffering.subject_title} is selected.` : 'Pick an offering.',
        score: offeringScore,
        tone: healthTone(offeringScore),
      },
    ],
  }
}

function buildDashboardRiskRadar({
  signals,
  liveHref,
  chatHref,
  reviewHref,
  studioHref,
}: DashboardRiskRadarInput): DashboardRiskRadarItem[] {
  const destinationByLabel: Record<string, { href: string; action: string }> = {
    'Live setup': { href: liveHref, action: 'Open live' },
    'Student replies': { href: chatHref, action: 'Open inbox' },
    'Studio review': { href: reviewHref, action: 'Open review' },
    'Course context': { href: studioHref, action: 'Open Studio' },
  }

  return [...signals]
    .sort((left, right) => left.score - right.score)
    .map((signal) => {
      const destination = destinationByLabel[signal.label] ?? { href: '/professor', action: 'Review' }
      return {
        label: signal.label,
        status: signal.status,
        detail: signal.detail,
        score: signal.score,
        tone: signal.tone,
        href: destination.href,
        action: destination.action,
      }
    })
}
