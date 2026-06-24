'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, BookOpen, CalendarDays, FileText, GraduationCap, Layers3, Lock, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { apiDataErrorMessage } from '@/lib/apiData'
import { useExamBankData, type Exam, type ExamBankFilters, type ExamProblem } from '@/lib/courseDiscoveryData'
import { SkeletonBlock } from '@/components/figma'

const skeletonAnimationDelayClasses = ['[animation-delay:0ms]', '[animation-delay:60ms]', '[animation-delay:120ms]'] as const

type VisibleExam = Exam & {
  totalProblemCount: number
  completedProblemCount: number
  openedProblemCount: number
  progressPercent: number
  firstProblemId: number | null
}

type SubjectExamSection = {
  key: string
  title: string
  exams: VisibleExam[]
}

const EXAM_SEARCH_DEBOUNCE_MS = 280
const MAX_EXAMS_RENDERED = 72
const MAX_PROGRESS_DOTS = 8
const progressFilterOptions: { value: NonNullable<ExamBankFilters['progressStatus']>; label: string }[] = [
  { value: '', label: 'All progress' },
  { value: 'not_started', label: 'Not started' },
  { value: 'opened', label: 'Opened' },
  { value: 'completed', label: 'Completed' },
]
type SavedFilter = 'all' | 'saved' | 'unsaved'
const savedFilterOptions: { value: SavedFilter; label: string }[] = [
  { value: 'all', label: 'All saved' },
  { value: 'saved', label: 'Saved' },
  { value: 'unsaved', label: 'Unsaved' },
]

