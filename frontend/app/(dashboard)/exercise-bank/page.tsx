'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpenCheck, ChevronLeft, Dumbbell, Lock, RotateCcw, Star, Trophy } from 'lucide-react'
import { apiDataErrorMessage } from '@/lib/apiData'
import { useCourseTopicsData } from '@/lib/courseDiscoveryData'
import {
  revealExercise,
  saveExercise,
  selfGradeExercise,
  updateExerciseNotes,
  useExerciseBankData,
  useExerciseDetail,
  type ExerciseDetail,
  type ExerciseListItem,
  type ExerciseSelfGrade,
} from '@/lib/exerciseBankData'

const difficultyOptions = ['', 'easy', 'medium', 'hard', 'bac']
const selfGradeOptions = ['', 'not_started', 'again', 'partial', 'mastered']

export default function ExerciseBankPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeSubjectId = numberParam(searchParams.get('subject'))
  const routeExerciseId = numberParam(searchParams.get('exercise'))
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(routeSubjectId)
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(routeExerciseId)
  const [difficulty, setDifficulty] = useState(searchParams.get('difficulty') || '')
  const [selfGrade, setSelfGrade] = useState(searchParams.get('self_grade') || '')
  const [savedOnly, setSavedOnly] = useState(searchParams.get('saved') === 'true')
  const [notesDraft, setNotesDraft] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [notesExerciseId, setNotesExerciseId] = useState<number | null>(null)
  const [mutating, setMutating] = useState(false)
  const lastErrorRef = useRef('')
  const { topics, loading: loadingTopics, error: topicsError } = useCourseTopicsData()
  const subjectOptions = useMemo(() => subjectOptionsFromTopics(topics), [topics])

  useEffect(() => {
    setSelectedSubjectId(routeSubjectId)
    setSelectedExerciseId(routeExerciseId)
    setDifficulty(searchParams.get('difficulty') || '')
    setSelfGrade(searchParams.get('self_grade') || '')
    setSavedOnly(searchParams.get('saved') === 'true')
  }, [routeSubjectId, routeExerciseId, searchKey, searchParams])

  useEffect(() => {
    if (selectedSubjectId || subjectOptions.length === 0) return
    setSelectedSubjectId(subjectOptions[0].id)
  }, [selectedSubjectId, subjectOptions])

  const filters = useMemo(() => ({
    difficulty: difficulty || undefined,
    selfGrade: selfGrade || undefined,
    saved: savedOnly ? true : null,
  }), [difficulty, savedOnly, selfGrade])
  const list = useExerciseBankData(selectedSubjectId, filters)
  const detail = useExerciseDetail(selectedExerciseId)
  const selectedSubject = subjectOptions.find((subject) => subject.id === selectedSubjectId) ?? subjectOptions[0] ?? null

  useEffect(() => {
    if (!detail.exercise) return
    const serverNotes = detail.exercise.notes || ''
    if (detail.exercise.id !== notesExerciseId) {
      setNotesExerciseId(detail.exercise.id)
      setNotesDraft(serverNotes)
      setNotesDirty(false)
      return
    }
    if (!notesDirty && notesDraft !== serverNotes) {
      setNotesDraft(serverNotes)
    }
  }, [detail.exercise, notesDirty, notesDraft, notesExerciseId])

  useEffect(() => {
    const error = topicsError || list.error || detail.error
    if (!error) return
    const message = apiDataErrorMessage(error, 'Could not load exercise bank.')
    if (lastErrorRef.current === message) return
    lastErrorRef.current = message
    toast.error(message)
  }, [detail.error, list.error, topicsError])

  function syncRoute(next: Partial<RouteState>) {
    const state: RouteState = {
      subject: selectedSubjectId,
      exercise: selectedExerciseId,
      difficulty,
      selfGrade,
      saved: savedOnly,
      ...next,
    }
    const params = new URLSearchParams()
    if (state.subject) params.set('subject', String(state.subject))
    if (state.exercise) params.set('exercise', String(state.exercise))
    if (state.difficulty) params.set('difficulty', state.difficulty)
    if (state.selfGrade) params.set('self_grade', state.selfGrade)
    if (state.saved) params.set('saved', 'true')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function selectSubject(subjectId: number) {
    setSelectedSubjectId(subjectId)
    setSelectedExerciseId(null)
    syncRoute({ subject: subjectId, exercise: null })
  }

  function openExercise(exerciseId: number) {
    setSelectedExerciseId(exerciseId)
    syncRoute({ exercise: exerciseId })
  }

  function closeExercise() {
    setSelectedExerciseId(null)
    syncRoute({ exercise: null })
  }

  async function revealSelectedExercise() {
    if (!selectedExerciseId) return
    setMutating(true)
    try {
      const result = await revealExercise(selectedExerciseId)
      await detail.retry(result.exercise, { revalidate: false })
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not reveal correction.'))
    } finally {
      setMutating(false)
    }
  }

  async function gradeSelectedExercise(grade: Exclude<ExerciseSelfGrade, 'not_started'>) {
    if (!selectedExerciseId) return
    setMutating(true)
    try {
      const result = await selfGradeExercise(selectedExerciseId, grade)
      await detail.retry(result.exercise, { revalidate: false })
      await list.retry((current) => {
        if (!current) return current
        if (list.key?.includes('saved=true') && !result.exercise.saved) {
          return {
            ...current,
            total: Math.max(0, current.total - 1),
            items: current.items.filter((item) => item.id !== result.exercise.id),
          }
        }
        return {
          ...current,
          items: current.items.map((item) => item.id === result.exercise.id ? { ...item, ...result.exercise } : item),
        }
      }, { revalidate: false })
      toast.success(result.xp_awarded > 0 ? `+${result.xp_awarded} XP` : 'Self-grade saved')
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not save self-grade.'))
    } finally {
      setMutating(false)
    }
  }

  async function toggleSelectedExerciseSaved() {
    if (!selectedExerciseId || !detail.exercise) return
    setMutating(true)
    try {
      const result = await saveExercise(selectedExerciseId, !detail.exercise.saved)
      await detail.retry(result.exercise, { revalidate: false })
      const removeFromSavedOnlyList = list.key?.includes('saved=true') && !result.exercise.saved
      await list.retry({
        subject_id: selectedSubjectId ?? result.exercise.subject_id,
        topic_id: null,
        total: removeFromSavedOnlyList ? Math.max(0, list.total - 1) : list.total,
        items: removeFromSavedOnlyList
          ? list.items.filter((item) => item.id !== result.exercise.id)
          : list.items.map((item) => item.id === result.exercise.id ? { ...item, ...result.exercise } : item),
      }, { revalidate: false })
      toast.success(result.exercise.saved ? 'Exercise saved' : 'Exercise unsaved')
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not update saved state.'))
    } finally {
      setMutating(false)
    }
  }

  async function saveSelectedExerciseNotes() {
    if (!selectedExerciseId) return
    setMutating(true)
    try {
      const result = await updateExerciseNotes(selectedExerciseId, notesDraft)
      await detail.retry(result.exercise, { revalidate: false })
      setNotesExerciseId(result.exercise.id)
      setNotesDraft(result.exercise.notes || '')
      setNotesDirty(false)
      toast.success('Notes saved')
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not save notes.'))
    } finally {
      setMutating(false)
    }
  }

  const showListSkeleton = (loadingTopics || list.loading) && list.items.length === 0
  const selectedExercise = detail.exercise

  return (
    <main className="figma-container">
      <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#fff7df] text-[#f5900b]">
            <Dumbbell size={26} />
          </div>
          <h1 className="figma-title m-0 text-[34px]">Exercise Bank</h1>
          <p className="figma-subtle m-0 mt-1 text-sm">Subject practice with hidden corrections, self-grades, and retry filters.</p>
        </div>
        {selectedExerciseId && (
          <button type="button" onClick={closeExercise} className="inline-flex h-11 items-center gap-2 rounded-[12px] border-2 border-[#e4e4e7] bg-white px-4 text-sm font-black text-[#52525c] transition hover:bg-[#f4f4f5]">
            <ChevronLeft size={16} />
            Back to list
          </button>
        )}
      </header>

      <section aria-label="Subjects" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {subjectOptions.map((subject) => (
          <button
            key={subject.id}
            type="button"
            onClick={() => selectSubject(subject.id)}
            className={`min-h-[88px] rounded-[14px] border-2 p-4 text-left transition ${subject.id === selectedSubjectId ? 'border-[#5b60f9] bg-[#f4f4ff] text-[#3a2fd3]' : 'border-[#e4e4e7] bg-white text-[#3f3f46] hover:-translate-y-0.5 hover:border-[#d4d4d8]'}`}
          >
            <span className="block text-sm font-black">{subject.title}</span>
            <span className="mt-2 block text-xs font-bold text-[#71717b]">{subject.topicCount} topics available</span>
          </button>
        ))}
        {subjectOptions.length === 0 && (
          <div className="rounded-[14px] border-2 border-dashed border-[#e4e4e7] bg-white p-4 text-sm font-bold text-[#71717b]">
            No published subjects are available yet.
          </div>
        )}
      </section>

      {!selectedExerciseId && (
        <>
          <section className="mb-6 flex flex-wrap items-center gap-3" aria-label="Exercise filters">
            <FilterSelect label="Difficulty" value={difficulty} options={difficultyOptions} onChange={(value) => { setDifficulty(value); syncRoute({ difficulty: value, exercise: null }) }} />
            <FilterSelect label="Self-grade" value={selfGrade} options={selfGradeOptions} onChange={(value) => { setSelfGrade(value); syncRoute({ selfGrade: value, exercise: null }) }} />
            <button
              type="button"
              onClick={() => { setSavedOnly(!savedOnly); syncRoute({ saved: !savedOnly, exercise: null }) }}
              className={`inline-flex h-10 items-center gap-2 rounded-full border-2 px-4 text-sm font-black transition ${savedOnly ? 'border-[#f97316] bg-[#fff7ed] text-[#ea580c]' : 'border-[#e4e4e7] bg-white text-[#52525c] hover:bg-[#f4f4f5]'}`}
            >
              <Star size={15} fill={savedOnly ? 'currentColor' : 'none'} />
              Saved
            </button>
            <button
              type="button"
              onClick={() => { setDifficulty(''); setSelfGrade(''); setSavedOnly(false); syncRoute({ difficulty: '', selfGrade: '', saved: false, exercise: null }) }}
              className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-[#e4e4e7] bg-white px-4 text-sm font-black text-[#52525c] transition hover:bg-[#f4f4f5]"
            >
              <RotateCcw size={15} />
              Reset
            </button>
          </section>

          <section className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="m-0 text-[22px] font-black text-[#3f3f46]">{selectedSubject?.title ?? 'Exercises'}</h2>
              <p className="m-0 mt-1 text-sm font-bold text-[#9f9fa9]">{list.total} exercise(s) in the current filtered list.</p>
            </div>
          </section>

          {showListSkeleton ? (
            <ExerciseGridSkeleton />
          ) : (
            <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Exercise list">
              {list.items.map((exercise, index) => (
                <ExerciseCard key={exercise.id} exercise={exercise} index={index + 1} onOpen={() => openExercise(exercise.id)} />
              ))}
              {list.items.length === 0 && (
                <div className="rounded-[16px] border-2 border-dashed border-[#e4e4e7] bg-white p-6 text-sm font-bold text-[#71717b] sm:col-span-2 xl:col-span-4">
                  No exercises match these filters.
                </div>
              )}
            </section>
          )}
        </>
      )}

      {selectedExerciseId && (
        <ExerciseDetailView
          exercise={selectedExercise}
          loading={detail.loading && !selectedExercise}
          mutating={mutating}
          notesDraft={notesDraft}
          notesDirty={notesDirty}
          onReveal={revealSelectedExercise}
          onToggleSaved={toggleSelectedExerciseSaved}
          onNotesChange={(value) => { setNotesDraft(value); setNotesDirty(true) }}
          onSaveNotes={saveSelectedExerciseNotes}
          onGrade={gradeSelectedExercise}
        />
      )}
    </main>
  )
}

function ExerciseCard({ exercise, index, onOpen }: { exercise: ExerciseListItem; index: number; onOpen: () => void }) {
  const locked = exercise.can_access === false
  const cta = locked ? 'Preview' : exercise.self_grade === 'not_started' ? "s'exercer" : exercise.self_grade === 'mastered' ? 'revoir' : 'continuer'

  return (
    <article className="relative min-h-[230px] rounded-[24px] bg-white p-5 shadow-[8px_12px_0_rgba(24,24,27,0.08)]">
      <StatusDot grade={exercise.self_grade} locked={locked} />
      <div className="flex min-h-[144px] flex-col items-center justify-center text-center">
        <p className="m-0 max-w-full truncate text-[16px] font-bold text-[#18181b]">{exercise.title || `Exercise ${index}`}</p>
        <p className="m-0 mt-1 text-[52px] font-black leading-none text-[#27272a]">{index}</p>
        <DifficultyBars difficulty={exercise.difficulty} />
        <p className="m-0 mt-1 text-xs font-bold capitalize text-[#52525c]">{difficultyLabel(exercise.difficulty)}</p>
        <p className="m-0 mt-2 text-xs font-black text-[#5b60f9]">{gradeLabel(exercise.self_grade)}</p>
        {exercise.saved && <p className="m-0 mt-1 inline-flex items-center gap-1 text-xs font-black text-[#b76b00]"><Star size={12} fill="currentColor" /> Saved</p>}
      </div>
      <button type="button" onClick={onOpen} className="mt-3 h-10 w-full rounded-full border-2 border-[#f97316] bg-white text-sm font-black text-[#f97316] transition hover:bg-[#fff7ed]">
        {cta}
      </button>
    </article>
  )
}

function ExerciseDetailView({
  exercise,
  loading,
  mutating,
  notesDraft,
  notesDirty,
  onReveal,
  onToggleSaved,
  onNotesChange,
  onSaveNotes,
  onGrade,
}: {
  exercise: ExerciseDetail | null
  loading: boolean
  mutating: boolean
  notesDraft: string
  notesDirty: boolean
  onReveal: () => void
  onToggleSaved: () => void
  onNotesChange: (value: string) => void
  onSaveNotes: () => void
  onGrade: (grade: Exclude<ExerciseSelfGrade, 'not_started'>) => void
}) {
  if (loading) return <ExerciseDetailSkeleton />
  if (!exercise) {
    return <div className="rounded-[16px] border-2 border-[#e4e4e7] bg-white p-6 text-sm font-bold text-[#71717b]">Exercise not found.</div>
  }
  if (exercise.can_access === false) return <LockedExercisePreview exercise={exercise} />

  const correctionRevealed = exercise.reveal_count > 0

  return (
    <article className="grid gap-5">
      <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="m-0 text-sm font-black capitalize text-[#f97316]">{difficultyLabel(exercise.difficulty)}</p>
            <h2 className="m-0 mt-2 text-[28px] font-black leading-tight text-[#27272a]">{exercise.title}</h2>
            <p className="m-0 mt-2 text-sm font-bold text-[#71717b]">{exercise.summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-full bg-[#f4f4f5] px-3 text-xs font-black text-[#52525c]">{gradeLabel(exercise.self_grade)}</span>
            <button type="button" disabled={mutating} onClick={onToggleSaved} className="inline-flex h-9 items-center gap-2 rounded-full border-2 border-[#e4e4e7] bg-white px-3 text-xs font-black text-[#52525c] transition hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-60">
              <Star size={14} fill={exercise.saved ? 'currentColor' : 'none'} />
              {exercise.saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <RichBody body={exercise.statement_body} empty="No statement body is available yet." />
        {exercise.assets.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {exercise.assets.map((asset) => (
              <figure key={asset.id} className="m-0 rounded-[14px] border border-[#e4e4e7] bg-[#fafafa] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url} alt={asset.alt_text || asset.caption || 'Exercise asset'} className="max-h-[280px] w-full rounded-[10px] object-contain" />
                {asset.caption && <figcaption className="mt-2 text-xs font-bold text-[#71717b]">{asset.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="m-0 text-[22px] font-black text-[#27272a]">Private notes</h3>
            <p className="m-0 mt-1 text-sm font-bold text-[#71717b]">Keep revision reminders for this exercise.</p>
          </div>
          <button type="button" disabled={mutating || !notesDirty || notesDraft.trim() === (exercise.notes || '').trim()} onClick={onSaveNotes} className="h-10 rounded-[12px] bg-[#5b60f9] px-4 text-sm font-black text-white transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-60">
            Save notes
          </button>
        </div>
        <textarea
          aria-label="Exercise private notes"
          value={notesDraft}
          onChange={(event) => onNotesChange(event.target.value)}
          className="mt-4 min-h-[120px] w-full resize-y rounded-[14px] border-2 border-[#e4e4e7] bg-[#fafafa] p-4 text-sm font-semibold leading-6 text-[#3f3f46] outline-none transition focus:border-[#5b60f9]"
          placeholder="Add reminders, traps, or formulas to revisit..."
        />
      </section>

      <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="m-0 text-[22px] font-black text-[#27272a]">Correction</h3>
            <p className="m-0 mt-1 text-sm font-bold text-[#71717b]">{correctionRevealed ? 'Read the correction, then self-grade honestly.' : 'Try the exercise first, then reveal the correction.'}</p>
          </div>
          {!correctionRevealed && (
            <button type="button" disabled={mutating} onClick={onReveal} className="h-11 rounded-[12px] bg-[#f97316] px-5 text-sm font-black text-white transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-60">
              Reveal correction
            </button>
          )}
        </div>

        {correctionRevealed ? (
          <>
            <RichBody body={exercise.solution_body} empty="No written correction body is available yet." />
            {exercise.solution_video_url && (
              <Link href={exercise.solution_video_url} className="mt-4 inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#eef2ff] px-4 text-sm font-black text-[#3a2fd3]">
                <BookOpenCheck size={16} />
                Video correction
              </Link>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {(['again', 'partial', 'mastered'] as const).map((grade) => (
                <button
                  key={grade}
                  type="button"
                  disabled={mutating}
                  onClick={() => onGrade(grade)}
                  className={`h-10 rounded-full border-2 px-4 text-sm font-black capitalize transition disabled:cursor-not-allowed disabled:opacity-60 ${exercise.self_grade === grade ? 'border-[#5b60f9] bg-[#f4f4ff] text-[#3a2fd3]' : 'border-[#e4e4e7] bg-white text-[#52525c] hover:bg-[#f4f4f5]'}`}
                >
                  {gradeLabel(grade)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-[14px] border-2 border-dashed border-[#e4e4e7] bg-[#fafafa] p-5 text-sm font-bold text-[#71717b]">
            Correction is hidden until you reveal it.
          </div>
        )}
      </section>
    </article>
  )
}

function LockedExercisePreview({ exercise }: { exercise: ExerciseDetail }) {
  return (
    <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#fff7ed] text-[#f97316]">
          <Lock size={20} />
        </div>
        <div>
          <h2 className="m-0 text-[26px] font-black text-[#27272a]">{exercise.title}</h2>
          <p className="m-0 mt-2 text-sm font-bold text-[#71717b]">Unlock this subject to access the statement, diagrams, correction, video, and revision filters for this exercise.</p>
        </div>
      </div>
      <Link href="/pricing" className="mt-6 inline-flex h-11 items-center rounded-[12px] bg-[#5b60f9] px-5 text-sm font-black text-white">
        View unlock options
      </Link>
    </section>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-[#e4e4e7] bg-white px-3 text-sm font-black text-[#52525c]">
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="border-0 bg-transparent text-sm font-black capitalize outline-none">
        {options.map((option) => <option key={option || 'all'} value={option}>{option ? option.replace('_', ' ') : 'All'}</option>)}
      </select>
    </label>
  )
}

function DifficultyBars({ difficulty }: { difficulty: string }) {
  const level = difficultyLevel(difficulty)
  return (
    <div aria-label={`Difficulty ${difficultyLabel(difficulty)}`} className="mt-4 flex h-7 items-end gap-1">
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={`w-2 rounded-full ${difficultyBarHeight(bar)} ${bar <= level ? 'bg-[#facc15]' : 'bg-[#e4e4e7]'}`} />
      ))}
    </div>
  )
}

function difficultyBarHeight(bar: number) {
  if (bar === 1) return 'h-[13px]'
  if (bar === 2) return 'h-[18px]'
  return 'h-[23px]'
}

function StatusDot({ grade, locked }: { grade: ExerciseSelfGrade; locked: boolean }) {
  return (
    <div className={`absolute -left-2 -top-4 grid h-10 w-10 place-items-center rounded-full border-4 border-white ${locked ? 'bg-[#e4e4e7] text-[#71717b]' : statusColor(grade)}`}>
      {locked ? <Lock size={16} /> : grade === 'mastered' ? <Trophy size={16} /> : null}
    </div>
  )
}

function RichBody({ body, empty }: { body: string; empty: string }) {
  return <div className="mt-5 whitespace-pre-wrap rounded-[14px] bg-[#fafafa] p-5 text-[15px] font-semibold leading-7 text-[#3f3f46]">{body?.trim() || empty}</div>
}

function ExerciseGridSkeleton() {
  return (
    <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((item) => <div key={item} className="h-[230px] rounded-[24px] bg-[#f4f4f5]" />)}
    </section>
  )
}

function ExerciseDetailSkeleton() {
  return <div className="h-[420px] rounded-[18px] bg-[#f4f4f5]" />
}

function subjectOptionsFromTopics(topics: Array<{ subject_id?: number; subject_title: string }>) {
  const byId = new Map<number, { id: number; title: string; topicCount: number }>()
  topics.forEach((topic) => {
    if (typeof topic.subject_id !== 'number') return
    const existing = byId.get(topic.subject_id)
    if (existing) {
      existing.topicCount += 1
    } else {
      byId.set(topic.subject_id, { id: topic.subject_id, title: topic.subject_title, topicCount: 1 })
    }
  })
  return Array.from(byId.values())
}

function numberParam(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function difficultyLevel(difficulty: string) {
  const normalized = difficulty.toLowerCase()
  if (normalized === 'hard' || normalized === 'bac') return 3
  if (normalized === 'medium') return 2
  return 1
}

function difficultyLabel(difficulty: string) {
  const normalized = difficulty.toLowerCase()
  if (normalized === 'easy') return 'Facile'
  if (normalized === 'medium') return 'Moyen'
  if (normalized === 'hard') return 'Difficile'
  if (normalized === 'bac') return 'Bac'
  return difficulty || 'Moyen'
}

function gradeLabel(grade: ExerciseSelfGrade) {
  if (grade === 'not_started') return 'Non fait'
  if (grade === 'again') return 'A refaire'
  if (grade === 'partial') return 'Partiel'
  return 'Mastered'
}

function statusColor(grade: ExerciseSelfGrade) {
  if (grade === 'mastered') return 'bg-[#dcfce7] text-[#15803d]'
  if (grade === 'partial') return 'bg-[#fef3c7] text-[#b45309]'
  if (grade === 'again') return 'bg-[#fee2e2] text-[#b91c1c]'
  return 'bg-[#ffe4d5] text-[#f97316]'
}

type RouteState = {
  subject: number | null
  exercise: number | null
  difficulty: string
  selfGrade: string
  saved: boolean
}
