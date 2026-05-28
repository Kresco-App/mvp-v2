'use client'

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BellRing, CalendarPlus, Eye, ExternalLink, MonitorCog, MoreHorizontal, Pencil, Play, Radio, RotateCcw, Save, Square, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { apiDataErrorMessage } from '@/lib/apiData'
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

export default function ProfessorLivePage() {
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [revealingId, setRevealingId] = useState<number | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [revealedCredentials, setRevealedCredentials] = useState<Record<number, LiveSessionStreamCredentials>>({})
  const [showAdvancedForm, setShowAdvancedForm] = useState(false)
  const [form, setForm] = useState<LiveForm>(() => defaultLiveForm())
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

    const payload: LiveSessionInput = {
      course_offering_id: Number(form.course_offering_id),
      title: form.title.trim(),
      description: form.description.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
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
  const selectedOffering = offerings.find((offering) => String(offering.id) === form.course_offering_id)

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[1280px] py-8 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <header className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.14em] text-[#9f9fa9]">Live operations</p>
            <h1 className="m-0 mt-1 text-[30px] font-black leading-tight text-[#3f3f46]">Live Sessions</h1>
            <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">Schedule sessions and open the control room when it is time to go live.</p>
          </div>
          <button className="professor-live-button border-[#e4e4e7] bg-white text-[#52525c]" type="button" onClick={() => void mutateAll()}>
            <RotateCcw size={15} />
            Refresh
          </button>
        </header>

        <section className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
          <form onSubmit={submitLiveSession} className="grid content-start gap-4 rounded-[16px] border-2 border-[#e4e4e7] bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="m-0 text-[18px] font-black text-[#3f3f46]">{form.id ? 'Edit session' : 'New session'}</h2>
                <p className="m-0 mt-1 text-[12px] font-bold leading-5 text-[#71717b]">
                  {selectedOffering ? `${selectedOffering.subject_title} / ${selectedOffering.track.filiere}` : 'Choose an offering'}
                </p>
              </div>
              {form.id && (
                <button className="grid size-9 place-items-center rounded-[10px] border-2 border-[#e4e4e7] bg-white text-[#52525c]" type="button" onClick={() => resetForm()}>
                  <X size={16} />
                </button>
              )}
            </div>

            <label className="professor-live-field">
              Offering
              <select aria-label="Offering" value={form.course_offering_id} onChange={(event) => setForm({ ...form, course_offering_id: event.target.value })} className="professor-live-input">
                {offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>{offering.title}</option>
                ))}
              </select>
            </label>

            <label className="professor-live-field">
              Title
              <input aria-label="Title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="professor-live-input" placeholder="National exam correction" />
            </label>

            <div className="grid gap-3">
              <label className="professor-live-field">
                Starts
                <input aria-label="Starts" required type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} className="professor-live-input" />
              </label>
              <label className="professor-live-field">
                Ends
                <input aria-label="Ends" required type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} className="professor-live-input" />
              </label>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-[12px] border-2 border-[#e4e4e7] bg-[#f7f8fb] px-3 py-2 text-[13px] font-black text-[#52525c]">
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
              className="inline-flex h-10 items-center justify-between rounded-[12px] border-2 border-[#e4e4e7] bg-white px-3 text-left text-[13px] font-black text-[#52525c]"
              type="button"
              onClick={() => setShowAdvancedForm((current) => !current)}
            >
              Advanced stream details
              <span className="text-[12px] text-[#9f9fa9]">{showAdvancedForm ? 'Hide' : 'Show'}</span>
            </button>

            {showAdvancedForm && (
              <div className="grid gap-3 rounded-[14px] border border-[#e4e4e7] bg-[#fafafa] p-3">
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

          <section className="min-w-0 rounded-[16px] border-2 border-[#e4e4e7] bg-white">
            <div className="flex h-[56px] items-center justify-between border-b border-[#e4e4e7] px-5">
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Sessions</h2>
              <span className="text-[12px] font-black text-[#9f9fa9]">{sortedSessions.length} total</span>
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
            ) : (
              <div className="divide-y divide-[#f0f0f2]">
                {sortedSessions.map((session) => (
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

  return (
    <article className="grid gap-4 p-5">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`text-[12px] font-black uppercase tracking-[0.08em] ${live ? 'text-[#f5900b]' : cancelled ? 'text-[#9f9fa9]' : 'text-[#453dee]'}`}>
            {session.status}
          </span>
          <span className="text-[12px] font-bold text-[#9f9fa9]">{session.notification_status}</span>
        </div>
        <h3 className="m-0 truncate text-[18px] font-black text-[#3f3f46]">{session.title}</h3>
        <p className="m-0 mt-1 text-[13px] font-bold text-[#71717b]">{formatDateTime(session.starts_at)} - {formatDateTime(session.ends_at)}</p>
        <p className="m-0 mt-1 truncate text-[12px] font-bold text-[#9f9fa9]">{session.vdocipher_live_id || 'No stream ID'}</p>
        {session.has_stream_credentials && !revealedCredentials && (
          <p className="m-0 mt-1 truncate text-[12px] font-bold text-[#71717b]">Stream credentials saved</p>
        )}
        {revealedCredentials && (
          <div className="mt-2 grid gap-1 rounded-[10px] border border-[#e4e4e7] bg-[#fafafa] p-3">
            <p className="m-0 truncate text-[12px] font-bold text-[#3f3f46]">{revealedCredentials.stream_ingest_url || 'No OBS URL saved'}</p>
            <p className="m-0 truncate text-[12px] font-bold text-[#3f3f46]">{revealedCredentials.stream_key || 'No stream key saved'}</p>
          </div>
        )}
      </div>

      <div className="relative flex flex-wrap gap-2">
        <Link className="professor-live-button border-[#453dee] bg-[#453dee] text-white no-underline" href={primaryHref}>
          <PrimaryIcon size={14} />
          {primaryLabel}
        </Link>
        {!completed && !cancelled && (
          <Link className="professor-live-button border-[#e4e4e7] bg-white text-[#52525c] no-underline" href={`/live/${session.id}`} target="_blank">
            <ExternalLink size={14} />
            View
          </Link>
        )}
        <button className="professor-live-button border-[#e4e4e7] bg-white text-[#52525c]" disabled={busy} type="button" onClick={onToggleMenu} aria-expanded={menuOpen} aria-label={`${session.title} actions`}>
          <MoreHorizontal size={15} />
          More
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-12 z-20 grid min-w-[210px] gap-1 rounded-[14px] border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_45px_rgba(24,24,27,0.14)]">
            <button className="professor-live-menu-item text-[#52525c]" disabled={busy} type="button" onClick={onEdit}>
              <Pencil size={14} />
              Edit details
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

function VideoIcon() {
  return <Radio className="mx-auto text-[#9f9fa9]" size={34} />
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

function toDatetimeLocal(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
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