export default function ExamBankPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeQuery = searchParams.get('q')?.trim() || ''
  const routeProgressFilter = validProgressFilter(searchParams.get('progress_status'))
  const routeSavedFilter = validSavedFilter(searchParams.get('saved'))
  const routeProblemId = numberParam(searchParams.get('problem'))
  const [queryInput, setQueryInput] = useState(routeQuery)
  const [progressFilter, setProgressFilter] = useState<NonNullable<ExamBankFilters['progressStatus']>>(routeProgressFilter)
  const [savedFilter, setSavedFilter] = useState<SavedFilter>(routeSavedFilter)
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(() => new Set())
  const lastErrorToastRef = useRef('')

  useEffect(() => {
    setQueryInput((current) => (current === routeQuery ? current : routeQuery))
  }, [routeQuery])

  useEffect(() => {
    setProgressFilter((current) => (current === routeProgressFilter ? current : routeProgressFilter))
  }, [routeProgressFilter])

  useEffect(() => {
    setSavedFilter((current) => (current === routeSavedFilter ? current : routeSavedFilter))
  }, [routeSavedFilter])

  const query = useDebouncedValue(queryInput, EXAM_SEARCH_DEBOUNCE_MS)
  const examFilters = useMemo<ExamBankFilters>(() => ({
    progressStatus: progressFilter,
    saved: savedFilter === 'saved' ? true : savedFilter === 'unsaved' ? false : undefined,
  }), [progressFilter, savedFilter])
  const { exams, loading, error } = useExamBankData(query, examFilters)

  useEffect(() => {
    if (!error) {
      lastErrorToastRef.current = ''
      return
    }
    const message = apiDataErrorMessage(error, 'Could not load Exam Bank.')
    if (message === lastErrorToastRef.current) return
    lastErrorToastRef.current = message
    toast.error(message)
  }, [error])

  useEffect(() => {
    const params = new URLSearchParams(searchKey)
    const trimmedQuery = query.trim()

    if (trimmedQuery) params.set('q', trimmedQuery)
    else params.delete('q')

    if (progressFilter) params.set('progress_status', progressFilter)
    else params.delete('progress_status')

    if (savedFilter === 'saved') params.set('saved', 'true')
    else if (savedFilter === 'unsaved') params.set('saved', 'false')
    else params.delete('saved')

    const nextSearchKey = params.toString()
    const nextUrl = nextSearchKey ? `${pathname}?${nextSearchKey}` : pathname
    const currentUrl = searchKey ? `${pathname}?${searchKey}` : pathname

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false })
    }
  }, [pathname, progressFilter, query, router, savedFilter, searchKey])

  const visibleExams = useMemo<VisibleExam[]>(() => {
    return exams.slice(0, MAX_EXAMS_RENDERED).map(toVisibleExam).sort(compareVisibleExams)
  }, [exams])
  const groupedExamSections = useMemo(() => groupExamsBySubject(visibleExams), [visibleExams])
  const isCapped = exams.length > MAX_EXAMS_RENDERED
  const showInitialLoading = loading && exams.length === 0
  const totalProblems = visibleExams.reduce((total, exam) => total + exam.totalProblemCount, 0)
  const completedProblems = visibleExams.reduce((total, exam) => total + exam.completedProblemCount, 0)
  const hasActiveFilters = Boolean(queryInput.trim() || progressFilter || savedFilter !== 'all')

  function resetFilters() {
    setQueryInput('')
    setProgressFilter('')
    setSavedFilter('all')
  }

  function toggleSubject(subjectKey: string) {
    setExpandedSubjects((current) => {
      const next = new Set(current)
      if (next.has(subjectKey)) next.delete(subjectKey)
      else next.add(subjectKey)
      return next
    })
  }

  useEffect(() => {
    if (!routeProblemId || exams.length === 0) return
    const parentExam = exams.find((exam) => exam.problems.some((problem) => problem.id === routeProblemId))
    if (!parentExam) return
    router.replace(`/exam-bank/${parentExam.id}?problem=${routeProblemId}`, { scroll: false })
  }, [exams, routeProblemId, router])

  return (
    <main className="pt-[32px] sm:pt-[44px]">
      <header className="mb-10">
        <section className="relative overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-5 py-6 shadow-[0_12px_32px_rgba(24,24,27,0.06)] sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-8 -top-12 text-[150px] font-black leading-none tracking-[-10px] text-[color:var(--primary-soft)]" aria-hidden="true">BAC</div>
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-[color:var(--primary)] text-white shadow-[0_8px_18px_rgba(69,61,238,0.22)]">
                <GraduationCap size={24} strokeWidth={2.5} />
              </span>
              <div>
                <p className="m-0 text-[12px] font-black uppercase tracking-[1.8px] text-[color:var(--primary)]">Exam Bank</p>
                <h1 className="m-0 mt-1 text-[34px] font-black leading-[1.05] tracking-[-0.7px] text-[color:var(--text-primary)] sm:text-[40px]">Bac exams, built for real practice</h1>
                <p className="m-0 mt-2 max-w-[640px] text-[14px] font-semibold leading-6 text-[color:var(--text-hint)] sm:text-[15px]">
                  Pick a subject, work problem by problem, and return exactly where you stopped.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <BankMetric icon={<CalendarDays size={16} />} label="Exams" value={visibleExams.length} />
              <BankMetric icon={<Layers3 size={16} />} label="Problems" value={totalProblems} />
              <BankMetric icon={<BookOpen size={16} />} label="Completed" value={completedProblems} />
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-card)] p-3 shadow-[0_5px_18px_rgba(24,24,27,0.04)]" aria-label="Exam Bank filters">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
              <input
                aria-label="Search exam bank"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                className="h-[46px] w-full rounded-[13px] border border-transparent bg-[color:var(--surface-input)] pl-[42px] pr-[16px] text-[15px] font-bold text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-tertiary)] focus:border-[color:var(--primary)] focus:bg-white focus:ring-4 focus:ring-[color:var(--primary-soft)]"
                placeholder="Search by subject, year, or session"
                type="search"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <label className="inline-flex h-[46px] min-w-0 items-center gap-2 rounded-[13px] bg-[color:var(--surface-input)] px-3 text-[color:var(--text-tertiary)] sm:w-[190px]">
                <SlidersHorizontal size={15} />
                <select aria-label="Filter exam bank by progress" value={progressFilter} onChange={(event) => setProgressFilter(validProgressFilter(event.target.value))} className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-bold text-[color:var(--text-secondary)] outline-none">
                  {progressFilterOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <select aria-label="Filter exam bank by saved state" value={savedFilter} onChange={(event) => setSavedFilter(validSavedFilter(event.target.value))} className="h-[46px] rounded-[13px] border-0 bg-[color:var(--surface-input)] px-4 text-[14px] font-bold text-[color:var(--text-secondary)] outline-none focus:ring-4 focus:ring-[color:var(--primary-soft)] sm:w-[155px]">
                {savedFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {hasActiveFilters && (
                <button type="button" onClick={resetFilters} className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[13px] border border-[color:var(--border)] bg-white px-4 text-[13px] font-black text-[color:var(--text-secondary)] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)]">
                  <RotateCcw size={14} /> Reset
                </button>
              )}
            </div>
          </div>
        </section>
      </header>

      {showInitialLoading ? (
        <div className="grid gap-[54px]">
          {Array.from({ length: 2 }).map((_, sectionIndex) => (
            <section key={sectionIndex}>
              <SubjectDividerSkeleton />
              <div className="figma-course-grid">
                {Array.from({ length: 3 }).map((_, index) => (
                  <ExamCardSkeleton key={index} index={index} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-[54px]">
          {loading && (
            <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-sm font-bold text-[#71717b]">
              Updating results...
            </p>
          )}
          {!loading && visibleExams.length === 0 && (
            <section className="grid min-h-[327.5px] max-w-[1060.99px] place-items-center rounded-[16px] border-2 border-dashed border-[#e4e4e7] bg-white px-8 text-center">
              <div>
                <p className="m-0 text-[18px] font-bold leading-[1.1] tracking-[0.24px] text-[#3f3f46]">No exams found</p>
                <p className="m-0 mt-2 text-[15px] font-bold leading-[1.2] tracking-[0.18px] text-[#9f9fa9]">Try another search or progress filter.</p>
              </div>
            </section>
          )}
          {isCapped && (
            <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-sm font-bold text-[#71717b]">
              Showing the first {Math.min(exams.length, MAX_EXAMS_RENDERED)} exams. Use search to narrow the list.
            </p>
          )}
          {groupedExamSections.map((section) => (
            <section key={section.key}>
              <SubjectDivider
                title={section.title}
                examCount={section.exams.length}
                expanded={expandedSubjects.has(section.key)}
                onToggle={() => toggleSubject(section.key)}
              />
              <div className="figma-course-grid">
                {(expandedSubjects.has(section.key) ? section.exams : section.exams.slice(0, 3)).map((exam, index) => (
                  <div key={exam.id} className={!expandedSubjects.has(section.key) && index > 0 ? 'max-[760px]:hidden' : ''}>
                    <ExamCard exam={exam} index={index} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}

function SubjectDivider({ title, examCount, expanded, onToggle }: { title: string; examCount: number; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="mb-5 flex items-end gap-4 border-b border-[color:var(--border)] pb-4">
      <div className="min-w-0">
        <p className="m-0 text-[11px] font-black uppercase tracking-[1.5px] text-[color:var(--primary)]">Subject collection</p>
        <h2 className="m-0 mt-1 truncate text-[24px] font-black leading-tight tracking-[-0.3px] text-[color:var(--text-primary)]">{title}</h2>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-[color:var(--surface-hover)] px-3 py-1.5 text-[12px] font-black text-[color:var(--text-hint)]">{examCount} {examCount === 1 ? 'exam' : 'exams'}</span>
        {examCount > 3 && (
          <button type="button" onClick={onToggle} className="h-8 rounded-full border border-[color:var(--border)] bg-white px-3 text-[12px] font-black text-[color:var(--primary)] hover:border-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)]">
            {expanded ? 'Show latest' : `View all ${examCount}`}
          </button>
        )}
      </div>
    </div>
  )
}

function BankMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border)] bg-white/90 px-3 py-3 backdrop-blur-sm">
      <span className="flex items-center gap-1.5 text-[color:var(--primary)]">{icon}<span className="text-[10px] font-black uppercase tracking-[1px] text-[color:var(--text-tertiary)]">{label}</span></span>
      <strong className="mt-1 block text-[22px] font-black leading-none text-[color:var(--text-primary)]">{value}</strong>
    </div>
  )
}

function SubjectDividerSkeleton() {
  return (
    <div className="mb-[32px]">
      <SkeletonBlock className="h-8 w-48 rounded-[10px]" />
      <SkeletonBlock className="mt-2 h-5 w-36 rounded-[8px]" />
    </div>
  )
}

function ExamCardSkeleton({ index }: { index: number }) {
  return (
    <article className={`kresco-enter relative h-[300px] w-full max-w-[344.33px] overflow-hidden rounded-[16px] border-2 border-[#e4e4e7] bg-white p-[18px] shadow-[0_3.75px_0_#d9dadd] ${skeletonAnimationDelayClasses[index % skeletonAnimationDelayClasses.length]}`}>
      <SkeletonBlock className="h-9 w-32 rounded-[12px]" />
      <SkeletonBlock className="mt-8 h-6 w-44 rounded-[8px]" />
      <SkeletonBlock className="mt-3 h-14 w-28 rounded-[12px]" />
      <SkeletonBlock className="mt-7 h-3 w-full rounded-[5px]" />
      <SkeletonBlock className="mt-4 h-11 w-full rounded-[12px]" />
    </article>
  )
}

function ExamCard({ exam, index }: { exam: VisibleExam; index: number }) {
  const sessionLabel = examSessionLabel(exam.session)
  const sessionTone = examSessionTone(exam.session)
  const actionLabel = examActionLabel(exam)
  const progressLabel = `${exam.completedProblemCount}/${exam.totalProblemCount || 0} complete`
  const showLocked = exam.can_access === false
  const href = exam.firstProblemId ? `/exam-bank/${exam.id}?problem=${exam.firstProblemId}` : ''

  return (
    <article className={`kresco-enter group relative flex min-h-[286px] w-full max-w-[344.33px] flex-col overflow-hidden rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_24px_rgba(24,24,27,0.055)] transition-[border-color,box-shadow] duration-150 ease-out hover:border-[color:var(--primary)] hover:shadow-[0_14px_30px_rgba(69,61,238,0.12)] ${showLocked ? 'opacity-80' : ''}`}>
      <div className={`absolute inset-y-0 left-0 w-1.5 ${sessionTone.accent}`} />
      <div className="pointer-events-none absolute -right-2 top-7 text-[76px] font-black leading-none tracking-[-5px] text-[color:var(--surface-hover)]" aria-hidden="true">{exam.year}</div>
      <div className="relative flex items-start justify-between gap-3">
        <span className={`inline-flex min-h-[32px] items-center rounded-full border px-3 text-[11px] font-black uppercase tracking-[0.55px] ${sessionTone.chip}`}>
          {sessionLabel}
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[color:var(--border)] bg-white text-[12px] font-black text-[color:var(--text-hint)]">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <div className="relative mt-6 min-w-0">
        <p className="m-0 truncate text-[14px] font-black uppercase tracking-[0.8px] text-[color:var(--text-tertiary)]">{exam.subject_title}</p>
        <h3 className="m-0 mt-1 text-[46px] font-black leading-none tracking-[-1.5px] text-[color:var(--text-primary)]">{exam.year}</h3>
        <p className="m-0 mt-2 text-[13px] font-bold text-[color:var(--text-hint)]">{exam.totalProblemCount} structured {exam.totalProblemCount === 1 ? 'problem' : 'problems'}</p>
      </div>

      <div className="relative mt-auto pt-5">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-black text-[color:var(--text-secondary)]">
            <BookOpen size={14} strokeWidth={3} />
            {progressLabel}
          </span>
          {showLocked && (
            <span className="inline-flex items-center gap-1 text-[12px] font-black text-[color:var(--text-tertiary)]">
              <Lock size={13} strokeWidth={3} />
              Locked
            </span>
          )}
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--surface-hover)]" aria-label={`Progress ${exam.completedProblemCount} of ${exam.totalProblemCount || 0} problems completed`}>
          <span
            className="kresco-progress-fill block h-full rounded-full bg-[color:var(--primary)]"
            style={{ width: `${exam.progressPercent}%` }}
          />
        </div>

        <ExamProblemDots problems={exam.problems} />

        {href ? (
          <Link
            href={href}
            className={`mt-3.5 flex h-[44px] w-full items-center justify-between rounded-[13px] px-4 text-[14px] font-black text-white no-underline transition-[background-color,filter,transform] duration-150 ease-out active:scale-[0.96] ${
              exam.completedProblemCount === exam.totalProblemCount && exam.totalProblemCount > 0 ? 'bg-[color:var(--warning)]' : 'bg-[color:var(--primary)]'
            }`}
          >
            <span className="inline-flex items-center gap-2"><FileText size={15} strokeWidth={2.7} />{actionLabel}</span>
            <ArrowRight size={16} strokeWidth={2.7} className="transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <span className="mt-3.5 flex h-[44px] w-full items-center justify-center rounded-[13px] bg-[color:var(--surface-hover)] px-4 text-center text-[14px] font-black text-[color:var(--text-hint)]">
            No problems yet
          </span>
        )}
      </div>
    </article>
  )
}

function ExamProblemDots({ problems }: { problems: ExamProblem[] }) {
  if (problems.length === 0) {
    return (
      <div className="mt-[10px] flex h-[12px] items-center">
        <span className="text-[11px] font-black text-[#9f9fa9]">No problems published yet</span>
      </div>
    )
  }

  const visibleProblems = problems.slice(0, MAX_PROGRESS_DOTS)
  const hiddenCount = problems.length - visibleProblems.length

  return (
    <div className="mt-[10px] flex h-[12px] items-center gap-[6px]" aria-label="Problem completion status">
      {visibleProblems.map((problem) => (
        <span
          key={problem.id}
          className={`size-[10px] rounded-full ${problemStatusDotClass(problem.progress_status)}`}
          title={`${problem.title}: ${problem.progress_status === 'completed' ? 'completed' : problem.progress_status === 'opened' ? 'opened' : 'not started'}`}
        />
      ))}
      {hiddenCount > 0 && <span className="text-[11px] font-black leading-none text-[#9f9fa9]">+{hiddenCount}</span>}
    </div>
  )
}

function toVisibleExam(exam: Exam): VisibleExam {
  const totalProblemCount = exam.problems.length
  const completedProblemCount = exam.problems.filter((problem) => problem.progress_status === 'completed').length
  const openedProblemCount = exam.problems.filter((problem) => problem.progress_status === 'opened').length
  const firstProblemId = exam.problems.find((problem) => problem.can_access !== false)?.id ?? exam.problems[0]?.id ?? null

  return {
    ...exam,
    totalProblemCount,
    completedProblemCount,
    openedProblemCount,
    progressPercent: totalProblemCount > 0 ? Math.round((completedProblemCount / totalProblemCount) * 100) : 0,
    firstProblemId,
  }
}

function groupExamsBySubject(exams: VisibleExam[]): SubjectExamSection[] {
  const sections = new Map<string, SubjectExamSection>()

  for (const exam of exams) {
    const key = exam.subject_title.trim().toLowerCase() || `subject-${exam.subject_id}`
    const section = sections.get(key) ?? {
      key,
      title: exam.subject_title || 'Subject',
      exams: [],
    }
    section.exams.push(exam)
    sections.set(key, section)
  }

  return Array.from(sections.values())
}

function compareVisibleExams(a: VisibleExam, b: VisibleExam) {
  const subjectCompare = a.subject_title.localeCompare(b.subject_title)
  if (subjectCompare !== 0) return subjectCompare
  if (a.year !== b.year) return b.year - a.year
  return sessionSortRank(a.session) - sessionSortRank(b.session)
}

function examActionLabel(exam: VisibleExam) {
  if (exam.totalProblemCount === 0) return 'No problems yet'
  if (exam.completedProblemCount > 0 || exam.openedProblemCount > 0) return 'Continue'
  return 'Start'
}

function examSessionLabel(session: string) {
  const normalized = session.toLowerCase()
  if (normalized.includes('rattrap') || normalized.includes('retake')) return 'Rattrapage'
  if (normalized.includes('normal') || normalized.includes('main') || normalized.includes('regular')) return 'Session normale'
  return session || 'Session'
}

function examSessionTone(session: string) {
  const normalized = session.toLowerCase()
  if (normalized.includes('rattrap') || normalized.includes('retake')) {
    return {
      chip: 'border-[#ffd6dc] bg-[#fff1f2] text-[#e5484d]',
      accent: 'bg-[#ff8a94]',
    }
  }
  return {
    chip: 'border-[#d9f7ee] bg-[#ecfdf5] text-[#0f9f83]',
    accent: 'bg-[#78dbc8]',
  }
}

function sessionSortRank(session: string) {
  const normalized = session.toLowerCase()
  if (normalized.includes('normal') || normalized.includes('main') || normalized.includes('regular')) return 0
  if (normalized.includes('rattrap') || normalized.includes('retake')) return 1
  return 2
}

function problemStatusDotClass(status?: string) {
  if (status === 'completed') return 'bg-[#f5900b]'
  if (status === 'opened') return 'bg-[#5b60f9]'
  return 'bg-[#e4e4e7]'
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}

function numberParam(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function validProgressFilter(value: string | null): NonNullable<ExamBankFilters['progressStatus']> {
  if (value === 'not_started' || value === 'opened' || value === 'completed') return value
  return ''
}

function validSavedFilter(value: string | null): SavedFilter {
  if (value === 'true') return 'saved'
  if (value === 'false') return 'unsaved'
  return 'all'
}
