'use client'

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BellRing, CalendarPlus, CheckCircle2, Copy, Eye, ExternalLink, MonitorCog, MoreHorizontal, Pencil, Play, Radio, RotateCcw, Save, Search, Square, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { apiDataErrorMessage } from '@/lib/apiData'
import { formatLiveDateTime as formatDateTime } from '@/lib/liveInteractions'
import { useProfessorLiveScheduleData } from '@/lib/liveSessionData'
import {
  cancelProfessorLiveSession,
  createProfessorLiveSession,
  deleteProfessorLiveSession,
  endProfessorLiveSession,
  notifyProfessorLiveSession,
  revealProfessorLiveStreamCredentials,
  startProfessorLiveSession,
  updateProfessorLiveSession,
  type LiveSessionStreamCredentials,
  type LiveSessionInput,
  type ProfessorLiveSession,
} from '@/lib/professor'

type LiveForm = {
  id?: number
  course_offering_id: string
  title: string
  description: string
  starts_at: string
  ends_at: string
  vdocipher_live_id: string
  stream_ingest_url: string
  stream_key: string
  auto_create_vdocipher: boolean
}

type LiveStatusFilter = 'all' | 'live' | 'scheduled' | 'completed' | 'cancelled'

const LIVE_STATUS_FILTERS: Array<{ value: LiveStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]
const LIVE_STATUS_FILTER_VALUES = new Set<LiveStatusFilter>(LIVE_STATUS_FILTERS.map((filter) => filter.value))

const EMPTY_LIVE_FORM: LiveForm = {
  course_offering_id: '',
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  vdocipher_live_id: '',
  stream_ingest_url: '',
  stream_key: '',
  auto_create_vdocipher: false,
}

