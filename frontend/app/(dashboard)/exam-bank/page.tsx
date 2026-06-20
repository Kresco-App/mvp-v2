'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpen, FileText, Lock, Search } from 'lucide-react'
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
const MAX_EXAMS_RENDERED = 30
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

  useEffect(() => {
    if (!routeProblemId || exams.length === 0) return
    const parentExam = exams.find((exam) => exam.problems.some((problem) => problem.id === routeProblemId))
    if (!parentExam) return
    router.replace(`/exam-bank/${parentExam.id}?problem=${routeProblemId}`, { scroll: false })
  }, [exams, routeProblemId, router])

  return (
    <main className="pt-[44px]">
      <header className="mb-[32px]">
        <div className="mb-[22px]">
          <p className="m-0 text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">Exam Bank</p>
          <h1 className="m-0 mt-1 text-[34px] font-bold leading-[1.1] tracking-normal text-[#3f3f46]">Bac exams</h1>
        </div>

        <div className="flex min-w-0 flex-wrap items-start gap-[18px]">
          <div className="relative w-[280px] max-w-full">
            <Search size={16} className="pointer-events-none absolute left-[16px] top-1/2 -translate-y-1/2 text-[#9f9fa9]" />
            <input
              aria-label="Search exam bank"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              className="h-[44px] w-full rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] pl-[42px] pr-[16px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#3f3f46] outline-none transition placeholder:text-[#9f9fa9] focus:border-[#d4d4d8] focus:bg-white"
              placeholder="Search exams"
              type="search"
            />
          </div>

          <select
            aria-label="Filter exam bank by progress"
            value={progressFilter}
            onChange={(event) => setProgressFilter(validProgressFilter(event.target.value))}
            className="h-[44px] w-[170px] max-w-full rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] px-[16px] text-[14px] font-bold leading-[1.1] tracking-[0.18px] text-[#3f3f46] outline-none transition focus:border-[#d4d4d8] focus:bg-white"
          >
            {progressFilterOptions.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            aria-label="Filter exam bank by saved state"
            value={savedFilter}
            onChange={(event) => setSavedFilter(validSavedFilter(event.target.value))}
            className="h-[44px] w-[150px] max-w-full rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] px-[16px] text-[14px] font-bold leading-[1.1] tracking-[0.18px] text-[#3f3f46] outline-none transition focus:border-[#d4d4d8] focus:bg-white"
          >
            {savedFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
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
              <SubjectDivider title={section.title} examCount={section.exams.length} />
              <div className="figma-course-grid">
                {section.exams.map((exam, index) => (
                  <ExamCard key={exam.id} exam={exam} index={index} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}

function SubjectDivider({ title, examCount }: { title: string; examCount: number }) {
  return (
    <div className="mb-[32px]">
      <h2 className="m-0 text-[24px] font-bold leading-[1.4] tracking-normal text-[#3f3f46]">{title}</h2>
      <p className="m-0 text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">
        {examCount} {examCount === 1 ? 'exam' : 'exams'}
      </p>
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
    <article className={`kresco-enter group relative flex h-[300px] w-full max-w-[344.33px] flex-col overflow-hidden rounded-[16px] border-2 border-[#e4e4e7] bg-white p-[18px] shadow-[0_3.75px_0_#d9dadd] transition duration-200 hover:-translate-y-1 hover:shadow-[0_5px_0_#d9dadd] ${showLocked ? 'opacity-80' : ''}`}>
      <div className={`absolute inset-x-0 bottom-0 h-[5px] ${sessionTone.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex min-h-[34px] items-center rounded-[12px] border px-[12px] text-[12px] font-black leading-[1.1] tracking-[0.12px] ${sessionTone.chip}`}>
          {sessionLabel}
        </span>
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-[#e4e4e7] bg-[#f4f4f5] text-[13px] font-black text-[#71717b]">
          {index + 1}
        </span>
      </div>

      <div className="mt-[24px] min-w-0">
        <p className="m-0 truncate text-[18px] font-bold leading-[1.1] tracking-[0.2px] text-[#3f3f46]">{exam.subject_title}</p>
        <h3 className="m-0 mt-1 text-[52px] font-black leading-none tracking-normal text-[#18181b]">{exam.year}</h3>
      </div>

      <div className="mt-auto">
        <div className="mb-[10px] flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-black leading-[1.1] tracking-[0.12px] text-[#71717b]">
            <BookOpen size={14} strokeWidth={3} />
            {progressLabel}
          </span>
          {showLocked && (
            <span className="inline-flex items-center gap-1 text-[12px] font-black text-[#9f9fa9]">
              <Lock size={13} strokeWidth={3} />
              Locked
            </span>
          )}
        </div>

        <div className="h-[10px] w-full overflow-hidden rounded-[4.286px] bg-[#f4f4f5]" aria-label={`Progress ${exam.completedProblemCount} of ${exam.totalProblemCount || 0} problems completed`}>
          <span
            className="kresco-progress-fill block h-full rounded-[4.286px] bg-[#5b60f9] shadow-[inset_0px_2.857px_2.857px_rgba(255,255,255,.4),inset_0px_-2.857px_2.857px_rgba(0,0,0,.08)]"
            style={{ width: `${exam.progressPercent}%` }}
          />
        </div>

        <ExamProblemDots problems={exam.problems} />

        {href ? (
          <Link
            href={href}
            className={`mt-[14px] flex h-[44px] w-full items-center justify-center gap-2 rounded-[12px] px-[34px] py-[11px] text-center text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-white no-underline transition duration-200 group-hover:brightness-[1.03] group-hover:saturate-[1.08] ${
              exam.completedProblemCount === exam.totalProblemCount && exam.totalProblemCount > 0 ? 'bg-[#f5900b]' : 'bg-[#5b60f9]'
            }`}
          >
            <FileText size={16} strokeWidth={3} />
            {actionLabel}
          </Link>
        ) : (
          <span className="mt-[14px] flex h-[44px] w-full items-center justify-center rounded-[12px] bg-[#d4d4d8] px-[34px] py-[11px] text-center text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#71717b]">
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
