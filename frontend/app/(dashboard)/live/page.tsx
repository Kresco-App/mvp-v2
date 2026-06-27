'use client'

import { useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Radio } from 'lucide-react'
import { useSWRConfig } from 'swr'
import { useNotificationChannelsSubscription } from '@/hooks/useNotificationChannelsSubscription'
import { apiDataErrorMessage } from '@/lib/apiData'
import { showToastError } from '@/lib/lazyToast'
import { formatLiveDateTime as formatDateTime, sortLiveInteractions } from '@/lib/liveInteractions'
import { studentLiveEmbedSWRKey, studentLiveInteractionsSWRKey, useStudentLiveScheduleData } from '@/lib/liveSessionData'
import { getStudentLiveEmbed, listStudentLiveInteractions, type StudentLiveSession } from '@/lib/professor'
import { hasSuccessfulSWRCacheData } from '@/lib/swrCache'
import { useAuthStore } from '@/lib/store'

export default function LivePage() {
  const user = useAuthStore((state) => state.user)
  const { cache: swrCache, mutate: mutateSWRCache } = useSWRConfig()
  const loadErrorRef = useRef<unknown>(null)
  const preloadedRoomKeysRef = useRef<Set<string>>(new Set())
  const {
    sessions,
    loading,
    error,
    mutateSessions,
  } = useStudentLiveScheduleData()

  useEffect(() => {
    if (!error) {
      loadErrorRef.current = null
      return
    }
    if (loadErrorRef.current !== error) {
      loadErrorRef.current = error
      showToastError(apiDataErrorMessage(error, 'Could not load live sessions.'))
    }
  }, [error])

  const refreshSessions = useCallback(() => {
    void mutateSessions()
  }, [mutateSessions])

  const pollSessions = useCallback(async () => {
    await mutateSessions()
  }, [mutateSessions])

  const preloadLiveRoom = useCallback((session: StudentLiveSession) => {
    if (!session.can_join) return

    const embedKey = studentLiveEmbedSWRKey(session.id, true)
    const embedPreloadId = `student-live-embed:${session.id}`
    if (embedKey && !hasSuccessfulSWRCacheData(embedKey, swrCache) && !preloadedRoomKeysRef.current.has(embedPreloadId)) {
      preloadedRoomKeysRef.current.add(embedPreloadId)
      const request = getStudentLiveEmbed(session.id)
        .then((embed) => ({ sessionId: session.id, embed }))
        .catch((error) => {
          preloadedRoomKeysRef.current.delete(embedPreloadId)
          throw error
        })
      void mutateSWRCache(embedKey, request, { populateCache: true, revalidate: false })
    }

    const interactionsKey = studentLiveInteractionsSWRKey(session.id)
    const interactionsPreloadId = `student-live-interactions:${session.id}`
    if (interactionsKey && !hasSuccessfulSWRCacheData(interactionsKey, swrCache) && !preloadedRoomKeysRef.current.has(interactionsPreloadId)) {
      preloadedRoomKeysRef.current.add(interactionsPreloadId)
      const request = listStudentLiveInteractions(session.id)
        .then((interactions) => ({ sessionId: session.id, interactions: sortLiveInteractions(interactions) }))
        .catch((error) => {
          preloadedRoomKeysRef.current.delete(interactionsPreloadId)
          throw error
        })
      void mutateSWRCache(interactionsKey, request, { populateCache: true, revalidate: false })
    }
  }, [mutateSWRCache, swrCache])

  useNotificationChannelsSubscription({
    userId: user?.id,
    onMessage: refreshSessions,
    fallbackPoll: pollSessions,
  })

  return (
    <section className="kresco-shell w-full max-w-[860px]">
      <div className="mb-8">
        <p className="figma-eyebrow inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#453dee]" aria-hidden="true" />
          Live
        </p>
        <h1 className="font-rounded text-balance text-[40px] font-bold leading-tight tracking-normal text-[#3f3f46]">Live sessions</h1>
        <p className="mt-2 max-w-[560px] text-pretty text-[20px] font-semibold leading-relaxed text-[#71717b]">
          Join your assigned filiere sessions from inside Kresco.
        </p>
      </div>

      <div className="grid gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => <LiveSkeleton key={index} />)
        ) : error && sessions.length === 0 ? (
          <article key="live-error" className="rounded-2xl border-2 border-[#fee2e2] bg-[#fef2f2] p-6">
            <CalendarDays className="text-[#991b1b]" size={28} />
            <h2 className="mt-4 text-[22px] font-bold leading-tight tracking-normal text-[#991b1b]">Could not load live sessions</h2>
            <p className="mt-2 text-[15px] font-semibold leading-relaxed text-[#b91c1c]">{apiDataErrorMessage(error, 'Could not load live sessions.')}</p>
            <button
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#991b1b] px-4 text-sm font-bold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-[#7f1d1d] active:scale-[0.96]"
              type="button"
              onClick={() => void mutateSessions()}
            >
              Retry
            </button>
          </article>
        ) : sessions.length === 0 ? (
          <article key="live-empty" className="rounded-2xl border-2 border-[#e4e4e7] bg-white p-6">
            <CalendarDays className="text-[#71717b]" size={28} />
            <h2 className="mt-4 text-[22px] font-bold leading-tight tracking-normal text-[#3f3f46]">No live sessions scheduled</h2>
            <p className="mt-2 text-[15px] font-semibold leading-relaxed text-[#71717b]">New professor sessions will appear here and in your calendar.</p>
          </article>
        ) : (
          sessions.map((session) => (
            <article
              className="rounded-2xl border-2 border-[#e4e4e7] bg-white p-5 shadow-none transition-[border-color,transform] duration-150 ease-out hover:border-[#d9d9e2]"
              key={session.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef1ff] text-[#453dee]">
                    {session.can_join && (
                      <span className="absolute inset-0 rounded-xl bg-[#dfe4ff]" aria-hidden="true" />
                    )}
                    <Radio className="relative z-10" size={24} strokeWidth={2.6} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-[0.12em] text-[#9f9fa9]">{session.subject_title || session.offering_title}</p>
                    <h2 className="mt-1 text-[24px] font-bold leading-tight tracking-normal text-[#3f3f46]">{session.title}</h2>
                    <p className="mt-1 text-[16px] font-semibold text-[#71717b]">{formatDateTime(session.starts_at)}</p>
                    {session.description && <p className="mt-3 max-w-[520px] break-words text-[14px] font-semibold leading-[1.4] text-[#52525c]">{session.description}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {session.can_join ? (
                    <div>
                      <Link
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#453dee] px-4 text-sm font-bold text-white shadow-[0_10px_22px_rgba(69,61,238,0.16)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#3932d6] active:scale-[0.96]"
                        href={`/live/${session.id}`}
                        onFocus={() => preloadLiveRoom(session)}
                        onMouseOver={() => preloadLiveRoom(session)}
                        onPointerEnter={() => preloadLiveRoom(session)}
                      >
                        Join
                        <ArrowRight size={17} strokeWidth={2.7} />
                      </Link>
                    </div>
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
  )
}

function LiveSkeleton() {
  return (
    <div
      className="relative h-[132px] overflow-hidden rounded-2xl border-2 border-[#e4e4e7] bg-white p-5"
      aria-hidden="true"
    >
      <div className="kresco-skeleton h-4 w-32 rounded" />
      <div className="kresco-skeleton mt-5 h-6 w-72 max-w-full rounded" />
      <div className="kresco-skeleton mt-3 h-4 w-44 max-w-full rounded" />
    </div>
  )
}
