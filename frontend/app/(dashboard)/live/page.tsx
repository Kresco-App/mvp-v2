'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Radio } from 'lucide-react'
import { toast } from 'sonner'
import { PermanentSidebar } from '@/components/figma'
import { getKrescoRealtime, userNotificationsChannelName } from '@/lib/ably'
import { listStudentLiveSessions, type StudentLiveSession } from '@/lib/professor'
import { useAuthStore } from '@/lib/store'

export default function LivePage() {
  const { user } = useAuthStore()
  const [sessions, setSessions] = useState<StudentLiveSession[]>([])
  const [loading, setLoading] = useState(true)

  const loadLiveSessions = useCallback(async () => {
    try {
      const data = await listStudentLiveSessions()
      const sorted = data.sort(compareSessions)
      setSessions(sorted)
    } catch {
      toast.error('Could not load live sessions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    document.title = 'Live Sessions - Kresco'
    void loadLiveSessions()
  }, [loadLiveSessions])

  useEffect(() => {
    if (!user?.id) return
    const realtime = getKrescoRealtime()
    if (!realtime) return
    const channel = realtime.channels.get(userNotificationsChannelName(user.id))
    const refresh = () => void loadLiveSessions()
    void channel.subscribe(refresh)
    return () => {
      void channel.unsubscribe(refresh)
    }
  }, [loadLiveSessions, user?.id])

  return (
    <main className="figma-container">
      <div className="figma-dashboard-grid">
        <section className="kresco-shell w-full max-w-[860px]">
          <div className="mb-8">
            <p className="figma-eyebrow">Live</p>
            <h1 className="font-rounded text-[40px] font-bold leading-tight tracking-normal text-[#3f3f46]">Live sessions</h1>
            <p className="mt-2 max-w-[560px] text-[20px] font-semibold leading-relaxed text-[#71717b]">
              Join your assigned filiere sessions from inside Kresco.
            </p>
          </div>

          <div className="grid gap-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => <LiveSkeleton key={index} />)
            ) : sessions.length === 0 ? (
              <article className="rounded-2xl border-2 border-[#e4e4e7] bg-white p-6">
                <CalendarDays className="text-[#71717b]" size={28} />
                <h2 className="mt-4 text-[22px] font-bold leading-tight tracking-normal text-[#3f3f46]">No live sessions scheduled</h2>
                <p className="mt-2 text-[15px] font-semibold leading-relaxed text-[#71717b]">New professor sessions will appear here and in your calendar.</p>
              </article>
            ) : (
              sessions.map((session) => (
                <article className="rounded-2xl border-2 border-[#e4e4e7] bg-white p-5 shadow-none" key={session.id}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#eef1ff] text-[#453dee]">
                        <Radio size={24} strokeWidth={2.6} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-black uppercase tracking-[0.12em] text-[#9f9fa9]">{session.subject_title || session.offering_title}</p>
                        <h2 className="mt-1 text-[24px] font-bold leading-tight tracking-normal text-[#3f3f46]">{session.title}</h2>
                        <p className="mt-1 text-[16px] font-semibold text-[#71717b]">{formatDateTime(session.starts_at)}</p>
                        {session.description && <p className="mt-3 max-w-[520px] text-[14px] font-semibold leading-[1.4] text-[#52525c]">{session.description}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {session.can_join ? (
                        <Link
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#453dee] px-4 text-sm font-bold text-white"
                          href={`/live/${session.id}`}
                        >
                          Join
                          <ArrowRight size={17} strokeWidth={2.7} />
                        </Link>
                      ) : (
                        <button
                          className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-xl border-2 border-[#e4e4e7] bg-[#f7f8fb] px-4 text-sm font-bold text-[#71717b]"
                          disabled
                          type="button"
                        >
                          Unavailable
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <PermanentSidebar />
      </div>
    </main>
  )
}

function LiveSkeleton() {
  return (
    <div className="h-[132px] animate-pulse rounded-2xl border-2 border-[#e4e4e7] bg-white p-5">
      <div className="h-4 w-32 rounded bg-[#f4f4f5]" />
      <div className="mt-5 h-6 w-72 rounded bg-[#f4f4f5]" />
      <div className="mt-3 h-4 w-44 rounded bg-[#f4f4f5]" />
    </div>
  )
}

function compareSessions(a: StudentLiveSession, b: StudentLiveSession) {
  const statusOrder: Record<string, number> = { live: 0, scheduled: 1, completed: 2, cancelled: 3 }
  const left = statusOrder[a.status] ?? 3
  const right = statusOrder[b.status] ?? 3
  if (left !== right) return left - right
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
