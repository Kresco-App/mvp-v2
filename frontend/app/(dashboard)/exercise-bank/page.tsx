'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, ArrowUpDown, BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Dumbbell, Layers3, LibraryBig, Loader2, Lock, NotebookPen, RotateCcw, Search, SlidersHorizontal, Star, Trophy } from 'lucide-react'
import { PermanentSidebar, type FigmaDailyQuest } from '@/components/figma'
import { apiDataErrorMessage } from '@/lib/apiData'
import { useCourseSubjectsData, type CourseSubject } from '@/lib/courseDiscoveryData'
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
type ExerciseSortKey = 'recommended' | 'needs_work' | 'difficulty' | 'time'
const sortOptions: { value: ExerciseSortKey; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'needs_work', label: 'Needs work' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'time', label: 'Shortest' },
]
const exerciseSidebarQuests: FigmaDailyQuest[] = [
  { id: 'attempt', quest_type: 'exercise', title: 'Finish one exercise workspace', progress: 0, target: 1 },
  { id: 'correction', quest_type: 'quiz', title: 'Reveal and review a correction', progress: 0, target: 1 },
  { id: 'notes', quest_type: 'study_time', title: 'Save one revision note', progress: 0, target: 1 },
]
const EXERCISES_PER_PAGE = 9

