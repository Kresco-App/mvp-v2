'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BellRing, Check, Copy, Eye, HelpCircle, MessageCircle, MessageSquare, Play, RotateCcw, Search, Square, X } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  refreshProfessorLiveInteractionsEnvelope,
  updateLiveInteractionsEnvelope,
  useLiveSessionRealtimeSubscription,
  useProfessorLiveControlData,
} from '@/lib/liveSessionData'
import {
  formatLiveDateTime as formatDateTime,
  formatLiveShortTime as formatShortTime,
  liveInteractionInitials,
  liveMessages,
  liveQuestions,
  mergeLiveInteraction,
} from '@/lib/liveInteractions'
import {
  endProfessorLiveSession,
  notifyProfessorLiveSession,
  patchProfessorLiveInteraction,
  revealProfessorLiveStreamCredentials,
  startProfessorLiveSession,
  type LiveSessionInteraction,
  type LiveSessionStreamCredentials,
} from '@/lib/professor'

type QuestionQueueFilter = 'all' | 'pending' | 'answered'
type LiveControlPanel = 'question' | 'message'

const QUESTION_QUEUE_FILTERS: Array<{ value: QuestionQueueFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'answered', label: 'Answered' },
]
const QUESTION_QUEUE_FILTER_VALUES = new Set<QuestionQueueFilter>(QUESTION_QUEUE_FILTERS.map((filter) => filter.value))
const LIVE_CONTROL_PANEL_VALUES = new Set<LiveControlPanel>(['question', 'message'])

export default function ProfessorLiveControlRoomPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routePanel = useMemo(() => normalizeLiveControlPanel(new URLSearchParams(searchKey).get('panel')), [searchKey])
  const routeQuestionFilter = useMemo(() => normalizeQuestionQueueFilter(new URLSearchParams(searchKey).get('filter')), [searchKey])
  const routeRoomSearch = useMemo(() => new URLSearchParams(searchKey).get('q')?.trim() ?? '', [searchKey])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [revealingCredentials, setRevealingCredentials] = useState(false)
  const [streamCredentials, setStreamCredentials] = useState<LiveSessionStreamCredentials | null>(null)
  const [activePanel, setActivePanel] = useState<LiveControlPanel>(routePanel)
  const [questionFilter, setQuestionFilter] = useState<QuestionQueueFilter>(routeQuestionFilter)
  const [roomSearch, setRoomSearch] = useState(routeRoomSearch)
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({})
  const {
    sessionId: numericSessionId,
    session,
    embed,
    interactions,
    loading,
    error,
    mutateAll,
    mutateSessions,
    mutateEmbed,
    mutateInteractions,
  } = useProfessorLiveControlData(sessionId)

  const loadError = useMemo(() => {
    if (!numericSessionId) return 'Live session link is invalid.'
    if (error) return apiDataErrorMessage(error, 'Could not load the live control room.')
    if (!loading && !session && !embed) return 'Live session not found.'
    return ''
  }, [embed, error, loading, numericSessionId, session])

  useEffect(() => {
    if (error) toast.error(apiDataErrorMessage(error, 'Could not load the live control room.'))
  }, [error])

  useEffect(() => {
    setActivePanel((current) => (current === routePanel ? current : routePanel))
    setQuestionFilter((current) => (current === routeQuestionFilter ? current : routeQuestionFilter))
    setRoomSearch((current) => (current === routeRoomSearch ? current : routeRoomSearch))
  }, [numericSessionId, routePanel, routeQuestionFilter, routeRoomSearch])

  const realtimeFallbackPoll = useCallback(async () => {
    if (!numericSessionId) return
    await Promise.allSettled([
      mutateSessions(),
      mutateEmbed(),
      mutateInteractions(
        (current) => refreshProfessorLiveInteractionsEnvelope(current, numericSessionId),
        { revalidate: false },
      ),
    ])
  }, [mutateEmbed, mutateInteractions, mutateSessions, numericSessionId])

  useLiveSessionRealtimeSubscription({
    sessionId: numericSessionId,
    mutateAll,
    mutateInteractions,
    refreshInteractions: refreshProfessorLiveInteractionsEnvelope,
    fallbackPoll: realtimeFallbackPoll,
  })

  const chatMessages = useMemo(() => liveMessages(interactions), [interactions])
  const questions = useMemo(() => liveQuestions(interactions), [interactions])
  const filteredQuestions = useMemo(() => (
    questionFilter === 'all' ? questions : questions.filter((item) => item.status === questionFilter)
  ), [questionFilter, questions])
  const normalizedRoomSearch = roomSearch.trim().toLowerCase()
  const visibleQuestions = useMemo(() => (
    normalizedRoomSearch
      ? filteredQuestions.filter((item) => liveRoomInteractionMatchesSearch(item, normalizedRoomSearch))
      : filteredQuestions
  ), [filteredQuestions, normalizedRoomSearch])
  const visibleChatMessages = useMemo(() => (
    normalizedRoomSearch
      ? chatMessages.filter((item) => liveRoomInteractionMatchesSearch(item, normalizedRoomSearch))
      : chatMessages
  ), [chatMessages, normalizedRoomSearch])
  const hasRoomSearch = normalizedRoomSearch.length > 0
  const activeItems = activePanel === 'question' ? visibleQuestions : visibleChatMessages
  const activePanelSourceCount = activePanel === 'question' ? filteredQuestions.length : chatMessages.length
  const pendingCount = questions.filter((item) => item.status === 'pending').length
  const answeredCount = questions.filter((item) => item.status === 'answered').length
  const messageCount = chatMessages.length
  const isLive = session?.status === 'live'
  const isCompleted = session?.status === 'completed'
  const isCancelled = session?.status === 'cancelled'
  const hasStreamCredentials = Boolean(session?.has_stream_credentials)
  const playerReady = Boolean(embed?.embed_url)

  useEffect(() => {
    if (!hasStreamCredentials) setStreamCredentials(null)
  }, [hasStreamCredentials])

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
      return true
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Action failed.'))
      return false
    } finally {
      setBusyId(null)
    }
  }

  function answerDraftFor(interaction: LiveSessionInteraction) {
    return answerDrafts[interaction.id] ?? interaction.answer ?? ''
  }

  function updateAnswerDraft(interactionId: number, value: string) {
    setAnswerDrafts((current) => ({ ...current, [interactionId]: value }))
  }

  async function saveQuestionAnswer(interaction: LiveSessionInteraction) {
    const answer = answerDraftFor(interaction).trim()
    if (!answer) {
      toast.error('Write an answer before saving.')
      return
    }

    const saved = await runInteractionAction(
      interaction.id,
      () => patchProfessorLiveInteraction(interaction.id, { answer, status: 'answered' }),
      'Answer saved.',
    )
    if (!saved) return

    setAnswerDrafts((current) => {
      const next = { ...current }
      delete next[interaction.id]
      return next
    })
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

  async function copyControlCredential(label: string, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      toast.error(`No ${label.toLowerCase()} saved.`)
      return
    }
    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard is not available.')
      return
    }
    try {
      await navigator.clipboard.writeText(trimmed)
      toast.success(`${label} copied.`)
    } catch {
      toast.error(`Could not copy ${label}.`)
    }
  }

  function replaceControlRoomUrlState(nextPanel: LiveControlPanel, nextFilter: QuestionQueueFilter, nextSearch: string) {
    const params = new URLSearchParams(searchKey)
    const normalizedPanel = normalizeLiveControlPanel(nextPanel)
    const normalizedFilter = normalizeQuestionQueueFilter(nextFilter)
    const normalizedSearch = nextSearch.trim()
    if (normalizedPanel === 'question') params.delete('panel')
    else params.set('panel', normalizedPanel)
    if (normalizedFilter === 'pending') params.delete('filter')
    else params.set('filter', normalizedFilter)
    if (normalizedSearch) params.set('q', normalizedSearch)
    else params.delete('q')
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  function selectControlPanel(nextPanel: LiveControlPanel) {
    setActivePanel(nextPanel)
    replaceControlRoomUrlState(nextPanel, questionFilter, roomSearch)
  }

  function selectQuestionFilter(nextFilter: QuestionQueueFilter) {
    const normalizedFilter = normalizeQuestionQueueFilter(nextFilter)
    setQuestionFilter(normalizedFilter)
    replaceControlRoomUrlState(activePanel, normalizedFilter, roomSearch)
  }

  function updateRoomSearch(value: string) {
    setRoomSearch(value)
    replaceControlRoomUrlState(activePanel, questionFilter, value)
  }

  function clearRoomSearch() {
    updateRoomSearch('')
  }

  function reviewQuestionQueue() {
    const nextFilter = pendingCount > 0 ? 'pending' : 'all'
    setActivePanel('question')
    setQuestionFilter(nextFilter)
    replaceControlRoomUrlState('question', nextFilter, roomSearch)
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

        {!loadError && (
          <section className="mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-[#e4e4e7] bg-white px-3 py-2" aria-label="Live control summary">
            <LiveControlStatusPill label="Broadcast" value={session?.status ?? 'Loading'} tone={isLive ? 'attention' : 'neutral'} />
            <LiveControlStatusPill label="Player" value={playerReady ? 'Ready' : 'Missing'} tone={playerReady ? 'success' : 'attention'} />
            <LiveControlStatusPill label="Stream" value={hasStreamCredentials ? 'Credentials' : 'Manual'} tone={hasStreamCredentials ? 'success' : 'neutral'} />
            <LiveControlStatusPill label="Questions" value={`${pendingCount} pending`} tone={pendingCount > 0 ? 'attention' : 'success'} />
            <span className="ml-auto text-[12px] font-bold text-[#71717b]">{answeredCount} answered / {messageCount} chat</span>
            <button type="button" onClick={reviewQuestionQueue} className="h-8 rounded-[10px] border border-[#453dee] bg-[#453dee] px-3 text-[11px] font-black text-white">
              Review questions
            </button>
            <button type="button" onClick={() => selectControlPanel('message')} className="h-8 rounded-[10px] border border-[#e4e4e7] bg-white px-3 text-[11px] font-black text-[#52525c] transition hover:border-[#453dee] hover:text-[#453dee]">
              Open chat
            </button>
          </section>
        )}

        <section className="grid gap-5 xl:h-[calc(100vh-145px)] xl:min-h-[720px] xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className={`grid min-h-0 gap-5 ${hasStreamCredentials ? 'xl:grid-rows-[210px_minmax(0,1fr)]' : 'xl:grid-rows-[minmax(0,1fr)]'}`}>
            {hasStreamCredentials && (
              <div className="grid content-start gap-3 rounded-[18px] border-2 border-[#e4e4e7] bg-white p-5 md:grid-cols-2">
                {streamCredentials ? (
                  <>
                    <LiveControlCredentialRow label="OBS URL" value={streamCredentials.stream_ingest_url} onCopy={copyControlCredential} />
                    <LiveControlCredentialRow label="Stream key" value={streamCredentials.stream_key} onCopy={copyControlCredential} />
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
            <div className="relative min-h-[260px] overflow-hidden rounded-[18px] border-2 border-[#e4e4e7] bg-[#050505] sm:min-h-[360px] xl:min-h-0">
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

          <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-[18px] border-2 border-[#e4e4e7] bg-white xl:h-full xl:min-h-0">
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
                    onClick={() => selectControlPanel(kind)}
                  >
                    {label} {count > 0 ? count : ''}
                  </button>
                ))}
              </div>
              {activePanel === 'question' && (
                <div className="mt-2 grid grid-cols-3 gap-1.5" aria-label="Question queue filters">
                  {QUESTION_QUEUE_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => selectQuestionFilter(filter.value)}
                      aria-pressed={questionFilter === filter.value}
                      className={`h-8 rounded-[10px] text-[11px] font-black transition ${questionFilter === filter.value ? 'bg-[#18181b] text-white' : 'border border-[#e4e4e7] bg-white text-[#71717b] hover:border-[#453dee] hover:text-[#453dee]'}`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              )}
              <section className="mt-2 rounded-[12px] border border-[#e4e4e7] bg-[#fbfbfc] p-2" aria-label="Search live room interactions">
                <label className="flex min-h-9 items-center gap-2 rounded-[10px] border border-[#e4e4e7] bg-white px-2.5 text-[#71717b] focus-within:border-[#453dee] focus-within:ring-2 focus-within:ring-[#453dee]/10">
                  <Search size={13} className="shrink-0 text-[#9f9fa9]" />
                  <input
                    aria-label="Search live room"
                    value={roomSearch}
                    onChange={(event) => updateRoomSearch(event.target.value)}
                    className="h-8 min-w-0 flex-1 border-0 bg-transparent text-[12px] font-bold text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
                    placeholder="Search student, message, answer"
                  />
                  {hasRoomSearch && (
                    <button
                      type="button"
                      aria-label="Clear live room search"
                      onClick={clearRoomSearch}
                      className="grid size-6 shrink-0 place-items-center rounded-full text-[#9f9fa9] transition hover:bg-[#f4f4f5] hover:text-[#52525c]"
                    >
                      <X size={13} />
                    </button>
                  )}
                </label>
                <p className="m-0 mt-1.5 px-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
                  {activeItems.length} of {activePanelSourceCount} visible
                </p>
              </section>
            </div>

            {loading ? (
              <div className="grid gap-3 p-4">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[112px] animate-pulse rounded-[14px] bg-[#f4f4f5]" />)}
              </div>
            ) : activeItems.length === 0 ? (
              <div className="grid min-h-[420px] flex-1 place-items-center px-6 text-center">
                <div>
                  {hasRoomSearch ? <Search className="mx-auto text-[#9f9fa9]" size={34} /> : activePanel === 'question' ? <HelpCircle className="mx-auto text-[#9f9fa9]" size={34} /> : <MessageCircle className="mx-auto text-[#9f9fa9]" size={34} />}
                  <h3 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">
                    {hasRoomSearch ? 'No matching live room items' : activePanel === 'question' ? emptyQuestionTitle(questionFilter) : 'No chat yet'}
                  </h3>
                  <p className="m-0 mt-2 text-[14px] font-bold leading-6 text-[#71717b]">
                    {hasRoomSearch ? 'Clear the search to return to the live room feed.' : activePanel === 'question' ? emptyQuestionDetail(questionFilter) : 'Student chat messages will appear here in order.'}
                  </p>
                  {hasRoomSearch ? (
                    <button
                      type="button"
                      onClick={clearRoomSearch}
                      className="mt-4 h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[12px] font-black text-[#453dee] transition hover:border-[#453dee]"
                    >
                      Clear live room search
                    </button>
                  ) : activePanel === 'question' && questionFilter !== 'all' && questions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => selectQuestionFilter('all')}
                      className="mt-4 h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[12px] font-black text-[#453dee] transition hover:border-[#453dee]"
                    >
                      Show all questions
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeItems.map((interaction) => {
                  const savedAnswer = interaction.answer.trim()
                  const draftAnswer = answerDraftFor(interaction)
                  return (
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
                          {activePanel === 'question' && savedAnswer && (
                            <div className="mt-3 rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2" aria-label={`Saved answer ${interaction.id}`}>
                              <p className="m-0 text-[10px] font-black uppercase tracking-[0.1em] text-[#047857]">Saved answer</p>
                              <p className="m-0 mt-1 whitespace-pre-wrap break-words text-[13px] font-bold leading-5 text-[#166534]">{savedAnswer}</p>
                            </div>
                          )}
                          {activePanel === 'question' && interaction.status !== 'answered' && (
                            <div className="mt-3 rounded-[12px] border border-[#e4e4e7] bg-[#fbfbfc] p-3" aria-label={`Answer question ${interaction.id}`}>
                              <label htmlFor={`live-answer-${interaction.id}`} className="text-[11px] font-black uppercase tracking-[0.08em] text-[#71717b]">
                                Answer this question
                              </label>
                              <textarea
                                id={`live-answer-${interaction.id}`}
                                value={draftAnswer}
                                onChange={(event) => updateAnswerDraft(interaction.id, event.target.value)}
                                className="mt-2 min-h-20 w-full resize-none rounded-[10px] border border-[#e4e4e7] bg-white px-3 py-2 text-[13px] font-bold leading-5 text-[#3f3f46] outline-none transition focus:border-[#453dee] focus:ring-2 focus:ring-[#453dee]/10"
                                placeholder="Type the answer you will give on stream..."
                              />
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  className="professor-control-button border-[#453dee] bg-[#453dee] text-white disabled:opacity-50"
                                  disabled={busyId === interaction.id || !draftAnswer.trim()}
                                  type="button"
                                  onClick={() => void saveQuestionAnswer(interaction)}
                                >
                                  <MessageSquare size={14} />
                                  Save answer
                                </button>
                                <button
                                  className="professor-control-button border-[#e4e4e7] bg-white text-[#52525c]"
                                  disabled={busyId === interaction.id}
                                  type="button"
                                  onClick={() => runInteractionAction(interaction.id, () => patchProfessorLiveInteraction(interaction.id, { status: 'answered' }), 'Question marked answered.')}
                                >
                                  <Check size={14} />
                                  Set as answered
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </aside>
        </section>
      </main>

    </ProfessorShell>
  )
}

function LiveControlCredentialRow({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: (label: string, value: string) => Promise<void>
}) {
  const hasValue = value.trim().length > 0
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_34px] items-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-[#fbfbfc] px-3 py-2" aria-label={`Control room ${label}`}>
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-[0.1em] text-[#9f9fa9]">{label}</span>
        <span className="mt-1 block truncate text-[13px] font-bold text-[#3f3f46]">{hasValue ? value : `No ${label.toLowerCase()} saved`}</span>
      </span>
      <button
        type="button"
        disabled={!hasValue}
        onClick={() => void onCopy(label, value)}
        aria-label={`Copy control room ${label}`}
        className="grid size-8 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#71717b] transition hover:border-[#453dee] hover:text-[#453dee] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Copy size={13} />
      </button>
    </div>
  )
}

function LiveControlStatusPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'attention' | 'success'
}) {
  const toneClass = tone === 'attention'
    ? 'bg-[#fff7ed] text-[#9a3412]'
    : tone === 'success'
      ? 'bg-[#f0fdf4] text-[#166534]'
      : 'bg-[#f4f4f5] text-[#52525c]'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${toneClass}`}>
      <span className="uppercase tracking-[0.08em] opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  )
}

function normalizeLiveControlPanel(value: string | null | undefined): LiveControlPanel {
  return value && LIVE_CONTROL_PANEL_VALUES.has(value as LiveControlPanel) ? value as LiveControlPanel : 'question'
}

function normalizeQuestionQueueFilter(value: string | null | undefined): QuestionQueueFilter {
  return value && QUESTION_QUEUE_FILTER_VALUES.has(value as QuestionQueueFilter) ? value as QuestionQueueFilter : 'pending'
}

function liveRoomInteractionMatchesSearch(interaction: LiveSessionInteraction, query: string) {
  const searchable = [
    interaction.student_name,
    interaction.kind,
    interaction.body,
    interaction.status,
    interaction.answer,
    interaction.created_at,
    formatShortTime(interaction.created_at),
  ].join(' ').toLowerCase()

  return searchable.includes(query)
}

function emptyQuestionTitle(filter: QuestionQueueFilter) {
  if (filter === 'pending') return 'No pending questions'
  if (filter === 'answered') return 'No answered questions'
  return 'No questions yet'
}

function emptyQuestionDetail(filter: QuestionQueueFilter) {
  if (filter === 'pending') return 'Answered questions stay available in the queue filter.'
  if (filter === 'answered') return 'Mark questions answered during class and they will collect here.'
  return 'Student questions will queue here for moderation.'
}
