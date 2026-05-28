'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { BellRing, Check, Eye, HelpCircle, MessageCircle, MessageSquare, Play, RotateCcw, Square } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { liveSessionChannelName, refreshKrescoRealtimeAuthorization, subscribeKrescoRealtime } from '@/lib/ably'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  updateLiveInteractionsEnvelope,
  useProfessorLiveControlData,
} from '@/lib/liveSessionData'
import { liveInteractionInitials, liveMessages, liveQuestions, mergeLiveInteraction } from '@/lib/liveInteractions'
import {
  endProfessorLiveSession,
  notifyProfessorLiveSession,
  patchProfessorLiveInteraction,
  revealProfessorLiveStreamCredentials,
  startProfessorLiveSession,
  type LiveSessionInteraction,
  type LiveSessionStreamCredentials,
} from '@/lib/professor'

export default function ProfessorLiveControlRoomPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [revealingCredentials, setRevealingCredentials] = useState(false)
  const [streamCredentials, setStreamCredentials] = useState<LiveSessionStreamCredentials | null>(null)
  const [activePanel, setActivePanel] = useState<'question' | 'message'>('question')
  const {
    sessionId: numericSessionId,
    session,
    embed,
    interactions,
    loading,
    error,
    mutateAll,
    mutateSessions,
    mutateInteractions,
  } = useProfessorLiveControlData(sessionId)

  const loadError = useMemo(() => {
    if (!numericSessionId) return 'Live session link is invalid.'
    if (error) return apiDataErrorMessage(error, 'Could not load the live control room.')
    if (!loading && !session && !embed) return 'Live session not found.'
    return ''
  }, [embed, error, loading, numericSessionId, session])

  useEffect(() => {
    if (!session?.has_stream_credentials) setStreamCredentials(null)
  }, [session?.has_stream_credentials])

  useEffect(() => {
    if (error) toast.error(apiDataErrorMessage(error, 'Could not load the live control room.'))
  }, [error])

  useEffect(() => {
    if (!numericSessionId) return

    const handleEvent = (message: { name?: string; data?: unknown }) => {
      if (message.name?.startsWith('live.session.')) {
        void mutateAll()
        return
      }
      if (message.name?.startsWith('live.interaction.') && isLiveInteraction(message.data)) {
        const interaction = message.data
        void mutateInteractions(
          (current) => updateLiveInteractionsEnvelope(current, numericSessionId, (items) => mergeLiveInteraction(items, interaction)),
          { revalidate: false },
        )
      }
    }
    return subscribeKrescoRealtime({
      channelName: liveSessionChannelName(numericSessionId),
      onMessage: handleEvent,
      beforeSubscribe: refreshKrescoRealtimeAuthorization,
      fallback: {
        intervalMs: 5000,
        poll: async () => {
          await mutateAll()
        },
      },
    })
  }, [mutateAll, mutateInteractions, numericSessionId])

  const chatMessages = useMemo(() => liveMessages(interactions), [interactions])
  const questions = useMemo(() => liveQuestions(interactions), [interactions])
  const activeItems = activePanel === 'question' ? questions : chatMessages
  const pendingCount = questions.filter((item) => item.status === 'pending').length
  const messageCount = chatMessages.length
  const isLive = session?.status === 'live'
  const isCompleted = session?.status === 'completed'
  const isCancelled = session?.status === 'cancelled'

  async function runSessionAction(action: () => Promise<unknown>, success: string) {
    if (loadError) return
    setSessionBusy(true)
    try {
      await action()
      toast.success(success)
      await mutateAll()
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Action failed.'))
    } finally {
      setSessionBusy(false)
    }
  }

  async function runInteractionAction(id: number, action: () => Promise<LiveSessionInteraction>, success: string) {
    setBusyId(id)
    try {
      const updated = await action()
      if (numericSessionId) {
        await mutateInteractions(
          (current) => updateLiveInteractionsEnvelope(current, numericSessionId, (items) => mergeLiveInteraction(items, updated)),
          { revalidate: false },
        )
        await mutateSessions()
      }
      toast.success(success)
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Action failed.'))
    } finally {
      setBusyId(null)
    }
  }

  async function revealCredentials() {
    if (!session) return
    setRevealingCredentials(true)
    try {
      setStreamCredentials(await revealProfessorLiveStreamCredentials(session.id))
      toast.success('Stream credentials revealed.')
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not reveal stream credentials.'))
    } finally {
      setRevealingCredentials(false)
    }
  }

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[1440px] py-5 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.14em] text-[#9f9fa9]">Live control room</p>
            <h1 className="m-0 mt-1 truncate text-[32px] font-black leading-tight text-[#3f3f46]">{session?.title ?? embed?.title ?? 'Live session'}</h1>
            {session && <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">{formatDateTime(session.starts_at)} / {session.status}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {session && !isCompleted && !isCancelled && (
              <button className="professor-control-button border-[#453dee] bg-[#453dee] text-white disabled:opacity-50" disabled={sessionBusy || !numericSessionId} type="button" onClick={() => runSessionAction(() => notifyProfessorLiveSession(numericSessionId!), 'Students notified.')}>
                <BellRing size={15} />
                Notify
              </button>
            )}
            {session && !isLive && !isCompleted && !isCancelled && (
              <button className="professor-control-button border-[#f5900b] bg-white text-[#f5900b] disabled:opacity-50" disabled={sessionBusy || !numericSessionId} type="button" onClick={() => runSessionAction(() => startProfessorLiveSession(numericSessionId!), 'Live session started.')}>
                <Play size={15} />
                Start
              </button>
            )}
            {session && isLive && (
              <button className="professor-control-button border-[#e4e4e7] bg-white text-[#52525c] disabled:opacity-50" disabled={sessionBusy || !numericSessionId} type="button" onClick={() => runSessionAction(() => endProfessorLiveSession(numericSessionId!), 'Live session ended.')}>
                <Square size={14} />
                End
              </button>
            )}
            <button className="professor-control-button border-[#e4e4e7] bg-white text-[#52525c]" type="button" onClick={() => void mutateAll()}>
              <RotateCcw size={15} />
              Refresh
            </button>
          </div>
        </header>

        {loadError && (
          <section className="mb-5 rounded-[18px] border-2 border-[#fee2e2] bg-[#fef2f2] p-5">
            <h2 className="m-0 text-[18px] font-black text-[#991b1b]">Live control unavailable</h2>
            <p className="m-0 mt-2 text-[14px] font-bold leading-6 text-[#b91c1c]">{loadError}</p>
            <button className="professor-control-button mt-4 border-[#991b1b] bg-white text-[#991b1b]" type="button" onClick={() => void mutateAll()}>
              <RotateCcw size={15} />
              Retry
            </button>
          </section>
        )}

        <section className="grid h-[calc(100vh-165px)] min-h-[720px] gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="grid min-h-0 grid-rows-[210px_minmax(0,1fr)] gap-5">
            {session?.has_stream_credentials && (
              <div className="grid content-start gap-3 rounded-[18px] border-2 border-[#e4e4e7] bg-white p-5 md:grid-cols-2">
                {streamCredentials ? (
                  <>
                    <div className="min-w-0">
                      <p className="m-0 text-[11px] font-black uppercase tracking-[0.1em] text-[#9f9fa9]">OBS URL</p>
                      <p className="m-0 mt-1 truncate text-[13px] font-bold text-[#3f3f46]">{streamCredentials.stream_ingest_url || 'No OBS URL saved'}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="m-0 text-[11px] font-black uppercase tracking-[0.1em] text-[#9f9fa9]">Stream key</p>
                      <p className="m-0 mt-1 truncate text-[13px] font-bold text-[#3f3f46]">{streamCredentials.stream_key || 'No stream key saved'}</p>
                    </div>
                  </>
                ) : (
                  <div className="min-w-0">
                    <p className="m-0 text-[11px] font-black uppercase tracking-[0.1em] text-[#9f9fa9]">Stream credentials</p>
                    <button className="professor-control-button mt-2 border-[#e4e4e7] bg-white text-[#52525c] disabled:opacity-50" disabled={revealingCredentials} type="button" onClick={() => void revealCredentials()}>
                      <Eye size={14} />
                      {revealingCredentials ? 'Revealing...' : 'Reveal'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {!session?.has_stream_credentials ? <div /> : null}
            <div className="relative min-h-0 overflow-hidden rounded-[18px] border-2 border-[#e4e4e7] bg-[#050505]">
              {loading ? (
                <div className="absolute inset-0 grid place-items-center text-[14px] font-black text-white">Opening player...</div>
              ) : embed?.embed_url ? (
                <iframe
                  src={embed.embed_url}
                  className="absolute inset-0 block h-full w-full overflow-hidden border-0"
                  allow="autoplay; fullscreen; encrypted-media"
                  allowFullScreen
                  sandbox="allow-scripts allow-forms allow-popups allow-presentation"
                  scrolling="no"
                  title="Professor live player"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center px-8 text-center text-white">Player not configured.</div>
              )}
            </div>
          </div>

          <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border-2 border-[#e4e4e7] bg-white">
            <div className="border-b border-[#e4e4e7] p-2">
              <div className="mb-2 flex items-center justify-between px-3 pt-2">
                <div>
                  <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Live room</h2>
                  <p className="m-0 text-[12px] font-bold text-[#9f9fa9]">{pendingCount} pending / {messageCount} chat</p>
                </div>
                <MessageSquare size={18} className="text-[#453dee]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['question', 'Questions', questions.length],
                  ['message', 'Chat', chatMessages.length],
                ] as const).map(([kind, label, count]) => (
                  <button
                    key={kind}
                    className={`h-11 rounded-[12px] text-[13px] font-black transition ${activePanel === kind ? 'border-2 border-[#18181b] bg-[#453dee] text-white shadow-[0_2px_0_#18181b]' : 'border-2 border-transparent text-[#71717b] hover:bg-[#f7f8fb]'}`}
                    type="button"
                    onClick={() => {
                      setActivePanel(kind)
                    }}
                  >
                    {label} {count > 0 ? count : ''}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-3 p-4">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[112px] animate-pulse rounded-[14px] bg-[#f4f4f5]" />)}
              </div>
            ) : activeItems.length === 0 ? (
              <div className="grid min-h-[420px] flex-1 place-items-center px-6 text-center">
                <div>
                  {activePanel === 'question' ? <HelpCircle className="mx-auto text-[#9f9fa9]" size={34} /> : <MessageCircle className="mx-auto text-[#9f9fa9]" size={34} />}
                  <h3 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">{activePanel === 'question' ? 'No questions yet' : 'No chat yet'}</h3>
                  <p className="m-0 mt-2 text-[14px] font-bold leading-6 text-[#71717b]">
                    {activePanel === 'question' ? 'Student questions will queue here for moderation.' : 'Student chat messages will appear here in order.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeItems.map((interaction) => (
                  <article key={interaction.id} className="border-b border-[#f0f0f2] px-4 py-5">
                    <div className="flex items-start gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f4f4ff] text-[11px] font-black text-[#453dee]">
                        {liveInteractionInitials(interaction.student_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="m-0 truncate text-[13px] font-black text-[#3f3f46]">{interaction.student_name || 'Student'}</p>
                            <p className="m-0 mt-1 text-[11px] font-bold text-[#9f9fa9]">{formatShortTime(interaction.created_at)}</p>
                          </div>
                          {activePanel === 'question' && (
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${interaction.status === 'answered' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fef3c7] text-[#a16207]'}`}>{interaction.status}</span>
                          )}
                        </div>
                        <p className="m-0 whitespace-pre-wrap break-words text-[14px] font-bold leading-6 text-[#52525c]">{interaction.body}</p>
                        {activePanel === 'question' && interaction.status !== 'answered' && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="professor-control-button border-[#453dee] bg-[#453dee] text-white"
                              disabled={busyId === interaction.id}
                              type="button"
                              onClick={() => runInteractionAction(interaction.id, () => patchProfessorLiveInteraction(interaction.id, { status: 'answered' }), 'Question marked answered.')}
                            >
                              <Check size={14} />
                              Set as answered
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </section>
      </main>

    </ProfessorShell>
  )
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatShortTime(value: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function isLiveInteraction(value: unknown): value is LiveSessionInteraction {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'kind' in value && 'body' in value)
}