export default function ExerciseBankPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeSubjectId = numberParam(searchParams.get('subject'))
  const routeExerciseId = numberParam(searchParams.get('exercise'))
  const routeQuery = searchParams.get('q')?.trim() || ''
  const routeSort = validExerciseSort(searchParams.get('sort'))
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(routeSubjectId)
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(routeExerciseId)
  const [difficulty, setDifficulty] = useState(searchParams.get('difficulty') || '')
  const [selfGrade, setSelfGrade] = useState(searchParams.get('self_grade') || '')
  const [savedOnly, setSavedOnly] = useState(searchParams.get('saved') === 'true')
  const [queryInput, setQueryInput] = useState(routeQuery)
  const [sortBy, setSortBy] = useState<ExerciseSortKey>(routeSort)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [notesExerciseId, setNotesExerciseId] = useState<number | null>(null)
  const [mutating, setMutating] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const lastErrorRef = useRef('')
  const { subjects, loading: loadingSubjects, error: subjectsError, retry: retrySubjects } = useCourseSubjectsData()
  const subjectOptions = useMemo(() => subjectOptionsFromSubjects(subjects), [subjects])

  useEffect(() => {
    setSelectedSubjectId(routeSubjectId)
    setSelectedExerciseId(routeExerciseId)
    setDifficulty(searchParams.get('difficulty') || '')
    setSelfGrade(searchParams.get('self_grade') || '')
    setSavedOnly(searchParams.get('saved') === 'true')
    setQueryInput(routeQuery)
    setSortBy(routeSort)
  }, [routeExerciseId, routeQuery, routeSort, routeSubjectId, searchKey, searchParams])

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
  const selectedExercise = detail.exercise
  const visibleExercises = useMemo(() => sortExerciseItems(filterExerciseItems(list.items, queryInput), sortBy), [list.items, queryInput, sortBy])
  const pageCount = Math.max(1, Math.ceil(visibleExercises.length / EXERCISES_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, pageCount)
  const pageStart = (safeCurrentPage - 1) * EXERCISES_PER_PAGE
  const paginatedExercises = visibleExercises.slice(pageStart, pageStart + EXERCISES_PER_PAGE)
  const hasActiveFilters = Boolean(difficulty || selfGrade || savedOnly || queryInput.trim())
  const hasUnsavedNotes = Boolean(
    selectedExercise
      && notesDirty
      && notesDraft.trim() !== (selectedExercise.notes || '').trim(),
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [difficulty, queryInput, savedOnly, selectedSubjectId, selfGrade, sortBy])

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
    const error = subjectsError || list.error || detail.error
    if (!error) return
    const message = apiDataErrorMessage(error, 'Could not load exercise bank.')
    if (lastErrorRef.current === message) return
    lastErrorRef.current = message
    toast.error(message)
  }, [detail.error, list.error, subjectsError])

  useEffect(() => {
    if (!hasUnsavedNotes) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedNotes])

  function syncRoute(next: Partial<RouteState>) {
    const state: RouteState = {
      subject: selectedSubjectId,
      exercise: selectedExerciseId,
      difficulty,
      selfGrade,
      saved: savedOnly,
      query: queryInput,
      sort: sortBy,
      ...next,
    }
    const params = new URLSearchParams()
    if (state.subject) params.set('subject', String(state.subject))
    if (state.exercise) params.set('exercise', String(state.exercise))
    if (state.difficulty) params.set('difficulty', state.difficulty)
    if (state.selfGrade) params.set('self_grade', state.selfGrade)
    if (state.saved) params.set('saved', 'true')
    if (state.query.trim()) params.set('q', state.query.trim())
    if (state.sort !== 'recommended') params.set('sort', state.sort)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function selectSubject(subjectId: number) {
    if (!confirmDiscardNotes()) return
    setSelectedSubjectId(subjectId)
    setSelectedExerciseId(null)
    clearNotesDraft()
    syncRoute({ subject: subjectId, exercise: null })
  }

  function openExercise(exerciseId: number) {
    if (!confirmDiscardNotes()) return
    setSelectedExerciseId(exerciseId)
    syncRoute({ exercise: exerciseId })
  }

  function closeExercise() {
    if (!confirmDiscardNotes()) return
    setSelectedExerciseId(null)
    clearNotesDraft()
    syncRoute({ exercise: null })
  }

  function resetFilters() {
    setDifficulty('')
    setSelfGrade('')
    setSavedOnly(false)
    setQueryInput('')
    setSortBy('recommended')
    syncRoute({ difficulty: '', selfGrade: '', saved: false, query: '', sort: 'recommended', exercise: null })
  }

  function updateSearchQuery(value: string) {
    setQueryInput(value)
    syncRoute({ query: value, exercise: null })
  }

  function updateSort(value: string) {
    const nextSort = validExerciseSort(value)
    setSortBy(nextSort)
    syncRoute({ sort: nextSort, exercise: null })
  }

  function clearNotesDraft() {
    setNotesDraft('')
    setNotesDirty(false)
    setNotesExerciseId(null)
  }

  function confirmDiscardNotes() {
    if (!hasUnsavedNotes) return true
    return window.confirm('You have unsaved notes for this exercise. Discard them?')
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

  const showListSkeleton = (loadingSubjects || list.loading) && list.items.length === 0
  const showListError = Boolean(list.error && list.items.length === 0)

  return (
    <div className="figma-courses-container">
      <div className="figma-courses-grid">
        <main className="min-w-0 pt-[44px]">
          <header className="mb-7 rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-card)] p-5 shadow-[0_12px_32px_rgba(24,24,27,0.06)] sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-[color:var(--primary)] text-white shadow-[0_8px_18px_rgba(69,61,238,0.22)]">
                  <LibraryBig size={23} strokeWidth={2.5} />
                </span>
                <div>
                  <p className="m-0 text-[12px] font-black uppercase tracking-[1.8px] text-[color:var(--primary)]">Exercise Bank</p>
                  <h1 className="m-0 mt-1 text-[32px] font-black leading-[1.05] tracking-[-0.6px] text-[color:var(--text-primary)] sm:text-[38px]">
                    {selectedExerciseId ? 'Practice workspace' : 'Build fluency, one problem at a time'}
                  </h1>
                  <p className="m-0 mt-2 max-w-[620px] text-[14px] font-semibold leading-6 text-[color:var(--text-hint)]">
                    {selectedExerciseId ? 'Solve, reveal the correction, and leave a useful note for your next review.' : 'Choose a subject, narrow the set, and keep your revision status visible.'}
                  </p>
                </div>
              </div>
            {selectedExerciseId && (
              <button type="button" onClick={closeExercise} className="inline-flex h-11 items-center justify-center gap-2 rounded-[13px] border border-[color:var(--border)] bg-white px-4 text-sm font-black text-[color:var(--text-secondary)] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)]">
                <ChevronLeft size={16} />
                Back to list
              </button>
            )}
            {!selectedExerciseId && (
              <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
                <ExerciseMetric icon={<Layers3 size={16} />} label="Available" value={list.total} />
                <ExerciseMetric icon={<Clock3 size={16} />} label="Filtered" value={visibleExercises.length} />
              </div>
            )}
            </div>
          </header>

          {subjectsError && (
            <RetryableState
              className="mb-5"
              title="Could not load subjects"
              message={apiDataErrorMessage(subjectsError, 'Subject list is temporarily unavailable.')}
              onRetry={() => void retrySubjects()}
            />
          )}

          {!selectedExerciseId && (
            <>
              <section className="mb-5" aria-label="Subjects">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="m-0 text-[11px] font-black uppercase tracking-[1.5px] text-[color:var(--primary)]">Choose a collection</p>
                    <h2 className="m-0 mt-1 text-[20px] font-black text-[color:var(--text-primary)]">Subjects</h2>
                  </div>
                  <p className="m-0 text-[12px] font-bold text-[color:var(--text-tertiary)]">Scroll to see all</p>
                </div>
                <div className="mt-3 flex min-w-0 snap-x gap-2 overflow-x-auto pb-2">
                  {subjectOptions.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => selectSubject(subject.id)}
                      className={`min-h-[58px] min-w-[160px] shrink-0 snap-start rounded-[16px] border px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] ${subject.id === selectedSubjectId ? 'border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary)] shadow-[0_5px_14px_rgba(69,61,238,0.10)]' : 'border-[color:var(--border)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)] hover:border-[color:var(--primary)]'}`}
                    >
                      <span className="block max-w-[190px] truncate text-[14px] font-black leading-[1.15]">{subject.title}</span>
                      <span className="mt-1.5 block whitespace-nowrap text-[11px] font-bold text-[color:var(--text-hint)]">{subject.topicCount} topics available</span>
                    </button>
                  ))}
                  {!subjectsError && subjectOptions.length === 0 && (
                    <div className="rounded-[14px] border-2 border-dashed border-[#e4e4e7] bg-[#f4f4f5] px-4 py-3 text-sm font-bold text-[#71717b]">
                      No published subjects are available yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="mb-7 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-card)] p-3 shadow-[0_5px_18px_rgba(24,24,27,0.04)]" aria-label="Exercise controls">
                <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
                  <label className="relative h-[46px] min-w-0 flex-1">
                    <Search size={16} className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                    <input
                      aria-label="Search exercises"
                      value={queryInput}
                      onChange={(event) => updateSearchQuery(event.target.value)}
                      className="h-full w-full rounded-[13px] border border-transparent bg-[color:var(--surface-input)] pl-[42px] pr-[16px] text-[15px] font-bold text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-tertiary)] focus:border-[color:var(--primary)] focus:bg-white focus:ring-4 focus:ring-[color:var(--primary-soft)]"
                      placeholder="Search titles, concepts, or difficulty"
                      type="search"
                    />
                  </label>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                    <FilterSelect label="Difficulty" value={difficulty} options={difficultyOptions} onChange={(value) => { setDifficulty(value); syncRoute({ difficulty: value, exercise: null }) }} />
                    <FilterSelect label="Self-grade" value={selfGrade} options={selfGradeOptions} onChange={(value) => { setSelfGrade(value); syncRoute({ selfGrade: value, exercise: null }) }} />
                  <label className="inline-flex h-[46px] min-w-0 items-center gap-2 rounded-[13px] bg-[color:var(--surface-input)] px-3 text-[color:var(--text-tertiary)] sm:w-[160px]">
                    <ArrowUpDown size={15} />
                    <select aria-label="Sort exercises" value={sortBy} onChange={(event) => updateSort(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-bold text-[color:var(--text-secondary)] outline-none">
                      {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] pt-3">
                  <button
                    type="button"
                    onClick={() => { setSavedOnly(!savedOnly); syncRoute({ saved: !savedOnly, exercise: null }) }}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border px-3.5 text-[13px] font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] ${savedOnly ? 'border-[color:var(--warning)] bg-[color:var(--warning-soft)] text-[color:var(--warning)]' : 'border-[color:var(--border)] bg-white text-[color:var(--text-secondary)] hover:border-[color:var(--primary)]'}`}
                  >
                    <Star size={15} fill={savedOnly ? 'currentColor' : 'none'} />
                    Saved
                  </button>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-white px-3.5 text-[13px] font-black text-[color:var(--text-secondary)] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)]"
                  >
                    <RotateCcw size={15} />
                    Reset
                  </button>
                </div>
              </section>

              <section className="mb-5 flex flex-col gap-2 border-b border-[color:var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="m-0 text-[11px] font-black uppercase tracking-[1.5px] text-[color:var(--primary)]">Current set</p>
                  <h2 className="m-0 mt-1 text-[24px] font-black leading-tight text-[color:var(--text-primary)]">{selectedSubject?.title ?? 'Exercises'}</h2>
                </div>
                <p className="m-0 text-[13px] font-bold text-[color:var(--text-tertiary)]">
                  {visibleExercises.length} exercise(s) in the current filtered list.
                </p>
              </section>

              {list.error && list.items.length > 0 && (
                <RetryableState
                  className="mb-5"
                  title="Results may be out of date"
                  message={apiDataErrorMessage(list.error, 'Could not refresh this exercise list.')}
                  onRetry={() => void list.retry()}
                  compact
                />
              )}

              {showListError ? (
                <RetryableState
                  title="Could not load exercises"
                  message={apiDataErrorMessage(list.error, 'The exercise list is temporarily unavailable.')}
                  onRetry={() => void list.retry()}
                />
              ) : showListSkeleton ? (
                <ExerciseGridSkeleton />
              ) : (
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Exercise list">
                  {paginatedExercises.map((exercise, index) => (
                    <ExerciseCard
                      key={exercise.id}
                      exercise={exercise}
                      index={pageStart + index + 1}
                      subjectTitle={selectedSubject?.title}
                      onOpen={() => openExercise(exercise.id)}
                    />
                  ))}
                  {visibleExercises.length === 0 && (
                    <ExerciseEmptyState
                      subjectTitle={selectedSubject?.title}
                      hasActiveFilters={hasActiveFilters}
                      onResetFilters={resetFilters}
                    />
                  )}
                  {visibleExercises.length > EXERCISES_PER_PAGE && (
                    <ExercisePagination
                      currentPage={safeCurrentPage}
                      pageCount={pageCount}
                      pageStart={pageStart}
                      total={visibleExercises.length}
                      onPageChange={setCurrentPage}
                    />
                  )}
                </section>
              )}
            </>
          )}

          {selectedExerciseId && (
            <ExerciseDetailView
              exercise={selectedExercise}
              loading={detail.loading && !selectedExercise}
              error={detail.error}
              mutating={mutating}
              notesDraft={notesDraft}
              notesDirty={notesDirty}
              onReveal={revealSelectedExercise}
              onToggleSaved={toggleSelectedExerciseSaved}
              onNotesChange={(value) => { setNotesDraft(value); setNotesDirty(true) }}
              onSaveNotes={saveSelectedExerciseNotes}
              onGrade={gradeSelectedExercise}
              onRetry={() => void detail.retry()}
            />
          )}
        </main>
        <PermanentSidebar autoLoad={false} quests={exerciseSidebarQuests} sections={['quests', 'leaderboard']} />
      </div>
    </div>
  )
}

function ExerciseCard({
  exercise,
  index,
  onOpen,
  subjectTitle,
}: {
  exercise: ExerciseListItem
  index: number
  onOpen: () => void
  subjectTitle?: string
}) {
  const locked = exercise.can_access === false
  const cta = locked ? 'Preview' : exercise.self_grade === 'not_started' ? "s'exercer" : exercise.self_grade === 'mastered' ? 'revoir' : 'continuer'
  const status = gradeLabel(exercise.self_grade)
  const topic = topicLabel(exercise)

  return (
    <article className="kresco-enter group relative flex min-h-[250px] w-full flex-col overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_24px_rgba(24,24,27,0.055)] hover:-translate-y-1 hover:border-[color:var(--primary)] hover:shadow-[0_14px_30px_rgba(69,61,238,0.12)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[color:var(--primary-soft)]"><span className={`block h-full ${difficultyAccentClass(exercise.difficulty)}`} style={{ width: `${difficultyLevel(exercise.difficulty) * 33.333}%` }} /></div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[color:var(--primary-soft)] text-[12px] font-black text-[color:var(--primary)]">{String(index).padStart(2, '0')}</span>
          <span className="truncate rounded-full bg-[color:var(--surface-hover)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.7px] text-[color:var(--text-hint)]">{topic}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {exercise.saved && <Star size={15} fill="currentColor" className="text-[color:var(--warning)]" aria-label="Saved" />}
          <StatusDot grade={exercise.self_grade} locked={locked} />
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <p className="m-0 text-[11px] font-black uppercase tracking-[1px] text-[color:var(--text-tertiary)]">{subjectTitle || `Subject ${exercise.subject_id}`}</p>
        <h3 className="m-0 mt-1.5 line-clamp-2 text-[18px] font-black leading-[1.18] tracking-[-0.15px] text-[color:var(--text-primary)]">{exercise.title || `Exercise ${index}`}</h3>
        <p className="m-0 mt-2 line-clamp-2 text-[13px] font-semibold leading-5 text-[color:var(--text-hint)]">{exercise.summary || 'A focused practice problem with a guided correction.'}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-black">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-hover)] px-2.5 py-1.5 text-[color:var(--text-secondary)]"><Clock3 size={13} />{Math.max(1, Number(exercise.estimated_minutes || 1))} min</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-hover)] px-2.5 py-1.5 text-[color:var(--text-secondary)]"><DifficultyBars difficulty={exercise.difficulty} />{difficultyLabel(exercise.difficulty)}</span>
        <span className={`ml-auto rounded-full px-2.5 py-1.5 ${statusPillClass(exercise.self_grade)}`}>{status}</span>
      </div>

      <button type="button" onClick={onOpen} className="mt-4 flex h-11 w-full items-center justify-between rounded-[13px] bg-[color:var(--primary)] px-4 text-[14px] font-black text-white hover:brightness-[1.04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)]">
        <span>{cta}</span>
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </article>
  )
}

function ExerciseDetailView({
  exercise,
  loading,
  error,
  mutating,
  notesDraft,
  notesDirty,
  onReveal,
  onToggleSaved,
  onNotesChange,
  onSaveNotes,
  onGrade,
  onRetry,
}: {
  exercise: ExerciseDetail | null
  loading: boolean
  error: unknown
  mutating: boolean
  notesDraft: string
  notesDirty: boolean
  onReveal: () => void
  onToggleSaved: () => void
  onNotesChange: (value: string) => void
  onSaveNotes: () => void
  onGrade: (grade: Exclude<ExerciseSelfGrade, 'not_started'>) => void
  onRetry: () => void | Promise<unknown>
}) {
  if (loading) return <ExerciseDetailSkeleton />
  if (error && !exercise) {
    return (
      <RetryableState
        title="Could not load this exercise"
        message={apiDataErrorMessage(error, 'Exercise detail is temporarily unavailable.')}
        onRetry={onRetry}
      />
    )
  }
  if (!exercise) {
    return <div className="rounded-[16px] border-2 border-[#e4e4e7] bg-white p-6 text-sm font-bold text-[#71717b]">Exercise not found.</div>
  }
  if (exercise.can_access === false) return <LockedExercisePreview exercise={exercise} />

  const correctionRevealed = exercise.reveal_count > 0
  const notesChanged = notesDirty && notesDraft.trim() !== (exercise.notes || '').trim()
  const canSaveNotes = exercise.can_save_notes

  return (
    <article className="grid gap-5" aria-busy={mutating}>
      {Boolean(error) && (
        <RetryableState
          title="Exercise refresh failed"
          message={apiDataErrorMessage(error, 'Could not refresh this exercise.')}
          onRetry={onRetry}
          compact
        />
      )}
      <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-[18px] shadow-[0_3.75px_0_#d9dadd]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="m-0 text-[14px] font-black capitalize leading-[1.1] tracking-[0.18px] text-[#f5900b]">{difficultyLabel(exercise.difficulty)} workspace</p>
            <h2 className="m-0 mt-2 text-[28px] font-bold leading-[1.15] tracking-normal text-[#3f3f46]">{exercise.title}</h2>
            <p className="m-0 mt-2 max-w-[650px] text-[15px] font-bold leading-[1.35] tracking-[0.18px] text-[#71717b]">{exercise.summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-9 items-center rounded-[8px] px-3 text-xs font-black ${statusPillClass(exercise.self_grade)}`}>{gradeLabel(exercise.self_grade)}</span>
            <button type="button" disabled={mutating} onClick={onToggleSaved} className="inline-flex h-9 items-center gap-2 rounded-[12px] border-2 border-[#e4e4e7] bg-white px-3 text-xs font-black text-[#52525c] transition hover:bg-[#f4f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7c8ff] disabled:cursor-not-allowed disabled:opacity-60">
              {mutating ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} fill={exercise.saved ? 'currentColor' : 'none'} />}
              {mutating ? 'Saving...' : exercise.saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid min-w-0 gap-5">
            <WorkspacePanel
              icon={<Dumbbell size={18} />}
              title="Statement"
              subtitle={`${Math.max(1, Number(exercise.estimated_minutes || 1))} min practice block`}
            >
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
            </WorkspacePanel>

            <WorkspacePanel
              icon={<BookOpenCheck size={18} />}
              title="Correction"
              subtitle={correctionRevealed ? 'Read the correction, then self-grade honestly.' : 'Try the exercise first, then reveal the correction.'}
              action={!correctionRevealed ? (
                <button type="button" disabled={mutating} onClick={onReveal} className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[#f5900b] px-4 text-sm font-black text-white transition hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fed7aa] disabled:cursor-not-allowed disabled:opacity-60">
                  {mutating && <Loader2 size={14} className="animate-spin" />}
                  {mutating ? 'Revealing...' : 'Reveal correction'}
                </button>
              ) : null}
            >
              {correctionRevealed ? (
                <>
                  <RichBody body={exercise.solution_body} empty="No written correction body is available yet." />
                  {exercise.solution_video_url && (
                    <Link href={exercise.solution_video_url} className="mt-4 inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#eef2ff] px-4 text-sm font-black text-[#3a2fd3]">
                      <BookOpenCheck size={16} />
                      Video correction
                    </Link>
                  )}
                </>
              ) : (
                <div className="mt-5 rounded-[14px] border-2 border-dashed border-[#e4e4e7] bg-[#fafafa] p-5 text-sm font-bold leading-6 text-[#71717b]">
                  Correction is hidden until you reveal it.
                </div>
              )}
            </WorkspacePanel>
          </div>

          <aside className="grid content-start gap-4">
            <section className="rounded-[16px] border-2 border-[#e4e4e7] bg-[#fafafa] p-4">
              <h3 className="m-0 text-[18px] font-black leading-[1.1] text-[#3f3f46]">Workspace</h3>
              <div className="mt-4 grid gap-3">
                <WorkspaceStep done title="Attempt" />
                <WorkspaceStep done={correctionRevealed} title="Correction revealed" />
                <WorkspaceStep done={exercise.self_grade !== 'not_started'} title="Self-grade saved" />
                <WorkspaceStep done={!notesChanged && Boolean((exercise.notes || notesDraft).trim())} title="Notes saved" />
              </div>
            </section>

            <section className={`rounded-[16px] border-2 p-4 ${canSaveNotes ? 'border-[#e4e4e7] bg-white' : 'border-[color:var(--border)] bg-[color:var(--surface-hover)]'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 flex items-center gap-2 text-[18px] font-black leading-[1.1] text-[#3f3f46]">
                    {canSaveNotes ? <NotebookPen size={17} className="text-[#5b60f9]" /> : <Lock size={17} className="text-[color:var(--text-hint)]" />}
                    Private notes
                  </h3>
                  <p className="m-0 mt-1 text-[13px] font-bold leading-[1.35] text-[#71717b]">
                    {canSaveNotes ? 'Keep revision reminders for this exercise.' : 'Unlock this subject to write and save private revision notes.'}
                  </p>
                </div>
                <button type="button" disabled={!canSaveNotes || mutating || !notesChanged} onClick={onSaveNotes} className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] bg-[#5b60f9] px-3 text-xs font-black text-white transition hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7c8ff] disabled:cursor-not-allowed disabled:opacity-60">
                  {mutating && <Loader2 size={14} className="animate-spin" />}
                  {mutating ? 'Saving...' : canSaveNotes ? 'Save notes' : 'Locked'}
                </button>
              </div>
              <textarea
                aria-label="Exercise private notes"
                value={notesDraft}
                onChange={(event) => onNotesChange(event.target.value)}
                disabled={!canSaveNotes}
                className="mt-4 min-h-[170px] w-full resize-y rounded-[14px] border-2 border-[#e4e4e7] bg-[#fafafa] p-4 text-sm font-semibold leading-6 text-[#3f3f46] outline-none transition focus:border-[#5b60f9] disabled:cursor-not-allowed disabled:bg-[color:var(--surface-disabled)] disabled:text-[color:var(--text-hint)]"
                placeholder={canSaveNotes ? 'Add reminders, traps, or formulas to revisit...' : 'Private notes require access to this subject.'}
              />
            </section>

            <section className="rounded-[16px] border-2 border-[#e4e4e7] bg-white p-4">
              <h3 className="m-0 text-[18px] font-black leading-[1.1] text-[#3f3f46]">Self-grade</h3>
              <p className="m-0 mt-1 text-[13px] font-bold leading-[1.25] text-[#71717b]">
                {correctionRevealed ? 'Choose the revision status after checking your work.' : 'Reveal the correction before grading.'}
              </p>
              <div className="mt-4 grid gap-2">
                {(['again', 'partial', 'mastered'] as const).map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    disabled={mutating || !correctionRevealed}
                    onClick={() => onGrade(grade)}
                    className={`h-10 rounded-[12px] border-2 px-4 text-sm font-black capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7c8ff] disabled:cursor-not-allowed disabled:opacity-55 ${exercise.self_grade === grade ? 'border-[#5b60f9] bg-[#f4f4ff] text-[#3a2fd3]' : 'border-[#e4e4e7] bg-white text-[#52525c] hover:bg-[#f4f4f5]'}`}
                  >
                    {gradeLabel(grade)}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </article>
  )
}

function WorkspacePanel({
  action,
  children,
  icon,
  subtitle,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  icon: ReactNode
  subtitle: string
  title: string
}) {
  return (
    <section className="rounded-[16px] border-2 border-[#e4e4e7] bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f4f4ff] text-[#5b60f9]">
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-[20px] font-black leading-[1.1] text-[#3f3f46]">{title}</h3>
            <p className="m-0 mt-1 text-sm font-bold leading-[1.35] text-[#71717b]">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function WorkspaceStep({ done, title }: { done: boolean; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border-2 ${done ? 'border-[#22c55e] bg-[#dcfce7] text-[#15803d]' : 'border-[#e4e4e7] bg-white text-[#9f9fa9]'}`}>
        {done ? <CheckCircle2 size={14} /> : <span className="h-2 w-2 rounded-[2px] bg-current" />}
      </span>
      <span className="text-sm font-black leading-[1.2] text-[#52525c]">{title}</span>
    </div>
  )
}

function LockedExercisePreview({ exercise }: { exercise: ExerciseDetail }) {
  return (
    <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6 shadow-[0_3.75px_0_#d9dadd]">
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
    <label className="inline-flex h-[46px] min-w-0 items-center gap-2 rounded-[13px] bg-[color:var(--surface-input)] px-3 text-[color:var(--text-tertiary)] sm:w-[150px]">
      <SlidersHorizontal size={14} />
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-bold capitalize text-[color:var(--text-secondary)] outline-none">
        {options.map((option) => <option key={option || 'all'} value={option}>{option ? option.replace('_', ' ') : 'All'}</option>)}
      </select>
    </label>
  )
}

function ExerciseMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-hover)] px-3 py-3">
      <span className="flex items-center gap-1.5 text-[color:var(--primary)]">{icon}<span className="text-[10px] font-black uppercase tracking-[1px] text-[color:var(--text-tertiary)]">{label}</span></span>
      <strong className="mt-1 block text-[22px] font-black leading-none text-[color:var(--text-primary)]">{value}</strong>
    </div>
  )
}

