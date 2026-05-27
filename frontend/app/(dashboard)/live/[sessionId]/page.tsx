'use client'

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, HelpCircle, ListChecks, MessageCircle, Radio, RotateCcw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { liveSessionChannelName, refreshKrescoRealtimeAuthorization, subscribeKrescoRealtime, userNotificationsChannelName } from '@/lib/ably'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  updateLiveInteractionsEnvelope,
  useStudentLiveRoomData,
} from '@/lib/liveSessionData'
import { liveInteractionInitials, liveMessages, liveQuestions, mergeLiveInteraction } from '@/lib/liveInteractions'
import {
  createStudentLiveInteraction,
  type LiveSessionInteraction,
} from '@/lib/professor'
import { useAuthStore } from '@/lib/store'

export default function LiveSessionRoomPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [interactionBody, setInteractionBody] = useState('')
  const [activePanel, setActivePanel] = useState<'message' | 'question'>('message')
  const [sendingInteraction, setSendingInteraction] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const {
    sessionId: numericSessionId,
    session,
    embed,
    interactions,
    loading,
    embedLoading,
    error,
    embedError,
    interactionsError,
    mutateAll,
    mutateSessions,
    mutateInteractions,
  } = useStudentLiveRoomData(sessionId)

  const pageError = useMemo(() => {
    if (!numericSessionId) return 'Live session link is invalid.'
    if (error) return apiDataErrorMessage(error, 'Could not load this live session.')
    if (!loading && !session) return 'Live session not found for your account.'
    return ''
  }, [error, loading, numericSessionId, session])

  const questionError = interactionsError
    ? apiDataErrorMessage(interactionsError, 'Could not load live chat and Q&A.')
    : ''

  useEffect(() => {
    if (session?.title) document.title = `${session.title} - Kresco Live`
  }, [session?.title])

  useEffect(() => {
    if (embedError) toast.error(apiDataErrorMessage(embedError, 'Could not open the VdoCipher live player.'))
  }, [embedError])

  useEffect(() => {
    if (!user?.id) return
    const refresh = () => void mutateSessions()
    return subscribeKrescoRealtime({
      channelName: userNotificationsChannelName(user.id),
      onMessage: refresh,
      fallback: {
        intervalMs: 5000,
        poll: async () => {
          await mutateSessions()
        },
      },
    })
  }, [mutateSessions, user?.id])

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
          await mutateInteractions()
        },
      },
    })
  }, [mutateAll, mutateInteractions, numericSessionId])

  useEffect(() => {
    if (activePanel === 'message') {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [activePanel, interactions])

  async function submitInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = interactionBody.trim()
    if (pageError) return
    if (!canInteract) {
      toast.error(`This live session is not accepting new ${activePanel === 'question' ? 'questions' : 'messages'}.`)
      return
    }
    if (!body) {
      toast.error(activePanel === 'question' ? 'Write your question first.' : 'Write your message first.')
      return
    }
    setSendingInteraction(true)
    try {
      const created = await createStudentLiveInteraction(numericSessionId!, body, activePanel)
      await mutateInteractions(
        (current) => updateLiveInteractionsEnvelope(current, numericSessionId!, (items) => mergeLiveInteraction(items, created)),
        { revalidate: false },
      )
      setInteractionBody('')
    } catch (error) {
      toast.error(apiDataErrorMessage(error, activePanel === 'question' ? 'Could not send your question.' : 'Could not send your message.'))
    } finally {
      setSendingInteraction(false)
    }
  }

  const title = session?.title ?? 'Live session'
  const canInteract = Boolean(session?.can_join && !pageError)
  const chatMessages = useMemo(() => liveMessages(interactions), [interactions])
  const questions = useMemo(() => liveQuestions(interactions), [interactions])
  const activeItems = activePanel === 'message' ? chatMessages : questions
  const composerLabel = activePanel === 'question' ? 'Ask the professor' : 'Message the class'

  return (
    <main className="min-h-screen bg-white px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border-2 border-[#e4e4e7] bg-white px-3 text-[13px] font-black text-[#52525c] transition hover:bg-[#f7f7f9]"
                type="button"
                onClick={() => router.back()}
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <Link className="inline-flex h-10 items-center gap-2 rounded-[12px] border-2 border-[#e4e4e7] bg-white px-3 text-[13px] font-black text-[#52525c] no-underline transition hover:bg-[#f7f7f9]" href="/live">
                <ListChecks size={16} />
                Live schedule
              </Link>
            </div>
            <p className="m-0 text-[14px] font-black uppercase tracking-[0.12em] text-[#9f9fa9]">
              {session ? `${session.subject_title || session.offering_title} / ${session.filiere}` : 'Kresco Live'}
            </p>
            <h1 className="m-0 mt-1 text-[28px] font-black leading-tight tracking-normal text-[#3f3f46] sm:text-[36px]">{title}</h1>
            {session && (
              <p className="m-0 mt-2 text-[15px] font-bold leading-6 text-[#71717b]">
                {formatDateTime(session.starts_at)} / {session.teacher_name || session.offering_title}
              </p>
            )}
          </div>
        </header>

        <section className="grid h-[calc(100vh-205px)] min-h-[620px] gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <article className="min-h-0 min-w-0 overflow-hidden">
            <div className="relative h-full min-h-[420px] overflow-hidden rounded-[17.617px] border-[2.239px] border-[#e4e4e7] bg-[#111113] shadow-none transition-shadow duration-300 hover:shadow-[0_18px_40px_rgba(24,24,27,0.08)]">
              {loading || embedLoading ? (
                <div className="absolute inset-0 grid place-items-center text-[14px] font-black text-white">
                  Opening live player...
                </div>
              ) : embed ? (
                <iframe
                  src={embed.embed_url}
                  className="absolute inset-0 block h-full w-full overflow-hidden border-0"
                  allow="autoplay; fullscreen; encrypted-media"
                  allowFullScreen
                  sandbox="allow-scripts allow-forms allow-popups allow-presentation"
                  scrolling="no"
                  style={{ overflow: 'hidden' }}
                  title={`${title} live player`}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center px-8 text-center">
                  <div>
                    <Radio className="mx-auto text-white" size={42} />
                    <h2 className="mt-4 text-[24px] font-black text-white">Player unavailable</h2>
                    <p className="mt-2 max-w-[520px] text-[14px] font-bold leading-6 text-[#d4d4d8]">
                      This live session is not joinable yet, or the stream credentials are not ready.
                    </p>
                    <button
                      className="mt-5 inline-flex h-10 items-center gap-2 rounded-[12px] bg-white px-4 text-[13px] font-black text-[#3f3f46]"
                      type="button"
                      onClick={() => void mutateAll()}
                    >
                      <RotateCcw size={15} />
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>

          <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border-2 border-[#e4e4e7] bg-white">
            <div className="grid grid-cols-2 border-b border-[#e4e4e7] p-2">
              {([
                ['message', 'Chat', chatMessages.length],
                ['question', 'Q&A', questions.length],
              ] as const).map(([kind, label, count]) => (
                <button
                  key={kind}
                  className={`h-11 rounded-[12px] text-[13px] font-black transition ${activePanel === kind ? 'border-2 border-[#18181b] bg-[#453dee] text-white shadow-[0_2px_0_#18181b]' : 'border-2 border-transparent text-[#71717b] hover:bg-[#f7f8fb]'}`}
                  type="button"
                  onClick={() => setActivePanel(kind)}
                >
                  {label} {count > 0 ? count : ''}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {activeItems.length === 0 ? (
                <div className="grid min-h-[310px] place-items-center px-4 text-center">
                  <div>
                    {activePanel === 'question' ? <HelpCircle className="mx-auto text-[#9f9fa9]" size={34} /> : <MessageCircle className="mx-auto text-[#9f9fa9]" size={34} />}
                    <h2 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">
                      {activePanel === 'question' ? 'No questions yet' : 'No chat messages yet'}
                    </h2>
                    <p className="m-0 mt-2 text-[14px] font-bold leading-6 text-[#71717b]">
                      {activePanel === 'question'
                        ? 'Ask the professor and answered questions will be marked here.'
                        : 'Class chat messages will appear here during the livestream.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={activePanel === 'message' ? 'flex min-h-full flex-col justify-end gap-3' : 'grid gap-3'}>
                  {activeItems.map((item) => activePanel === 'message' ? (
                    <article key={item.id} className="flex items-start gap-3">
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f4f4ff] text-[11px] font-black text-[#453dee]">
                        {liveInteractionInitials(item.student_name)}
                      </div>
                      <div className="min-w-0 flex-1 rounded-[14px] bg-[#f7f8fb] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="m-0 truncate text-[12px] font-black text-[#3f3f46]">{item.student_name || 'Student'}</p>
                          <p className="m-0 shrink-0 text-[11px] font-bold text-[#9f9fa9]">{formatShortTime(item.created_at)}</p>
                        </div>
                        <p className="m-0 mt-1 whitespace-pre-wrap break-words text-[14px] font-bold leading-5 text-[#52525c]">{item.body}</p>
                      </div>
                    </article>
                  ) : (
                    <article key={item.id} className="rounded-[14px] border border-[#e4e4e7] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="m-0 truncate text-[13px] font-black text-[#3f3f46]">{item.student_name || 'Student'}</p>
                        <p className={`m-0 shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${item.status === 'answered' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fef3c7] text-[#a16207]'}`}>{item.status}</p>
                      </div>
                      <p className="m-0 mt-2 whitespace-pre-wrap break-words text-[14px] font-bold leading-6 text-[#52525c]">{item.body}</p>
                    </article>
                  ))}
                  {activePanel === 'message' && <div ref={messagesEndRef} />}
                </div>
              )}
            </div>

            <form className="grid gap-3 border-t border-[#e4e4e7] bg-white p-4" onSubmit={submitInteraction}>
              {!canInteract && (
                <p className="m-0 rounded-[12px] bg-[#f7f8fb] p-3 text-[13px] font-bold leading-5 text-[#71717b]">
                  This session is not accepting new {activePanel === 'question' ? 'questions' : 'messages'}.
                </p>
              )}
              <textarea
                aria-label={composerLabel}
                className="min-h-[82px] resize-none rounded-[14px] border-2 border-[#e4e4e7] px-3 py-3 text-[14px] font-bold text-[#3f3f46] outline-none focus:border-[#453dee]"
                value={interactionBody}
                disabled={!canInteract}
                onChange={(event) => setInteractionBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder={canInteract ? composerLabel : 'Live room is closed'}
              />
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#453dee] px-4 text-[13px] font-black text-white disabled:opacity-50" disabled={sendingInteraction || !canInteract} type="submit">
                <Send size={15} />
                {sendingInteraction ? 'Sending...' : activePanel === 'question' ? 'Send question' : 'Send message'}
              </button>
              {questionError && <p className="m-0 rounded-[12px] bg-[#fef2f2] p-3 text-[13px] font-bold text-[#b91c1c]">{questionError}</p>}
            </form>
          </aside>
        </section>

        {pageError && (
          <section className="rounded-[18px] border-2 border-[#fee2e2] bg-[#fef2f2] p-5">
            <h2 className="m-0 text-[20px] font-black text-[#991b1b]">Live session unavailable</h2>
            <p className="m-0 mt-2 text-[14px] font-bold leading-6 text-[#b91c1c]">{pageError}</p>
            <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-[12px] border-2 border-[#991b1b] bg-white px-4 text-[13px] font-black text-[#991b1b]" type="button" onClick={() => void mutateAll()}>
              <RotateCcw size={15} />
              Retry
            </button>
          </section>
        )}

      </div>
    </main>
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
