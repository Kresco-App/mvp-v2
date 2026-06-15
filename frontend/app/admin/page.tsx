'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileQuestion,
  FileText,
  Gauge,
  GraduationCap,
  KeyRound,
  LibraryBig,
  LineChart,
  ListChecks,
  Lock,
  MessageSquare,
  NotebookPen,
  Search,
  ShieldCheck,
  RotateCcw,
  Trophy,
  Users,
  Wand2,
} from 'lucide-react'
import { getJson } from '@/lib/apiClient'
import { getAdminRootUrl } from '@/lib/apiConfig'
import {
  DOMAIN_LABELS,
  EMPTY_OVERVIEW,
  filterCrudCatalog,
  formatNumber,
  groupByDomain,
  numberValue,
  percent,
  publishedRatio,
  sumValues,
  type AdminOverview,
  type LoadState,
} from '@/lib/adminOverview'


const DOMAIN_ICONS: Record<string, any> = {
  'knowledge-base': LibraryBig,
  resources: FileText,
  quiz: FileQuestion,
  'exam-bank': GraduationCap,
  'users-access': Users,
  'access-billing': KeyRound,
  'progress-xp': Trophy,
  engagement: Activity,
  'notes-saves-comments': MessageSquare,
  calendar: CalendarDays,
  notifications: Bell,
  'admin-audit': ClipboardList,
}