function ExercisePagination({
  currentPage,
  pageCount,
  pageStart,
  total,
  onPageChange,
}: {
  currentPage: number
  pageCount: number
  pageStart: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pageEnd = Math.min(total, pageStart + EXERCISES_PER_PAGE)
  return (
    <nav aria-label="Exercise pages" className="mt-2 flex flex-col gap-3 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface-card)] p-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between xl:col-span-3">
      <p className="m-0 text-[12px] font-bold text-[color:var(--text-hint)]">Showing {pageStart + 1}–{pageEnd} of {total}</p>
      <div className="flex items-center gap-2">
        <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[color:var(--border)] bg-white px-3 text-[12px] font-black text-[color:var(--text-secondary)] hover:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-45">
          <ChevronLeft size={14} /> Previous
        </button>
        <span className="px-2 text-[12px] font-black text-[color:var(--text-primary)]">{currentPage} / {pageCount}</span>
        <button type="button" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[color:var(--border)] bg-white px-3 text-[12px] font-black text-[color:var(--text-secondary)] hover:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-45">
          Next <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  )
}

function RetryableState({
  title,
  message,
  onRetry,
  compact = false,
  className = '',
}: {
  title: string
  message: string
  onRetry: () => void | Promise<unknown>
  compact?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={`rounded-[16px] border-2 border-[#fee2e2] bg-[#fff7f7] ${compact ? 'p-4' : 'p-6'} ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white text-[#dc2626]">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-sm font-black text-[#3f3f46]">{title}</p>
            <p className="m-0 mt-1 text-sm font-bold leading-relaxed text-[#71717b]">{message}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onRetry()}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[12px] border-2 border-[#fecaca] bg-white px-4 text-sm font-black text-[#b91c1c] transition hover:bg-[#fff1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fecaca]"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

function ExerciseEmptyState({
  subjectTitle,
  hasActiveFilters,
  onResetFilters,
}: {
  subjectTitle?: string
  hasActiveFilters: boolean
  onResetFilters: () => void
}) {
  return (
    <div className="rounded-[18px] border-2 border-dashed border-[#e4e4e7] bg-white p-6 sm:col-span-2 xl:col-span-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 text-base font-black text-[#3f3f46]">
            {hasActiveFilters ? 'No exercises match these filters.' : `No exercises are published${subjectTitle ? ` for ${subjectTitle}` : ''} yet.`}
          </p>
          <p className="m-0 mt-1 text-sm font-bold leading-relaxed text-[#71717b]">
            {hasActiveFilters
              ? 'Clear the active filters to return to the full subject list.'
              : 'Use Courses to keep studying while this bank is being filled.'}
          </p>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[#5b60f9] px-4 text-sm font-black text-white transition hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7c8ff]"
          >
            <RotateCcw size={15} />
            Reset filters
          </button>
        ) : (
          <Link href="/courses" className="inline-flex h-10 items-center justify-center rounded-[12px] bg-[#5b60f9] px-4 text-sm font-black text-white transition hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7c8ff]">
            Open courses
          </Link>
        )}
      </div>
    </div>
  )
}

function DifficultyBars({ difficulty }: { difficulty: string }) {
  const level = difficultyLevel(difficulty)
  return (
    <span aria-label={`Difficulty ${difficultyLabel(difficulty)}`} className="inline-flex h-[12px] items-end gap-0.5">
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={`w-1 rounded-[2px] ${difficultyBarHeight(bar)} ${bar <= level ? difficultyAccentClass(difficulty) : 'bg-[color:var(--border)]'}`} />
      ))}
    </span>
  )
}

function difficultyBarHeight(bar: number) {
  if (bar === 1) return 'h-1.5'
  if (bar === 2) return 'h-[9px]'
  return 'h-3'
}

function difficultyAccentClass(difficulty: string) {
  const normalized = difficulty.toLowerCase()
  if (normalized === 'hard' || normalized === 'bac') return 'bg-[color:var(--danger)]'
  if (normalized === 'medium') return 'bg-[color:var(--warning)]'
  return 'bg-[color:var(--success)]'
}

function StatusDot({ grade, locked }: { grade: ExerciseSelfGrade; locked: boolean }) {
  return (
    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-[12px] ${locked ? 'bg-[#e4e4e7] text-[#71717b]' : statusColor(grade)}`}>
      {locked ? <Lock size={16} /> : grade === 'mastered' ? <Trophy size={16} /> : <span className="h-2.5 w-2.5 rounded-[3px] bg-current" />}
    </div>
  )
}

function RichBody({ body, empty }: { body: string; empty: string }) {
  return <div className="mt-5 whitespace-pre-wrap rounded-[14px] bg-[#fafafa] p-5 text-[15px] font-semibold leading-7 text-[#3f3f46]">{body?.trim() || empty}</div>
}

function ExerciseGridSkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map((item) => <div key={item} className="h-[250px] w-full rounded-[20px] bg-[#f4f4f5]" />)}
    </section>
  )
}

