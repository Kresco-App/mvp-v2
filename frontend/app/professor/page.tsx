'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing, CheckCircle2, ClipboardList, Clock3, LockKeyhole, MessageCircle, Radio } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import {
  getProfessorDashboard,
  notifyProfessorLiveSession,
  startProfessorLiveSession,
  type CourseOffering,
  type ProfessorDashboard,
} from '@/lib/professor'

export default function ProfessorDashboardPage() {
  const [dashboard, setDashboard] = useState<ProfessorDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Professor Dashboard - Kresco'
    void load()
  }, [])

  async function load() {
    try {
      setDashboard(await getProfessorDashboard())
    } catch {
      toast.error('Could not load professor dashboard.')
    } finally {
      setLoading(false)
    }
  }

  const activeOffering = dashboard?.active_offering ?? null
  const live = dashboard?.upcoming_live_sessions?.[0] ?? null
  const pending = dashboard?.pending_change_requests ?? []
  const title = activeOffering ? offeringTitle(activeOffering) : 'No active offering'

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-8 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <section className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="m-0 text-[13px] font-black uppercase tracking-[0.12em] text-[#71717b]">Current offering</p>
            <h1 className="m-0 mt-2 text-[30px] font-black leading-[1.05] text-[#3f3f46]">Professor Dashboard</h1>
            <p className="m-0 mt-2 text-[15px] font-bold text-[#71717b]">{title}</p>
            {activeOffering && <OfferingChips offering={activeOffering} />}
          </div>
          <Link href="/professor/live" className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#453dee] px-4 text-[14px] font-black text-white no-underline">
            <Radio size={17} />
            Live sessions
          </Link>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_351px]">
          <section className="grid gap-5">
            <article className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-[12px] bg-[#f0f0ff] px-3 py-2 text-[12px] font-black text-[#453dee]">
                    <Clock3 size={15} />
                    {live?.status ?? 'No session'}
                  </div>
                  <h2 className="m-0 text-[24px] font-black leading-[1.12] text-[#3f3f46]">{live?.title ?? 'No upcoming live session'}</h2>
                  <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">
                    {live ? `${formatDateTime(live.starts_at)} - VdoCipher protected broadcast` : 'Schedule a live session for this offering.'}
                  </p>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-[#fff7df] text-[#f5900b]">
                  <Radio size={22} />
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!live || loading}
                  onClick={async () => {
                    if (!live) return
                    await notifyProfessorLiveSession(live.id)
                    toast.success('Live notification marked as sent.')
                    await load()
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] border-0 bg-[#453dee] px-4 text-[14px] font-black text-white disabled:opacity-40"
                >
                  <BellRing size={16} />
                  Notify students
                </button>
                <button
                  type="button"
                  disabled={!live || live.status === 'live'}
                  onClick={async () => {
                    if (!live) return
                    await startProfessorLiveSession(live.id)
                    toast.success('Live session started.')
                    await load()
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] border-[2px] border-[#f5900b] bg-white px-4 text-[14px] font-black text-[#f5900b] disabled:opacity-40"
                >
                  <Radio size={16} />
                  Start live
                </button>
              </div>
            </article>

            <div className="grid gap-5 xl:grid-cols-2">
              <article className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="m-0 text-[18px] font-black text-[#3f3f46]">Pending Change Requests</h2>
                  <Link href="/professor/changes" className="text-[13px] font-black text-[#453dee] no-underline">View</Link>
                </div>
                <div className="grid gap-3">
                  {loading ? (
                    <div className="rounded-[14px] bg-[#f7f7f9] px-4 py-4 text-[13px] font-bold text-[#71717b]">Loading requests...</div>
                  ) : pending.length > 0 ? (
                    pending.slice(0, 3).map((request) => (
                      <div key={request.id} className="flex items-center justify-between gap-3 rounded-[14px] bg-[#f7f7f9] px-4 py-3">
                        <div className="min-w-0">
                          <p className="m-0 text-[14px] font-black text-[#3f3f46]">{request.target_type.replace('_', ' ')}</p>
                          <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">Admin review required</p>
                        </div>
                        <span className="rounded-[10px] bg-[#f0f0ff] px-3 py-1 text-[11px] font-black text-[#453dee]">{request.status}</span>
                      </div>
                    ))
                  ) : (
                    <div className="grid place-items-center rounded-[14px] bg-[#f7f7f9] px-4 py-6 text-center">
                      <ClipboardList size={24} className="text-[#71717b]" />
                      <p className="m-0 mt-3 text-[14px] font-black text-[#3f3f46]">No pending requests</p>
                      <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">Submitted edits will appear here for admin review.</p>
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="m-0 text-[18px] font-black text-[#3f3f46]">Professor Chat</h2>
                  <Link href="/professor/chat" className="text-[13px] font-black text-[#453dee] no-underline">Open</Link>
                </div>
                <div className="grid gap-3">
                  <MetricRow icon={<MessageCircle size={17} />} label="Unread" value={dashboard?.chat_unread_count ?? 0} />
                  <MetricRow icon={<CheckCircle2 size={17} />} label="Pinned" value={dashboard?.chat_pinned_count ?? 0} />
                  <p className="m-0 rounded-[14px] bg-[#fff7df] px-4 py-3 text-[13px] font-bold leading-[1.35] text-[#7c5200]">
                    VIP private conversations are student-initiated only.
                  </p>
                </div>
              </article>
            </div>
          </section>

          <aside className="grid content-start gap-4">
            <article className="rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#fff7df] text-[#f5900b]"><LockKeyhole size={21} /></span>
                <div>
                  <h2 className="m-0 text-[17px] font-black text-[#3f3f46]">Today</h2>
                  <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">Teaching operations</p>
                </div>
              </div>
              <MetricRow icon={<Radio size={17} />} label="Live sessions" value={dashboard?.upcoming_live_sessions.length ?? 0} />
              <MetricRow icon={<CheckCircle2 size={17} />} label="Pending requests" value={dashboard?.pending_change_requests.length ?? 0} />
            </article>
          </aside>
        </div>
      </main>
    </ProfessorShell>
  )
}

function OfferingChips({ offering }: { offering: CourseOffering }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {[offering.subject_title, offering.track.niveau, offering.track.filiere].map((chip) => (
        <span key={chip} className="rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-1.5 text-[12px] font-black text-[#52525c]">
          {chip}
        </span>
      ))}
    </div>
  )
}

function MetricRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[#f7f7f9] px-4 py-3">
      <span className="flex items-center gap-2 text-[13px] font-black text-[#52525c]">{icon}{label}</span>
      <strong className="text-[16px] font-black text-[#3f3f46]">{value}</strong>
    </div>
  )
}

function offeringTitle(offering: CourseOffering) {
  return offering.title || `${offering.subject_title} - ${offering.track.niveau} ${offering.track.filiere}`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
