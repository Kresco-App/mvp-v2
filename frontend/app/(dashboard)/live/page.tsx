'use client'

import { useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarDays, Radio } from 'lucide-react'
import { toast } from 'sonner'
import { useNotificationChannelsSubscription } from '@/hooks/useNotificationChannelsSubscription'
import { apiDataErrorMessage } from '@/lib/apiData'
import { formatLiveDateTime as formatDateTime } from '@/lib/liveInteractions'
import { useStudentLiveScheduleData } from '@/lib/liveSessionData'
import { useAuthStore } from '@/lib/store'

const pageTransition = { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] } as const
const cardTransition = { type: 'spring', stiffness: 420, damping: 36, mass: 0.85 } as const

export default function LivePage() {
  const user = useAuthStore((state) => state.user)
  const reduceMotion = useReducedMotion()
  const loadErrorRef = useRef<unknown>(null)
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
      toast.error(apiDataErrorMessage(error, 'Could not load live sessions.'))
    }
  }, [error])

  const refreshSessions = useCallback(() => {
    void mutateSessions()
  }, [mutateSessions])

  const pollSessions = useCallback(async () => {
    await mutateSessions()
  }, [mutateSessions])

  useNotificationChannelsSubscription({
    userId: user?.id,
    onMessage: refreshSessions,
    fallbackPoll: pollSessions,
  })

  return (
    <motion.section
      className="kresco-shell w-full max-w-[860px]"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={pageTransition}
    >
      <motion.div
        className="mb-8"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...pageTransition, delay: 0.04 }}
      >
        <p className="figma-eyebrow inline-flex items-center gap-2">
          <motion.span
            className="h-2 w-2 rounded-full bg-[#453dee]"
            animate={reduceMotion ? undefined : { opacity: [0.45, 1, 0.45], scale: [1, 1.25, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
          Live
        </p>
        <h1 className="font-rounded text-balance text-[40px] font-bold leading-tight tracking-normal text-[#3f3f46]">Live sessions</h1>
        <p className="mt-2 max-w-[560px] text-pretty text-[20px] font-semibold leading-relaxed text-[#71717b]">
          Join your assigned filiere sessions from inside Kresco.
        </p>
      </motion.div>

      <motion.div
        className="grid gap-4"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...pageTransition, delay: 0.1 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <LiveSkeleton index={index} key={index} reduceMotion={Boolean(reduceMotion)} />)
          ) : error && sessions.length === 0 ? (
            <motion.article
              key="live-error"
              layout
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.985 }}
              transition={cardTransition}
              className="rounded-2xl border-2 border-[#fee2e2] bg-[#fef2f2] p-6"
            >
              <CalendarDays className="text-[#991b1b]" size={28} />
              <h2 className="mt-4 text-[22px] font-bold leading-tight tracking-normal text-[#991b1b]">Could not load live sessions</h2>
              <p className="mt-2 text-[15px] font-semibold leading-relaxed text-[#b91c1c]">{apiDataErrorMessage(error, 'Could not load live sessions.')}</p>
              <motion.button
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#991b1b] px-4 text-sm font-bold text-white"
                type="button"
                onClick={() => void mutateSessions()}
                whileHover={reduceMotion ? undefined : { y: -1 }}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              >
                Retry
              </motion.button>
            </motion.article>
          ) : sessions.length === 0 ? (
            <motion.article
              key="live-empty"
              layout
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.985 }}
              transition={cardTransition}
              className="rounded-2xl border-2 border-[#e4e4e7] bg-white p-6"
            >
              <CalendarDays className="text-[#71717b]" size={28} />
              <h2 className="mt-4 text-[22px] font-bold leading-tight tracking-normal text-[#3f3f46]">No live sessions scheduled</h2>
              <p className="mt-2 text-[15px] font-semibold leading-relaxed text-[#71717b]">New professor sessions will appear here and in your calendar.</p>
            </motion.article>
          ) : (
            sessions.map((session, index) => (
              <motion.article
                className="rounded-2xl border-2 border-[#e4e4e7] bg-white p-5 shadow-none transition-colors hover:border-[#d9d9e2]"
                key={session.id}
                layout
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.985 }}
                transition={{ ...cardTransition, delay: Math.min(index * 0.035, 0.18) }}
                whileHover={reduceMotion ? undefined : { y: -2 }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef1ff] text-[#453dee]">
                      {session.can_join && (
                        <motion.span
                          className="absolute inset-0 rounded-xl bg-[#dfe4ff]"
                          animate={reduceMotion ? undefined : { opacity: [0.45, 0.9, 0.45], scale: [0.92, 1.12, 0.92] }}
                          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut', delay: index * 0.08 }}
                          aria-hidden="true"
                        />
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
                      <motion.div whileHover={reduceMotion ? undefined : { y: -1 }} whileTap={reduceMotion ? undefined : { scale: 0.96 }}>
                        <Link
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#453dee] px-4 text-sm font-bold text-white shadow-[0_10px_22px_rgba(69,61,238,0.16)] transition-colors hover:bg-[#3932d6]"
                          href={`/live/${session.id}`}
                        >
                          Join
                          <ArrowRight size={17} strokeWidth={2.7} />
                        </Link>
                      </motion.div>
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
              </motion.article>
            ))
          )}
        </AnimatePresence>
      </motion.div>
    </motion.section>
  )
}

function LiveSkeleton({ index, reduceMotion }: { index: number; reduceMotion: boolean }) {
  return (
    <motion.div
      className="relative h-[132px] overflow-hidden rounded-2xl border-2 border-[#e4e4e7] bg-white p-5"
      layout
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{ ...cardTransition, delay: index * 0.04 }}
      aria-hidden="true"
    >
      <motion.div
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent opacity-70"
        animate={reduceMotion ? undefined : { x: ['-140%', '230%'] }}
        transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut', delay: index * 0.12 }}
      />
      <div className="h-4 w-32 rounded bg-[#f4f4f5]" />
      <div className="mt-5 h-6 w-72 rounded bg-[#f4f4f5]" />
      <div className="mt-3 h-4 w-44 rounded bg-[#f4f4f5]" />
    </motion.div>
  )
}