function ExerciseDetailSkeleton() {
  return <div className="h-[420px] rounded-[18px] bg-[#f4f4f5]" />
}

function subjectOptionsFromSubjects(subjects: CourseSubject[]) {
  return subjects.map((subject) => ({
    id: subject.id,
    title: subject.title,
    topicCount: Number(subject.chapter_count ?? 0),
  }))
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

function validExerciseSort(value: string | null): ExerciseSortKey {
  return sortOptions.some((option) => option.value === value) ? value as ExerciseSortKey : 'recommended'
}

function filterExerciseItems(items: ExerciseListItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return items
  return items.filter((item) => exerciseSearchText(item).includes(normalizedQuery))
}

function exerciseSearchText(item: ExerciseListItem) {
  return [
    item.title,
    item.summary,
    item.difficulty,
    (item.concept_slugs ?? []).join(' '),
  ].join(' ').toLowerCase()
}

function topicLabel(item: ExerciseListItem) {
  const concept = item.concept_slugs?.[0]
  if (concept) return concept.split(/[-_]/).filter(Boolean).map(capitalizeWord).join(' ')
  if (item.topic_id) return `Topic ${item.topic_id}`
  return 'General'
}

function capitalizeWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function sortExerciseItems(items: ExerciseListItem[], sortBy: ExerciseSortKey) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const primary = compareExerciseItems(left.item, right.item, sortBy)
      return primary || left.index - right.index
    })
    .map(({ item }) => item)
}