export default function ProfessorLivePage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeStatus = useMemo(() => normalizeLiveStatus(new URLSearchParams(searchKey).get('status')), [searchKey])
  const routeSearch = useMemo(() => new URLSearchParams(searchKey).get('q')?.trim() ?? '', [searchKey])
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [revealingId, setRevealingId] = useState<number | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [revealedCredentials, setRevealedCredentials] = useState<Record<number, LiveSessionStreamCredentials>>({})
  const [showAdvancedForm, setShowAdvancedForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<LiveStatusFilter>(routeStatus)
  const [liveSearch, setLiveSearch] = useState(routeSearch)
  const [form, setForm] = useState<LiveForm>(EMPTY_LIVE_FORM)
  const formRef = useRef<HTMLFormElement | null>(null)
  const loadErrorRef = useRef<unknown>(null)
  const {
    sessions,
    offerings,
    providerConfig,
    loading,
    error,
    mutateAll,
  } = useProfessorLiveScheduleData()

  useEffect(() => {
    setStatusFilter((current) => (current === routeStatus ? current : routeStatus))
    setLiveSearch((current) => (current === routeSearch ? current : routeSearch))
  }, [routeSearch, routeStatus])

  useEffect(() => {
    setForm((current) => (
      current.starts_at || current.ends_at || current.title || current.description
        ? current
        : defaultLiveForm()
    ))
  }, [])

  useEffect(() => {
    if (offerings.length === 0) return
    setForm((current) => ({
      ...current,
      course_offering_id: current.course_offering_id || String(offerings[0]?.id ?? ''),
    }))
  }, [offerings])

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

  function replaceLiveUrlState(nextStatus: LiveStatusFilter, nextSearch: string) {
    const params = new URLSearchParams(searchKey)
    const normalizedStatus = normalizeLiveStatus(nextStatus)
    const normalizedSearch = nextSearch.trim()
    if (normalizedStatus === 'all') params.delete('status')
    else params.set('status', normalizedStatus)
    if (normalizedSearch) params.set('q', normalizedSearch)
    else params.delete('q')
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  function selectLiveStatus(nextStatus: LiveStatusFilter) {
    const normalizedStatus = normalizeLiveStatus(nextStatus)
    setStatusFilter(normalizedStatus)
    replaceLiveUrlState(normalizedStatus, liveSearch)
  }

  function updateLiveSearch(value: string) {
    setLiveSearch(value)
    replaceLiveUrlState(statusFilter, value)
  }

  function clearLiveSearch() {
    updateLiveSearch('')
  }

  async function submitLiveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.course_offering_id) {
      toast.error('Select an offering first.')
      return
    }
    if (!form.auto_create_vdocipher && !form.vdocipher_live_id.trim()) {
      toast.error('Paste a VdoCipher live ID or enable Generate stream.')
      return
    }
    if (form.auto_create_vdocipher && providerConfig && !providerConfig.can_auto_create) {
      toast.error(`Stream generation is not configured: ${providerConfig.missing.join(', ')}`)
      return
    }

    const startsAt = new Date(form.starts_at)
    const endsAt = new Date(form.ends_at)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      toast.error('Choose valid start and end times.')
      return
    }
    if (endsAt <= startsAt) {
      toast.error('End time must be after the start time.')
      return
    }

    const payload: LiveSessionInput = {
      course_offering_id: Number(form.course_offering_id),
      title: form.title.trim(),
      description: form.description.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      join_url: '',
      vdocipher_live_id: form.vdocipher_live_id.trim(),
      stream_ingest_url: form.stream_ingest_url.trim(),
      stream_key: form.stream_key.trim(),
      auto_create_vdocipher: form.auto_create_vdocipher,
      chat_mode: 'off',
    }
    if (form.id && !form.stream_ingest_url.trim()) {
      delete payload.stream_ingest_url
    }
    if (form.id && !form.stream_key.trim()) {
      delete payload.stream_key
    }

    setSaving(true)
    try {
      if (form.id) {
        await updateProfessorLiveSession(form.id, payload)
        toast.success('Live session updated.')
      } else {
        await createProfessorLiveSession(payload)
        toast.success('Live session created.')
      }
      resetForm(offerings)
      await mutateAll()
    } catch (error) {
      toast.error(apiDataErrorMessage(error, form.auto_create_vdocipher ? 'Stream generation is not configured yet.' : 'Could not save live session.'))
    } finally {
      setSaving(false)
    }
  }

  function resetForm(nextOfferings = offerings) {
    setForm({ ...defaultLiveForm(), course_offering_id: String(nextOfferings[0]?.id ?? '') })
    setShowAdvancedForm(false)
  }

  function duplicateLiveSession(session: ProfessorLiveSession) {
    setForm(duplicateFormFromSession(session))
    setShowAdvancedForm(true)
    setOpenMenuId(null)
    toast.success('Session copied. Add stream details before saving.')
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function runAction(session: ProfessorLiveSession, label: string, action: () => Promise<unknown>) {
    setBusyId(session.id)
    try {
      await action()
      toast.success(label)
      setOpenMenuId(null)
      await mutateAll()
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Action failed.'))
    } finally {
      setBusyId(null)
    }
  }

  async function revealCredentials(session: ProfessorLiveSession) {
    setRevealingId(session.id)
    try {
      const credentials = await revealProfessorLiveStreamCredentials(session.id)
      setRevealedCredentials((current) => ({ ...current, [session.id]: credentials }))
      toast.success('Stream credentials revealed.')
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not reveal stream credentials.'))
    } finally {
      setRevealingId(null)
    }
  }

  const sortedSessions = useMemo(() => [...sessions].sort(compareLiveSessions), [sessions])
  const liveSummary = useMemo(() => {
    const live = sessions.filter((session) => session.status === 'live').length
    const scheduled = sessions.filter((session) => session.status === 'scheduled').length
    const completed = sessions.filter((session) => session.status === 'completed').length
    const cancelled = sessions.filter((session) => session.status === 'cancelled').length
    const streamReady = sessions.filter((session) => Boolean(session.vdocipher_live_id || session.has_stream_credentials)).length
    return { all: sessions.length, live, scheduled, completed, cancelled, streamReady }
  }, [sessions])
  const filteredSessions = useMemo(() => (
    statusFilter === 'all' ? sortedSessions : sortedSessions.filter((session) => session.status === statusFilter)
  ), [sortedSessions, statusFilter])
  const normalizedLiveSearch = liveSearch.trim().toLowerCase()
  const visibleSessions = useMemo(() => (
    normalizedLiveSearch
      ? filteredSessions.filter((session) => liveSessionMatchesSearch(session, normalizedLiveSearch))
      : filteredSessions
  ), [filteredSessions, normalizedLiveSearch])
  const hasLiveSearch = normalizedLiveSearch.length > 0
  const activeSession = sortedSessions.find((session) => session.status === 'live') ?? sortedSessions.find((session) => session.status === 'scheduled')
  const activeSessionLabel = activeSession ? `${activeSession.title} / ${formatDateTime(activeSession.starts_at)}` : 'No upcoming session'
  const currentFilterLabel = LIVE_STATUS_FILTERS.find((filter) => filter.value === statusFilter)?.label ?? 'Sessions'
  const selectedOffering = offerings.find((offering) => String(offering.id) === form.course_offering_id)

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-6 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.14em] text-[#9f9fa9]">Live operations</p>
            <h1 className="m-0 mt-1 text-[28px] font-black leading-tight text-[#27272a]">Live Sessions</h1>
            <p className="m-0 mt-1 text-[13px] font-bold text-[#71717b]">Schedule, prepare, and control live rooms.</p>
          </div>
          <button className="professor-live-button w-full justify-center border-[#e4e4e7] bg-white text-[#52525c] sm:w-auto" type="button" onClick={() => void mutateAll()}>
            <RotateCcw size={15} />
            Refresh
          </button>
        </header>

        <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
          <form ref={formRef} onSubmit={submitLiveSession} className="grid scroll-mt-24 content-start gap-4 rounded-[16px] border border-[#e4e4e7] bg-white p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)] lg:sticky lg:top-24">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="m-0 text-[17px] font-black text-[#27272a]">{form.id ? 'Edit session' : 'New session'}</h2>
                <p className="m-0 mt-1 text-[12px] font-bold leading-5 text-[#71717b]">
                  {selectedOffering ? `${selectedOffering.subject_title} / ${selectedOffering.track.filiere}` : 'Choose an offering'}
                </p>
              </div>
              {form.id && (
                <button className="grid size-9 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#52525c]" type="button" onClick={() => resetForm()}>
                  <X size={16} />
                </button>
              )}
            </div>

            <label className="professor-live-field">
              Offering
              <select aria-label="Offering" value={form.course_offering_id} disabled={offerings.length === 0} onChange={(event) => setForm({ ...form, course_offering_id: event.target.value })} className="professor-live-input disabled:bg-[#f4f4f5] disabled:text-[#9f9fa9]">
                {offerings.length === 0 ? (
                  <option value="">No offerings available</option>
                ) : offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>{offering.title}</option>
                ))}
              </select>
            </label>

            <label className="professor-live-field">
              Title
              <input aria-label="Title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="professor-live-input" placeholder="National exam correction" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="professor-live-field">
                Starts
                <input aria-label="Starts" required type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} className="professor-live-input" />
              </label>
              <label className="professor-live-field">
                Ends
                <input aria-label="Ends" required type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} className="professor-live-input" />
              </label>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e4e4e7] bg-[#f7f8fb] px-3 py-2 text-[13px] font-black text-[#52525c]">
              <span>
                Generate stream
                {providerConfig && !providerConfig.can_auto_create && (
                  <span className="ml-2 text-[11px] font-black uppercase text-[#9f9fa9]">manual ID</span>
                )}
              </span>
              <input
                aria-label="Generate stream"
                checked={form.auto_create_vdocipher}
                className="size-4 accent-[#453dee] disabled:opacity-50"
                disabled={providerConfig ? !providerConfig.can_auto_create : true}
                type="checkbox"
                onChange={(event) => setForm({ ...form, auto_create_vdocipher: event.target.checked })}
              />
            </label>
            {providerConfig && (
              <p className="m-0 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
                {providerConfig.can_auto_create ? 'VdoCipher generation ready' : `Missing ${providerConfig.missing.join(', ')}`}
              </p>
            )}

            <label className="professor-live-field">
              VdoCipher live ID
              <input
                aria-label="VdoCipher live ID"
                value={form.vdocipher_live_id}
                disabled={form.auto_create_vdocipher}
                onChange={(event) => setForm({ ...form, vdocipher_live_id: event.target.value })}
                className="professor-live-input disabled:bg-[#f4f4f5] disabled:text-[#9f9fa9]"
                placeholder="liveId from VdoCipher"
              />
            </label>

            <button
              className="inline-flex h-10 items-center justify-between rounded-[12px] border border-[#e4e4e7] bg-white px-3 text-left text-[13px] font-black text-[#52525c]"
              type="button"
              aria-expanded={showAdvancedForm}
              aria-controls="professor-live-advanced-fields"
              onClick={() => setShowAdvancedForm((current) => !current)}
            >
              Advanced stream details
              <span className="text-[12px] text-[#9f9fa9]">{showAdvancedForm ? 'Hide' : 'Show'}</span>
            </button>

            {showAdvancedForm && (
              <div id="professor-live-advanced-fields" className="grid gap-3 rounded-[14px] border border-[#e4e4e7] bg-[#fafafa] p-3">
                <label className="professor-live-field">
                  OBS URL
                  <input
                    aria-label="OBS URL"
                    value={form.stream_ingest_url}
                    disabled={form.auto_create_vdocipher}
                    onChange={(event) => setForm({ ...form, stream_ingest_url: event.target.value })}
                    className="professor-live-input disabled:bg-[#f4f4f5] disabled:text-[#9f9fa9]"
                    placeholder="rtmp://..."
                  />
                </label>
                <label className="professor-live-field">
                  Stream key
                  <input
                    aria-label="Stream key"
                    value={form.stream_key}
                    disabled={form.auto_create_vdocipher}
                    onChange={(event) => setForm({ ...form, stream_key: event.target.value })}
                    className="professor-live-input disabled:bg-[#f4f4f5] disabled:text-[#9f9fa9]"
                    placeholder="Optional OBS key"
                  />
                </label>
                <label className="professor-live-field">
                  Notes
                  <textarea aria-label="Notes" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="professor-live-input min-h-[88px] resize-none bg-white py-3" placeholder="What students should prepare" />
                </label>
              </div>
            )}

            <button type="submit" disabled={saving || offerings.length === 0} className="professor-live-button justify-center border-[#453dee] bg-[#453dee] text-white disabled:cursor-not-allowed disabled:opacity-50">
              {form.id ? <Save size={15} /> : <CalendarPlus size={15} />}
              {saving ? 'Saving...' : form.id ? 'Save changes' : 'Create session'}
            </button>
          </form>

          <section className="min-w-0 overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
            <div className="flex flex-col gap-3 border-b border-[#e4e4e7] px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="m-0 text-[17px] font-black text-[#27272a]">Schedule</h2>
                  <p className="m-0 mt-1 max-w-[680px] truncate text-[12px] font-bold text-[#9f9fa9]">Next: {activeSessionLabel}</p>
                </div>
                <div className="grid grid-cols-4 gap-2 lg:w-[420px]" aria-label="Live session summary">
                  <LiveMetric label="Live" value={liveSummary.live} tone="text-[#f5900b]" />
                  <LiveMetric label="Scheduled" value={liveSummary.scheduled} tone="text-[#453dee]" />
                  <LiveMetric label="Ready" value={liveSummary.streamReady} tone="text-[#16a34a]" />
                  <LiveMetric label="Done" value={liveSummary.completed} tone="text-[#71717b]" />
                </div>
              </div>
              <section className="grid gap-2 xl:grid-cols-[1fr_auto]" aria-label="Live session controls">
                <label aria-label="Live session search" className="flex min-h-10 items-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-[#fbfbfc] px-3 text-[#71717b] focus-within:border-[#453dee] focus-within:ring-2 focus-within:ring-[#453dee]/10">
                  <Search size={15} className="shrink-0 text-[#9f9fa9]" />
                  <input
                    aria-label="Search live sessions"
                    className="h-10 min-w-0 flex-1 bg-transparent text-[13px] font-bold text-[#27272a] outline-none placeholder:text-[#a1a1aa]"
                    placeholder="Search sessions"
                    value={liveSearch}
                    onChange={(event) => updateLiveSearch(event.target.value)}
                  />
                  {hasLiveSearch && (
                    <button
                      aria-label="Clear live session search"
                      className="grid size-7 shrink-0 place-items-center rounded-full text-[#9f9fa9] transition hover:bg-[#f4f4f5] hover:text-[#52525c]"
                      type="button"
                      onClick={clearLiveSearch}
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <div aria-label="Live session filters" className="flex gap-1.5 overflow-x-auto">
                  {LIVE_STATUS_FILTERS.map((filter) => {
                    const selected = statusFilter === filter.value
                    return (
                      <button
                        key={filter.value}
                        aria-pressed={selected}
                        className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[11px] border px-2.5 text-[12px] font-black transition ${selected ? 'border-[#453dee] bg-[#f0f0ff] text-[#453dee]' : 'border-[#e4e4e7] bg-white text-[#71717b] hover:border-[#d4d4d8] hover:bg-[#fafafa]'}`}
                        type="button"
                        onClick={() => selectLiveStatus(filter.value)}
                      >
                        {filter.label}
                        <span className={selected ? 'text-[#453dee]' : 'text-[#9f9fa9]'}>{liveSummary[filter.value]}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
              <p className="m-0 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
                {visibleSessions.length} of {filteredSessions.length} {currentFilterLabel.toLowerCase()} sessions visible
              </p>
            </div>

            {loading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[88px] animate-pulse rounded-[12px] bg-[#f4f4f5]" />)}
              </div>
            ) : error && sortedSessions.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center p-6 text-center">
                <div>
                  <VideoIcon />
                  <h3 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">Could not load sessions</h3>
                  <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">{apiDataErrorMessage(error, 'Could not load live sessions.')}</p>
                  <button className="professor-live-button mt-4 border-[#453dee] bg-[#453dee] text-white" type="button" onClick={() => void mutateAll()}>
                    <RotateCcw size={15} />
                    Retry
                  </button>
                </div>
              </div>
            ) : sortedSessions.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center p-6 text-center">
                <div>
                  <VideoIcon />
                  <h3 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">No sessions</h3>
                  <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">Create the first live session from the form.</p>
                </div>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center p-6 text-center">
                <div>
                  <VideoIcon />
                  <h3 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">No {currentFilterLabel.toLowerCase()} sessions</h3>
                  <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">Clear the filter to review the rest of the schedule.</p>
                  <button className="professor-live-button mt-4 border-[#453dee] bg-[#453dee] text-white" type="button" onClick={() => selectLiveStatus('all')}>
                    Show all sessions
                  </button>
                </div>
              </div>
            ) : visibleSessions.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center p-6 text-center">
                <div>
                  <VideoIcon />
                  <h3 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">No matching live sessions</h3>
                  <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">Clear the search to return to the {currentFilterLabel.toLowerCase()} session list.</p>
                  <button className="professor-live-button mt-4 border-[#453dee] bg-[#453dee] text-white" type="button" onClick={clearLiveSearch}>
                    Clear search
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0f2]">
                {visibleSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    busy={busyId === session.id}
                    menuOpen={openMenuId === session.id}
                    session={session}
                    onEdit={() => {
                      setForm(formFromSession(session))
                      setShowAdvancedForm(true)
                      setOpenMenuId(null)
                    }}
                    onDuplicate={() => duplicateLiveSession(session)}
                    onToggleMenu={() => setOpenMenuId((current) => (current === session.id ? null : session.id))}
                    onNotify={() => runAction(session, 'Students notified.', () => notifyProfessorLiveSession(session.id))}
                    onStart={() => runAction(session, 'Live session started.', () => startProfessorLiveSession(session.id))}
                    onEnd={() => runAction(session, 'Live session ended.', () => endProfessorLiveSession(session.id))}
                    onCancel={() => runAction(session, 'Live session cancelled.', () => cancelProfessorLiveSession(session.id))}
                    onDelete={() => runAction(session, 'Live session deleted.', () => deleteProfessorLiveSession(session.id))}
                    onRevealCredentials={() => revealCredentials(session)}
                    revealedCredentials={revealedCredentials[session.id] ?? null}
                    revealing={revealingId === session.id}
                  />
                ))}
              </div>
            )}
          </section>
        </section>
      </main>

    </ProfessorShell>
  )
}

function SessionRow({
  session,
  busy,
  menuOpen,
  onEdit,
  onDuplicate,
  onToggleMenu,
  onNotify,
  onStart,
  onEnd,
  onCancel,
  onDelete,
  onRevealCredentials,
  revealedCredentials,
  revealing,
}: {
  session: ProfessorLiveSession
  busy: boolean
  menuOpen: boolean
  onEdit: () => void
  onDuplicate: () => void
  onToggleMenu: () => void
  onNotify: () => void
  onStart: () => void
  onEnd: () => void
  onCancel: () => void
  onDelete: () => void
  onRevealCredentials: () => void
  revealedCredentials: LiveSessionStreamCredentials | null
  revealing: boolean
}) {
  const live = session.status === 'live'
  const completed = session.status === 'completed'
  const cancelled = session.status === 'cancelled'
  const canDelete = !live
  const primaryHref = completed || cancelled ? `/live/${session.id}` : `/professor/live/${session.id}`
  const primaryLabel = live ? 'Control' : completed || cancelled ? 'View' : 'Prepare'
  const PrimaryIcon = completed || cancelled ? ExternalLink : MonitorCog
  const rowChecklist = liveSessionChecklist(session)
  const statusTone = live
    ? 'bg-[#fff7df] text-[#f5900b]'
    : cancelled
      ? 'bg-[#f4f4f5] text-[#71717b]'
      : completed
        ? 'bg-[#f0fdf4] text-[#16a34a]'
        : 'bg-[#f0f0ff] text-[#453dee]'

  return (
    <article className="grid gap-3 p-4 transition hover:bg-[#fbfbfc] lg:grid-cols-[minmax(0,1fr)_180px_210px] lg:items-center lg:gap-4">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${statusTone}`}>
            {session.status.replace(/_/g, ' ')}
          </span>
          <span className="rounded-full bg-[#f7f7f9] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">{session.notification_status.replace(/_/g, ' ')}</span>
        </div>
        <h3 className="m-0 truncate text-[15px] font-black leading-snug text-[#27272a]">{session.title}</h3>
        <p className="m-0 mt-1 text-[13px] font-bold leading-5 text-[#71717b]">{formatDateTime(session.starts_at)} - {formatDateTime(session.ends_at)}</p>
        {revealedCredentials && (
          <div className="mt-2 grid gap-2 rounded-[10px] border border-[#e4e4e7] bg-[#fafafa] p-3" aria-label="Revealed stream credentials">
            <LiveCredentialRow label="OBS URL" value={revealedCredentials.stream_ingest_url} />
            <LiveCredentialRow label="Stream key" value={revealedCredentials.stream_key} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label={`${session.title} readiness`}>
        {rowChecklist.slice(0, 3).map((item) => (
          <ReadinessPill key={item.label} item={item} />
        ))}
      </div>

      <div className="relative grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
        <Link className="professor-live-button w-full justify-center border-[#453dee] bg-[#453dee] text-white no-underline sm:w-auto" href={primaryHref}>
          <PrimaryIcon size={14} />
          {primaryLabel}
        </Link>
        {!completed && !cancelled && (
          <Link className="professor-live-button w-full justify-center border-[#e4e4e7] bg-white text-[#52525c] no-underline sm:w-auto" href={`/live/${session.id}`} target="_blank">
            <ExternalLink size={14} />
            View
          </Link>
        )}
        <button className="professor-live-button w-full justify-center border-[#e4e4e7] bg-white text-[#52525c] sm:w-auto" disabled={busy} type="button" onClick={onToggleMenu} aria-expanded={menuOpen} aria-label={`${session.title} actions`}>
          <MoreHorizontal size={15} />
          More
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-20 grid min-w-[min(100%,240px)] gap-1 rounded-[14px] border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_45px_rgba(24,24,27,0.14)] sm:min-w-[230px]">
            <button className="professor-live-menu-item text-[#52525c]" disabled={busy} type="button" onClick={onEdit}>
              <Pencil size={14} />
              Edit details
            </button>
            <button className="professor-live-menu-item text-[#52525c]" disabled={busy} type="button" onClick={onDuplicate}>
              <CalendarPlus size={14} />
              Duplicate schedule
            </button>
            {!completed && !cancelled && (
              <button className="professor-live-menu-item text-[#453dee]" disabled={busy} type="button" onClick={onNotify}>
                <BellRing size={14} />
                Notify students
              </button>
            )}
            {session.has_stream_credentials && (
              <button className="professor-live-menu-item text-[#52525c]" disabled={busy || revealing} type="button" onClick={onRevealCredentials}>
                <Eye size={14} />
                {revealing ? 'Revealing...' : revealedCredentials ? 'Refresh credentials' : 'Reveal credentials'}
              </button>
            )}
            {!live && !completed && !cancelled && (
              <button className="professor-live-menu-item text-[#f5900b]" disabled={busy} type="button" onClick={onStart}>
                <Play size={14} />
                Start session
              </button>
            )}
            {live && (
              <button className="professor-live-menu-item text-[#52525c]" disabled={busy} type="button" onClick={onEnd}>
                <Square size={13} />
                End session
              </button>
            )}
            {!completed && !cancelled && (
              <button className="professor-live-menu-item text-[#52525c]" disabled={busy} type="button" onClick={onCancel}>
                <X size={14} />
                Cancel session
              </button>
            )}
            {completed || cancelled ? (
              <Link className="professor-live-menu-item text-[#52525c] no-underline" href={`/professor/live/${session.id}`}>
                <MonitorCog size={14} />
                Control room
              </Link>
            ) : null}
            <Link className="professor-live-menu-item text-[#52525c] no-underline" href={`/live/${session.id}`} target="_blank">
              <ExternalLink size={14} />
              Student view
            </Link>
            {canDelete && (
              <button className="professor-live-menu-item text-[#dc2626]" disabled={busy} type="button" onClick={onDelete}>
                <Trash2 size={14} />
                Delete session
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function LiveCredentialRow({ label, value }: { label: string; value: string }) {
  const hasValue = value.trim().length > 0
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-2 rounded-[9px] bg-white px-2 py-2">
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">{label}</span>
        <span className="mt-0.5 block break-all text-[12px] font-bold text-[#3f3f46]">{hasValue ? value : `No ${label.toLowerCase()} saved`}</span>
      </span>
      <button
        type="button"
        disabled={!hasValue}
        onClick={() => void copyLiveCredential(label, value)}
        aria-label={`Copy ${label}`}
        className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#e4e4e7] bg-[#fbfbfc] text-[#71717b] transition hover:border-[#453dee] hover:text-[#453dee] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Copy size={13} />
      </button>
    </div>
  )
}

async function copyLiveCredential(label: string, value: string) {
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

function VideoIcon() {
  return <Radio className="mx-auto text-[#9f9fa9]" size={34} />
}

function LiveMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[11px] border border-[#ececf0] bg-[#fbfbfc] px-2.5 py-2">
      <p className="m-0 truncate text-[10px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">{label}</p>
      <strong className={`mt-1 block text-[20px] font-black leading-none ${tone}`}>{value}</strong>
    </div>
  )
}

type LiveReadinessItem = {
  label: string
  detail: string
  ready: boolean
}

function liveSessionChecklist(session: ProfessorLiveSession): LiveReadinessItem[] {
  const streamConfigured = Boolean(session.vdocipher_live_id || session.has_stream_credentials)
  const credentialsStored = Boolean(session.has_stream_credentials)
  const studentsNotified = isLiveNotificationSent(session.notification_status)
  const roomActive = session.status === 'live'

  return [
    {
      label: streamConfigured ? 'Stream linked' : 'Stream missing',
      detail: streamConfigured ? 'VdoCipher source is attached.' : 'Add a live ID or generate a stream.',
      ready: streamConfigured,
    },
    {
      label: credentialsStored ? 'OBS saved' : 'OBS not saved',
      detail: credentialsStored ? 'Ingest URL and key are stored.' : 'Reveal generated credentials or paste them manually.',
      ready: credentialsStored,
    },
    {
      label: studentsNotified ? 'Students notified' : 'Notify pending',
      detail: studentsNotified ? 'The class has been notified.' : 'Send a reminder before going live.',
      ready: studentsNotified,
    },
    {
      label: roomActive ? 'On air' : 'Room ready',
      detail: roomActive ? 'Broadcast is currently live.' : 'Open the control room before starting.',
      ready: true,
    },
  ]
}

function ReadinessPill({ item }: { item: LiveReadinessItem }) {
  const toneClass = item.ready
    ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
    : 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${toneClass}`}>
      {item.ready ? <CheckCircle2 size={12} /> : <X size={12} />}
      {item.label}
    </span>
  )
}

function isLiveNotificationSent(status: string) {
  return status === 'sent' || status === 'notified' || status === 'delivered'
}

function normalizeLiveStatus(value: string | null | undefined): LiveStatusFilter {
  return value && LIVE_STATUS_FILTER_VALUES.has(value as LiveStatusFilter) ? value as LiveStatusFilter : 'all'
}

function liveSessionMatchesSearch(session: ProfessorLiveSession, query: string) {
  const streamState = session.vdocipher_live_id || session.has_stream_credentials ? 'stream ready obs configured' : 'stream missing'
  const searchable = [
    session.title,
    session.description,
    session.status,
    session.notification_status,
    session.vdocipher_live_id,
    session.join_url,
    streamState,
    formatDateTime(session.starts_at),
    formatDateTime(session.ends_at),
  ].join(' ').toLowerCase()

  return searchable.includes(query)
}

function defaultLiveForm(): LiveForm {
  const start = new Date()
  start.setHours(start.getHours() + 2, 0, 0, 0)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return {
    course_offering_id: '',
    title: '',
    description: '',
    starts_at: toDatetimeLocal(start),
    ends_at: toDatetimeLocal(end),
    vdocipher_live_id: '',
    stream_ingest_url: '',
    stream_key: '',
    auto_create_vdocipher: false,
  }
}

function formFromSession(session: ProfessorLiveSession): LiveForm {
  return {
    id: session.id,
    course_offering_id: String(session.course_offering_id),
    title: session.title,
    description: session.description,
    starts_at: toDatetimeLocal(new Date(session.starts_at)),
    ends_at: toDatetimeLocal(new Date(session.ends_at)),
    vdocipher_live_id: session.vdocipher_live_id,
    stream_ingest_url: '',
    stream_key: '',
    auto_create_vdocipher: false,
  }
}

function duplicateFormFromSession(session: ProfessorLiveSession): LiveForm {
  const sourceStart = new Date(session.starts_at)
  const sourceEnd = new Date(session.ends_at)
  const durationMs = Math.max(30 * 60 * 1000, sourceEnd.getTime() - sourceStart.getTime())
  const startsAt = nextRecurringSessionStart(sourceStart)
  const endsAt = new Date(startsAt.getTime() + durationMs)

  return {
    course_offering_id: String(session.course_offering_id),
    title: session.title,
    description: session.description,
    starts_at: toDatetimeLocal(startsAt),
    ends_at: toDatetimeLocal(endsAt),
    vdocipher_live_id: '',
    stream_ingest_url: '',
    stream_key: '',
    auto_create_vdocipher: false,
  }
}

function nextRecurringSessionStart(sourceStart: Date) {
  const next = new Date(sourceStart)
  const now = new Date()
  do {
    next.setDate(next.getDate() + 7)
  } while (next <= now)
  return next
}

function toDatetimeLocal(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function compareLiveSessions(a: ProfessorLiveSession, b: ProfessorLiveSession) {
  const statusOrder: Record<string, number> = { live: 0, scheduled: 1, completed: 2, cancelled: 3 }
  const left = statusOrder[a.status] ?? 4
  const right = statusOrder[b.status] ?? 4
  if (left !== right) return left - right
  const aTime = new Date(a.starts_at).getTime()
  const bTime = new Date(b.starts_at).getTime()
  return left <= 1 ? aTime - bTime : bTime - aTime
}