function adminRoot(): string {
  return getAdminRootUrl()
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview>(EMPTY_OVERVIEW)
  const [state, setState] = useState<LoadState>('loading')
  const [query, setQuery] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)
  const root = useMemo(adminRoot, [])

  useEffect(() => {
    let mounted = true
    setState('loading')
    getJson<AdminOverview>('/admin/overview')
      .then((data) => {
        if (!mounted) return
        setOverview(data ?? EMPTY_OVERVIEW)
        setState('ready')
      })
      .catch((error) => {
        if (!mounted) return
        if (error?.response?.status === 403) {
          setState('forbidden')
          return
        }
        setOverview(EMPTY_OVERVIEW)
        setState('fallback')
      })
    return () => { mounted = false }
  }, [reloadNonce])

  const filteredCrud = useMemo(() => {
    return filterCrudCatalog(overview.crud_catalog, query)
  }, [overview.crud_catalog, query])

  const groupedCrud = useMemo(() => groupByDomain(filteredCrud), [filteredCrud])

  const topStats = [
    { label: 'Users', value: overview.totals.users, icon: Users, hint: `${formatNumber(overview.totals.pro_users)} pro` },
    { label: 'Topics', value: overview.totals.topics, icon: LibraryBig, hint: `${formatNumber(overview.totals.topic_items)} items` },
    { label: 'Resources', value: overview.totals.resources, icon: FileText, hint: `${formatNumber(overview.totals.tab_contents)} tabs` },
    { label: 'Quiz attempts', value: overview.totals.quiz_attempts, icon: ListChecks, hint: percent(overview.engagement.quiz_attempt_pass_rate) },
    { label: 'Activity events', value: overview.totals.activity_events, icon: Activity, hint: `${formatNumber(overview.engagement.active_users_7d)} active 7d` },
    { label: 'Exam problems', value: overview.totals.exam_problems, icon: GraduationCap, hint: `${formatNumber(overview.totals.exams)} exams` },
  ]

  const readiness = [
    { label: 'Subjects', statuses: overview.content_status.subjects, totalKey: 'subjects' },
    { label: 'Topics', statuses: overview.content_status.topics, totalKey: 'topics' },
    { label: 'Topic items', statuses: overview.content_status.topic_items, totalKey: 'topic_items' },
    { label: 'Resources', statuses: overview.content_status.resources, totalKey: 'resources' },
    { label: 'Tabs', statuses: overview.content_status.tab_contents, totalKey: 'tab_contents' },
    { label: 'Exam problems', statuses: overview.content_status.exam_problems, totalKey: 'exam_problems' },
  ]

  if (state === 'forbidden') {
    return (
      <>
        <div className="min-h-screen bg-slate-950 px-6 py-10">
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <Lock size={22} />
            </div>
            <h1 className="text-xl font-bold text-white">Staff access required</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The admin analytics API is protected by the backend staff guard. Sign in with a staff account, or use the SQLAdmin password flow for direct CRUD access.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={root} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                <Database size={16} /> Open SQLAdmin
              </a>
              <Link href="/home" className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800/50">
                Back to app
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="border-b border-slate-800 bg-slate-900">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-400">
                <ShieldCheck size={15} /> Kresco admin
              </div>
              <h1 className="mt-2 text-2xl font-bold text-white">Operations control center</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Analytics, content readiness, and direct CRUD coverage for the Topic model.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`${root}/topic/list`} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                <LibraryBig size={16} /> Topics
              </a>
              <a href={root} className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800/50">
                <Database size={16} /> SQLAdmin
              </a>
            </div>
          </div>
        </div>

        <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
          <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Runtime</p>
              <div className="mt-3 space-y-3 text-sm">
                <StatusLine icon={Gauge} label="API status" value={state === 'ready' ? 'Live analytics' : state === 'loading' ? 'Loading' : 'Fallback catalog'} tone={state === 'ready' ? 'good' : 'warn'} />
                <StatusLine icon={Database} label="CRUD source" value="SQLAdmin registry" tone="good" />
                <StatusLine icon={ShieldCheck} label="Validation mode" value={overview.ops_readiness?.local_validation?.mode ?? 'local only'} tone="good" />
                <StatusLine icon={Wand2} label="Model language" value="Topics, items, resources" tone="good" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Primary paths</p>
              <nav className="mt-3 grid gap-1">
                {([
                  ['Content', `${root}/topic/list`, LibraryBig],
                  ['Resources', `${root}/resource/list`, FileText],
                  ['Quizzes', `${root}/quiz/list`, FileQuestion],
                  ['Exam bank', `${root}/exam/list`, GraduationCap],
                  ['Users', `${root}/user/list`, Users],
                  ['Access', `${root}/user-subject-entitlement/list`, KeyRound],
                ] as [string, string, any][]).map(([label, href, Icon]) => (
                  <a key={String(label)} href={String(href)} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-white">
                    <span className="flex items-center gap-2"><Icon size={15} /> {label}</span>
                    <ChevronRight size={14} />
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="space-y-6">
            {state === 'fallback' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                <p>Live analytics could not be loaded. The CRUD catalog is still available from the known SQLAdmin registry.</p>
                <button
                  type="button"
                  onClick={() => setReloadNonce((value) => value + 1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-500/25"
                >
                  <RotateCcw size={14} />
                  Retry analytics
                </button>
              </div>
            )}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {topStats.map((stat) => (
                <MetricTile key={stat.label} {...stat} loading={state === 'loading'} />
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-white">Content readiness</h2>
                    <p className="text-sm text-slate-500">Publish state across the canonical content hierarchy.</p>
                  </div>
                  <CheckCircle2 className="text-green-500" size={20} />
                </div>
                <div className="mt-5 space-y-4">
                  {readiness.map((item) => (
                    <ReadinessRow
                      key={item.label}
                      label={item.label}
                      total={overview.totals[item.totalKey]}
                      statuses={item.statuses}
                      loading={state === 'loading'}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                <AnalyticsPanel
                  icon={LineChart}
                  title="Engagement"
                  rows={[
                    ['Active users 7d', formatNumber(overview.engagement.active_users_7d)],
                    ['Events 7d', formatNumber(overview.engagement.activity_events_7d)],
                    ['Quiz pass rate', percent(overview.engagement.quiz_attempt_pass_rate)],
                    ['Watch minutes', formatNumber(overview.engagement.total_watch_minutes)],
                  ]}
                  loading={state === 'loading'}
                />
                <AnalyticsPanel
                  icon={CircleDollarSign}
                  title="Access and billing"
                  rows={[
                    ['Pro users', formatNumber(overview.totals.pro_users)],
                    ['Entitlements', formatNumber(overview.totals.subject_entitlements)],
                    ['Active now', formatNumber(overview.ops_readiness?.access?.active_entitlements_now)],
                    ['Subject coverage', percent(overview.ops_readiness?.access?.subject_scope_coverage_percent)],
                    ['Gated topic items', formatNumber(overview.access_billing?.gated_content?.topic_items_with_required_tier)],
                    ['Free previews', formatNumber(overview.access_billing?.gated_content?.free_preview_topic_items)],
                  ]}
                  loading={state === 'loading'}
                />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <AnalyticsPanel
                icon={Trophy}
                title="Progress and XP"
                rows={[
                  ['Total XP', formatNumber(overview.progress_xp.total_xp)],
                  ['Completed items', formatNumber(overview.progress_xp.completed_topic_items)],
                  ['Completed lessons', formatNumber(overview.progress_xp.completed_lessons)],
                ]}
                loading={state === 'loading'}
              />
              <AnalyticsPanel
                icon={NotebookPen}
                title="Notes and saves"
                rows={[
                  ['Notes', formatNumber(overview.interactions.notes)],
                  ['Saved items', formatNumber(overview.interactions.saved_items)],
                  ['Comments', formatNumber(overview.interactions.comments)],
                ]}
                loading={state === 'loading'}
              />
              <AnalyticsPanel
                icon={CalendarDays}
                title="Calendar"
                rows={[
                  ['Upcoming', formatNumber(overview.calendar.upcoming_events)],
                  ['Live', formatNumber(overview.calendar.live_events)],
                  ['Total events', formatNumber(overview.totals.calendar_events)],
                ]}
                loading={state === 'loading'}
              />
              <AnalyticsPanel
                icon={Bell}
                title="Notifications"
                rows={[
                  ['Total', formatNumber(overview.notifications.total)],
                  ['Unread', formatNumber(overview.notifications.unread)],
                  ['Created 7d', formatNumber(overview.notifications.created_7d)],
                ]}
                loading={state === 'loading'}
              />
              <AnalyticsPanel
                icon={ClipboardList}
                title="Admin audit"
                rows={[
                  ['Total', formatNumber(overview.admin_audit?.total)],
                  ['Created 7d', formatNumber(overview.admin_audit?.created_7d)],
                  ['Models touched', formatNumber(Object.keys(overview.admin_audit?.by_model ?? {}).length)],
                ]}
                loading={state === 'loading'}
              />
              <AnalyticsPanel
                icon={ShieldCheck}
                title="Ops readiness"
                rows={[
                  ['Content gaps', formatNumber(sumValues(overview.ops_readiness?.content_gaps))],
                  ['Unknown gates', formatNumber(numberValue(overview.ops_readiness?.access?.unknown_tier_gate_values) + numberValue(overview.ops_readiness?.access?.unknown_feature_gate_values))],
                  ['Video IDs missing', formatNumber(overview.ops_readiness?.provider_readiness?.video_resources_missing_provider_id)],
                ]}
                loading={state === 'loading'}
              />
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900">
              <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">CRUD catalog</h2>
                  <p className="text-sm text-slate-500">Every operational model exposed by the backend SQLAdmin registry.</p>
                </div>
                <div className="relative w-full lg:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    aria-label="Search models"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search models"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none ring-indigo-500/30 placeholder:text-slate-500 focus:ring-4"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-800">
                {Object.entries(groupedCrud).map(([domain, items]) => {
                  const Icon = DOMAIN_ICONS[domain] ?? Database
                  return (
                    <div key={domain} className="grid gap-4 p-5 xl:grid-cols-[220px_minmax(0,1fr)]">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-white">
                          <Icon size={17} className="text-indigo-400" />
                          {DOMAIN_LABELS[domain] ?? domain}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{items.length} models</p>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {items.map((item) => (
                          <a
                            key={`${item.domain}-${item.slug}`}
                            href={`${root}/${item.slug}/list`}
                            className="group rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 hover:border-indigo-500/40 hover:bg-slate-800/50"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{item.name_plural}</p>
                                <p className="mt-0.5 truncate text-xs text-slate-500">{item.model}</p>
                              </div>
                              <ChevronRight size={15} className="mt-0.5 text-slate-500 group-hover:text-indigo-400" />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {Object.entries(item.actions).map(([action, enabled]) => (
                                <span
                                  key={action}
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                    enabled ? 'bg-green-500/10 text-green-600' : 'bg-slate-800 text-slate-500'
                                  }`}
                                >
                                  {action}
                                </span>
                              ))}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  )
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string
  value: unknown
  hint: string
  icon: any
  loading: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400">
          <Icon size={19} />
        </div>
        <BarChart3 size={16} className="text-slate-500" />
      </div>
      <p className="mt-5 text-2xl font-bold text-white">{loading ? '...' : formatNumber(value)}</p>
      <div className="mt-1 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-400">{loading ? '' : hint}</span>
      </div>
    </div>
  )
}

function ReadinessRow({
  label,
  total,
  statuses,
  loading,
}: {
  label: string
  total: unknown
  statuses?: Record<string, number>
  loading: boolean
}) {
  const ratio = publishedRatio(statuses)
  const statusText = Object.entries(statuses ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ')

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{loading ? 'Loading status' : statusText || 'No status rows yet'}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-white">{loading ? '...' : formatNumber(total)}</p>
          <p className="text-xs text-slate-500">{ratio}% ready</p>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
          <rect width={loading ? 25 : ratio} height="1" fill="#4f46e5" rx="0.5" />
        </svg>
      </div>
    </div>
  )
}

function AnalyticsPanel({
  title,
  rows,
  icon: Icon,
  loading,
}: {
  title: string
  rows: [string, string][]
  icon: any
  loading: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-indigo-400">
          <Icon size={17} />
        </div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-bold text-white">{loading ? '...' : value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusLine({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: any
  tone: 'good' | 'warn'
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg ${tone === 'good' ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}>
        <Icon size={14} />
      </div>
      <div>
        <p className="font-semibold text-white">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}