function compareExerciseItems(left: ExerciseListItem, right: ExerciseListItem, sortBy: ExerciseSortKey) {
  if (sortBy === 'needs_work') {
    return gradePracticeRank(left.self_grade) - gradePracticeRank(right.self_grade)
      || Number(left.order ?? 0) - Number(right.order ?? 0)
  }
  if (sortBy === 'difficulty') {
    return difficultyLevel(right.difficulty) - difficultyLevel(left.difficulty)
      || Number(left.order ?? 0) - Number(right.order ?? 0)
  }
  if (sortBy === 'time') {
    return Number(left.estimated_minutes || 0) - Number(right.estimated_minutes || 0)
      || Number(left.order ?? 0) - Number(right.order ?? 0)
  }
  return Number(left.order ?? 0) - Number(right.order ?? 0)
}

function gradePracticeRank(grade: ExerciseSelfGrade) {
  if (grade === 'again') return 0
  if (grade === 'not_started') return 1
  if (grade === 'partial') return 2
  return 3
}

function statusColor(grade: ExerciseSelfGrade) {
  if (grade === 'mastered') return 'bg-[#dcfce7] text-[#15803d]'
  if (grade === 'partial') return 'bg-[#fef3c7] text-[#b45309]'
  if (grade === 'again') return 'bg-[#fee2e2] text-[#b91c1c]'
  return 'bg-[#ffe4d5] text-[#f97316]'
}

function statusPillClass(grade: ExerciseSelfGrade) {
  if (grade === 'mastered') return 'bg-[#dcfce7] text-[#15803d]'
  if (grade === 'partial') return 'bg-[#fef3c7] text-[#b45309]'
  if (grade === 'again') return 'bg-[#fee2e2] text-[#b91c1c]'
  return 'bg-[#eef2ff] text-[#3a2fd3]'
}

type RouteState = {
  subject: number | null
  exercise: number | null
  difficulty: string
  selfGrade: string
  saved: boolean
  query: string
  sort: ExerciseSortKey
}
