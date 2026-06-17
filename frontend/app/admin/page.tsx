'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowRight, ClipboardCheck, Database, FileQuestion, FileText, GraduationCap,
  KeyRound, LibraryBig, ListChecks, Loader2, RotateCcw, Users,
} from 'lucide-react'
import { getJson } from '@/lib/apiClient'
import { getAdminRootUrl } from '@/lib/apiConfig'
import { listAdminChangeRequests, type AdminChangeRequestListItem } from '@/lib/studio'
import {
  EMPTY_OVERVIEW, DOMAIN_LABELS, formatNumber, percent, publishedRatio,
  type AdminOverview, type LoadState,
} from '@/lib/adminOverview'

const card = 'rounded-[16px] border-[2px] border-[#e4e4e7] bg-white'
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

function readinessWidthClass(pct: number) {
  if (pct >= 100) return 'w-full'
  if (pct <= 0) return READINESS_WIDTH_CLASSES[0]
  const bucket = Math.max(1, Math.min(19, Math.round(pct / 5)))
  return READINESS_WIDTH_CLASSES[bucket]
}

function KpiTile({ icon: Icon, label, value, hint, loading }: { icon: typeof Users; label: string; value: number; hint?: string; loading: boolean }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#f0f0ff] text-[#5b60f9]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="mt-3 text-[26px] font-black leading-none text-[#3f3f46]">{loading ? '—' : formatNumber(value)}</p>
      {hint && <p className="mt-1 text-[12px] font-bold text-[#a1a1aa]">{hint}</p>}
    </div>
  )
}

function ReadinessBar({ label, ratio }: { label: string; ratio: number }) {
  const pct = Math.round(ratio * 100)
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
  const kpis = [
    { icon: Users, label: 'Utilisateurs', value: totals.users, hint: `${formatNumber(totals.pro_users)} pro` },
    { icon: LibraryBig, label: 'Chapitres', value: totals.topics, hint: `${formatNumber(totals.topic_items)} leçons` },
    { icon: FileText, label: 'Ressources', value: totals.resources, hint: `${formatNumber(totals.tab_contents)} onglets` },
    { icon: ListChecks, label: 'Tentatives quiz', value: totals.quiz_attempts, hint: `${percent(overview.engagement?.quiz_attempt_pass_rate)} réussite` },
    { icon: Activity, label: 'Événements', value: totals.activity_events, hint: `${formatNumber(overview.engagement?.active_users_7d)} actifs 7j` },
    { icon: GraduationCap, label: 'Examens', value: totals.exam_problems, hint: `${formatNumber(totals.exams)} examens` },
  ]

  const readiness = Object.entries(overview.content_status ?? {})
    .map(([key, statuses]) => ({ label: DOMAIN_LABELS[key] ?? key, ratio: publishedRatio(statuses) }))
    .slice(0, 6)

  const pendingOps = reviews.reduce((sum, r) => sum + (r.pending_count || r.operation_count), 0)

  const shortcuts: [string, string, typeof Users][] = [
    ['Contenu (chapitres)', `${root}/topic/list`, LibraryBig],
    ['Ressources', `${root}/resource/list`, FileText],
    ['Quiz', `${root}/questionset/list`, FileQuestion],
    ['Banque d’examens', `${root}/exam/list`, GraduationCap],
    ['Utilisateurs', `${root}/user/list`, Users],
    ['Accès / abonnements', `${root}/usersubjectentitlement/list`, KeyRound],
  ]

  return (
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-8 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[24px] font-black leading-tight text-[#3f3f46]">Tableau de bord</h1>
          <p className="m-0 mt-1 text-[14px] font-semibold text-[#a1a1aa]">
            Vue d’ensemble de la plateforme, contenu et tâches du staff.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="inline-flex items-center gap-2 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3.5 py-2 text-[13px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Actualiser
        </button>
      </header>

      {state === 'fallback' && (
        <div className="mb-4 rounded-[12px] border-[2px] border-[#fcc94d] bg-[#fffbeb] px-4 py-3 text-[13px] font-bold text-[#92660b]">
          Les analyses en direct n’ont pas pu être chargées. Les raccourcis restent disponibles.
        </div>
      )}

      {/* Staff task: pending reviews */}
      <Link
        href="/admin/reviews"
        className={`mb-5 flex items-center gap-4 ${card} px-5 py-4 no-underline transition hover:border-[#5b60f9]`}
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#5b60f9] text-white">
          <ClipboardCheck size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[16px] font-black text-[#3f3f46]">
            {reviews.length > 0 ? `${reviews.length} demande(s) à réviser` : 'Aucune demande en attente'}
          </p>
          <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
            {reviews.length > 0 ? `${pendingOps} opération(s) proposée(s) par les professeurs` : 'Les nouvelles demandes des professeurs apparaîtront ici.'}
          </p>
        </div>
        {reviews.length > 0 && (
          <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#f5900b] px-2 text-[13px] font-black text-white">{reviews.length}</span>
        )}
        <ArrowRight size={18} className="shrink-0 text-[#a1a1aa]" />
      </Link>

      {/* KPIs */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => <KpiTile key={k.label} {...k} loading={loading} />)}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Content readiness */}
        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Préparation du contenu</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Part de contenu publié par domaine.</p>
          <div className="flex flex-col gap-3.5">
            {readiness.length > 0 ? readiness.map((r) => <ReadinessBar key={r.label} {...r} />)
              : <p className="text-[13px] font-semibold text-[#a1a1aa]">Aucune donnée de contenu.</p>}
          </div>
        </section>

        {/* SQLAdmin shortcuts */}
        <section className={`${card} p-5`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Gestion directe</h2>
            <a href={root} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-black text-[#5b60f9] no-underline">
              <Database size={14} /> SQLAdmin
            </a>
          </div>
          <div className="grid gap-2">
            {shortcuts.map(([label, href, Icon]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer"
                className="flex items-center justify-between rounded-[12px] border border-[#f4f4f5] px-3 py-2.5 no-underline transition hover:bg-[#fbfbfc]">
                <span className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#52525c]"><Icon size={16} className="text-[#a1a1aa]" /> {label}</span>
                <ArrowRight size={14} className="text-[#d4d4d8]" />
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
