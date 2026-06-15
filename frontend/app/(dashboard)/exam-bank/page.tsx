'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpen, CalendarDays, CheckCircle2, ChevronLeft, FileText, Lock, Play, Search, Trophy, Video } from 'lucide-react'
import { apiDataErrorMessage } from '@/lib/apiData'
import { useExamBankData, useExamProblemDetail, type Exam, type ExamProblem, type ExamProblemDetail, type ExamProblemPart } from '@/lib/courseDiscoveryData'
import { SkeletonBlock } from '@/components/figma'

const skeletonAnimationDelayClasses = ['[animation-delay:0ms]', '[animation-delay:60ms]', '[animation-delay:120ms]'] as const

type VisibleExam = Exam & {
  totalProblemCount: number
}

const EXAM_SEARCH_DEBOUNCE_MS = 280
const MAX_EXAMS_RENDERED = 30
const MAX_PROBLEMS_PER_EXAM = 12

export default function ExamBankPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeQuery = searchParams.get('q')?.trim() || ''
  const routeProblemId = numberParam(searchParams.get('problem'))
  const [queryInput, setQueryInput] = useState(routeQuery)
  const [selectedProblemId, setSelectedProblemId] = useState<number | null>(routeProblemId)
  const routeProblemVersionRef = useRef<number | null>(routeProblemId)
  const [detailRequestVersion, setDetailRequestVersion] = useState(routeProblemId ? 1 : 0)
  const lastErrorToastRef = useRef('')

  useEffect(() => {
    setQueryInput((current) => (current === routeQuery ? current : routeQuery))
  }, [routeQuery])

  const query = useDebouncedValue(queryInput, EXAM_SEARCH_DEBOUNCE_MS)
  const { exams, loading, error } = useExamBankData(query)
  const detail = useExamProblemDetail(selectedProblemId, detailRequestVersion)

  useEffect(() => {
    setSelectedProblemId(routeProblemId)
    if (routeProblemVersionRef.current === routeProblemId) return
    routeProblemVersionRef.current = routeProblemId
    if (routeProblemId) setDetailRequestVersion((value) => value + 1)
  }, [routeProblemId])

  useEffect(() => {
    const activeError = error || detail.error
    if (!activeError) {
      lastErrorToastRef.current = ''
      return
    }
    const message = apiDataErrorMessage(activeError, 'Could not load Exam Bank.')
    if (message === lastErrorToastRef.current) return
    lastErrorToastRef.current = message
    toast.error(message)
  }, [detail.error, error])

  useEffect(() => {
    const params = new URLSearchParams(searchKey)
    const trimmedQuery = query.trim()

    if (trimmedQuery) {
      params.set('q', trimmedQuery)
    } else {
      params.delete('q')
    }

    const nextSearchKey = params.toString()
    const nextUrl = nextSearchKey ? `${pathname}?${nextSearchKey}` : pathname
    const currentUrl = searchKey ? `${pathname}?${searchKey}` : pathname

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false })
    }
  }, [pathname, query, router, searchKey])

  const visibleExams = useMemo<VisibleExam[]>(() => {
    return exams.slice(0, MAX_EXAMS_RENDERED).map((exam) => ({
      ...exam,
      problems: exam.problems.slice(0, MAX_PROBLEMS_PER_EXAM),
      totalProblemCount: exam.problems.length,
    }))
  }, [exams])
  const isCapped = exams.length > MAX_EXAMS_RENDERED || exams.some((exam) => exam.problems.length > MAX_PROBLEMS_PER_EXAM)
  const showInitialLoading = loading && exams.length === 0

  function openProblem(problemId: number) {
    setSelectedProblemId(problemId)
    routeProblemVersionRef.current = problemId
    setDetailRequestVersion((value) => value + 1)
    const params = new URLSearchParams(searchKey)
    params.set('problem', String(problemId))
    const nextSearchKey = params.toString()
    router.replace(nextSearchKey ? `${pathname}?${nextSearchKey}` : pathname, { scroll: false })
  }

  function closeProblem() {
    setSelectedProblemId(null)
    routeProblemVersionRef.current = null
    const params = new URLSearchParams(searchKey)
    params.delete('problem')
    const nextSearchKey = params.toString()
    router.replace(nextSearchKey ? `${pathname}?${nextSearchKey}` : pathname, { scroll: false })
  }

  return (
    <div className="figma-container">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#fff7df] text-[#f5900b]">
            <Trophy size={26} />
          </div>
          <h1 className="figma-title m-0 text-[34px]">Exam Bank</h1>
          <p className="figma-subtle m-0 mt-1 text-sm">National exam problems with written and video correction status.</p>
        </div>
        {selectedProblemId ? (
          <button type="button" onClick={closeProblem} className="inline-flex h-11 items-center gap-2 rounded-[12px] border-2 border-[#e4e4e7] bg-white px-4 text-sm font-black text-[#52525c] transition hover:bg-[#f4f4f5]">
            <ChevronLeft size={16} />
            Back to exam list
          </button>
        ) : (
          <div className="relative w-full lg:w-[380px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
            <input aria-label="Search exam bank" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} className="figma-input w-full pl-11" placeholder="Search year, topic, concept..." />
          </div>
        )}
      </header>

      {selectedProblemId ? (
        <ExamProblemDetailView problem={detail.problem} loading={detail.loading && !detail.problem} />
      ) : showInitialLoading ? (
        <div className="grid gap-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <section key={index} className={`figma-card kresco-enter overflow-hidden ${skeletonAnimationDelayClasses[index]}`}>
              <div className="border-b border-[#e4e4e7] p-5">
                <SkeletonBlock className="h-3 w-40 rounded-md" />
                <SkeletonBlock className="mt-3 h-5 w-72 max-w-full rounded-md" />
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, problemIndex) => (
                  <article key={problemIndex} className="rounded-2xl border border-[#e4e4e7] bg-[#fbfcff] p-5">
                    <SkeletonBlock className="h-4 w-[58%] rounded-md" />
                    <SkeletonBlock className="mt-3 h-3 w-full rounded-md" />
                    <SkeletonBlock className="mt-2 h-3 w-[72%] rounded-md" />
                    <div className="mt-5 flex gap-2">
                      <SkeletonBlock className="h-8 w-20 rounded-xl" />
                      <SkeletonBlock className="h-8 w-24 rounded-xl" />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-6">
          {loading && (
            <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-sm font-bold text-[#71717b]">
              Updating results...
            </p>
          )}
          {!loading && visibleExams.length === 0 && (
            <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-sm font-bold text-[#71717b]">
              No exam problems match this search.
            </p>
          )}
          {isCapped && (
            <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-sm font-bold text-[#71717b]">
              Showing the first {Math.min(exams.length, MAX_EXAMS_RENDERED)} exam groups and up to {MAX_PROBLEMS_PER_EXAM} problems per group. Use search to narrow the list.
            </p>
          )}
          {visibleExams.map((exam) => (
            <section key={exam.id} className="figma-card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-[#e4e4e7] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-black text-[#71717b]">
                    <span className="inline-flex items-center gap-1"><BookOpen size={14} /> {exam.subject_title}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays size={14} /> {exam.year}</span>
                  </div>
                  <h2 className="m-0 text-lg font-black text-[#3f3f46]">{exam.title}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {exam.can_access === false && (
                    <span className="inline-flex h-9 items-center gap-2 rounded-[12px] bg-[#f4f4f5] px-3 text-xs font-black text-[#71717b]">
                      <Lock size={14} />
                      {lockedExamReason(exam.locked_reason)}
                    </span>
                  )}
                  <span className="rounded-2xl bg-[#eaf8ff] px-4 py-2 text-xs font-black text-[#1292cf]">{exam.totalProblemCount} problem(s)</span>
                </div>
              </div>
              {exam.can_access === false && <LockedExamPreview exam={exam} />}
              <div className="grid gap-4 p-5 lg:grid-cols-2">
                {exam.problems.map((problem) => (
                  <article key={problem.id} className={`rounded-2xl border border-[#e4e4e7] bg-[#fbfcff] p-5 ${problem.can_access === false ? 'opacity-85' : ''}`}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="m-0 text-base font-black text-[#3f3f46]">{problem.title}</h3>
                        <p className="m-0 mt-2 line-clamp-3 text-sm font-semibold leading-relaxed text-[#71717b]">{problem.statement}</p>
                      </div>
                      <span className="rounded-xl bg-[#fff7df] px-3 py-1 text-[11px] font-black text-[#b76b00]">{problem.difficulty}</span>
                    </div>
                    <div className="mb-5 flex flex-wrap gap-2">
                      {problem.concept_slugs.slice(0, 5).map((concept) => (
                        <span key={concept} className="rounded-xl bg-white px-3 py-1.5 text-[11px] font-black text-[#71717b] shadow-sm">{concept}</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openProblem(problem.id)} className="figma-button">
                        <FileText size={14} />
                        Open problem
                      </button>
                      {problem.topic_id && problem.can_access !== false && (
                        <Link href={`/topics/${problem.topic_id}`} className="figma-button">
                          <Play size={14} />
                          Open topic
                        </Link>
                      )}
                      {problem.can_access === false && (
                        <>
                          <span className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#f4f4f5] px-4 text-xs font-black text-[#71717b]">
                            <Lock size={14} />
                            {lockedExamReason(problem.locked_reason)}{lockMetadata(problem) ? ` - ${lockMetadata(problem)}` : ''}
                          </span>
                          <Link href="/pricing" className="inline-flex h-11 items-center rounded-[14px] bg-[#5b60f9] px-4 text-xs font-black text-white transition hover:brightness-[1.03]">
                            Unlock options
                          </Link>
                        </>
                      )}
                      <span className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-white px-4 text-xs font-black text-[#71717b]">
                        <FileText size={14} />
                        Written
                      </span>
                      {problem.video_resource && (
                        <span className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-white px-4 text-xs font-black text-[#71717b]">
                          <CheckCircle2 size={14} />
                          Video
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {exam.totalProblemCount > exam.problems.length && (
                <p className="m-0 border-t border-[#e4e4e7] bg-white px-5 py-3 text-xs font-black text-[#9f9fa9]">
                  {exam.totalProblemCount - exam.problems.length} more problem(s) hidden in this group. Search by concept, topic, or year to narrow the result.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function LockedExamPreview({ exam }: { exam: VisibleExam }) {
  const metadata = lockMetadata(exam)

  return (
    <div className="border-b border-[#e4e4e7] bg-[#fafafa] px-5 py-4">
      <p className="m-0 text-sm font-black leading-relaxed text-[#52525c]">
        Locked preview: {exam.subject_title} {exam.year} {exam.session}. {exam.totalProblemCount} problem(s) are listed so you can inspect the exam structure before unlocking.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {metadata && <p className="m-0 text-xs font-black capitalize text-[#9f9fa9]">{metadata}</p>}
        <Link href="/pricing" className="inline-flex h-9 items-center rounded-[12px] bg-[#5b60f9] px-4 text-xs font-black text-white transition hover:brightness-[1.03]">
          View unlock options
        </Link>
      </div>
    </div>
  )
}

function ExamProblemDetailView({ problem, loading }: { problem: ExamProblemDetail | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-5">
        <SkeletonBlock className="h-32 rounded-[18px]" />
        <SkeletonBlock className="h-48 rounded-[18px]" />
      </div>
    )
  }
  if (!problem) {
    return <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-sm font-bold text-[#71717b]">Exam problem not found.</p>
  }
  if (problem.can_access === false) {
    return (
      <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#fff7ed] text-[#f97316]">
            <Lock size={20} />
          </div>
          <div>
            <p className="m-0 text-sm font-black text-[#71717b]">{problem.subject_title} · {problem.year} · {problem.session}</p>
            <h2 className="m-0 mt-2 text-[28px] font-black leading-tight text-[#27272a]">{problem.title}</h2>
            <p className="m-0 mt-2 text-sm font-bold text-[#71717b]">Unlock this subject to access the enonce, part capsules, written corrections, and video corrections.</p>
          </div>
        </div>
        <Link href="/pricing" className="mt-6 inline-flex h-11 items-center rounded-[12px] bg-[#5b60f9] px-5 text-sm font-black text-white">
          View unlock options
        </Link>
      </section>
    )
  }

  return (
    <article className="grid gap-5">
      <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
        <p className="m-0 text-sm font-black text-[#71717b]">{problem.subject_title} · {problem.year} · {problem.session}</p>
        <h2 className="m-0 mt-2 text-[30px] font-black leading-tight text-[#27272a]">{problem.title}</h2>
        <RichTextBlock body={problem.statement} empty="No main problem enonce is available yet." />
        {problem.written_solution && (
          <div className="mt-5">
            <h3 className="m-0 text-lg font-black text-[#27272a]">Written correction</h3>
            <RichTextBlock body={problem.written_solution} empty="" />
          </div>
        )}
      </section>

      <section className="grid gap-4">
        {problem.parts.length > 0 ? problem.parts.map((part) => <ExamPartCapsule key={part.id} part={part} />) : (
          <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-sm font-bold text-[#71717b]">No published parts are attached to this problem yet.</p>
        )}
      </section>
    </article>
  )
}

function ExamPartCapsule({ part }: { part: ExamProblemPart }) {
  if (part.can_access === false) {
    return (
      <article className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#fff7ed] text-[#f97316]">
            <Lock size={18} />
          </div>
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-[0.16px] text-[#f97316]">{part.part_label || `Part ${part.order}`}</p>
            <h3 className="m-0 mt-1 text-[22px] font-black text-[#27272a]">{part.title}</h3>
            <p className="m-0 mt-2 text-sm font-bold text-[#71717b]">{lockedExamReason(part.locked_reason)}. Unlock this subject to access this part enonce and correction.</p>
          </div>
        </div>
        <Link href="/pricing" className="mt-5 inline-flex h-10 items-center rounded-[12px] bg-[#5b60f9] px-4 text-sm font-black text-white">
          Unlock options
        </Link>
      </article>
    )
  }
  const videoUrl = part.correction_video_url || part.video_resource?.url || ''

  return (
    <article className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.16px] text-[#f97316]">{part.part_label || `Part ${part.order}`}</p>
          <h3 className="m-0 mt-1 text-[22px] font-black text-[#27272a]">{part.title}</h3>
        </div>
        <span className="rounded-xl bg-[#fff7df] px-3 py-1 text-[11px] font-black text-[#b76b00]">{part.difficulty}</span>
      </div>

      {(videoUrl || part.video_resource) && (
        <div className="mt-5 rounded-[14px] border border-[#e4e4e7] bg-[#fbfcff] p-4">
          <p className="m-0 inline-flex items-center gap-2 text-sm font-black text-[#3f3f46]">
            <Video size={16} />
            Video correction
          </p>
          {videoUrl ? (
            <Link href={videoUrl} className="mt-3 inline-flex h-10 items-center rounded-[12px] bg-[#eef2ff] px-4 text-sm font-black text-[#3a2fd3]">
              Open video
            </Link>
          ) : (
            <p className="m-0 mt-2 text-sm font-bold text-[#71717b]">{part.video_resource?.title || 'Video resource attached'}</p>
          )}
        </div>
      )}

      <RichTextBlock body={part.statement_body} empty="No enonce is available for this part yet." />
      {part.written_solution_body && (
        <div className="mt-5">
          <h4 className="m-0 text-base font-black text-[#27272a]">Written correction</h4>
          <RichTextBlock body={part.written_solution_body} empty="" />
        </div>
      )}
    </article>
  )
}

function RichTextBlock({ body, empty }: { body: string; empty: string }) {
  return <div className="mt-4 whitespace-pre-wrap rounded-[14px] bg-[#fafafa] p-5 text-[15px] font-semibold leading-7 text-[#3f3f46]">{body?.trim() || empty}</div>
}

function lockedExamReason(reason?: string) {
  if (reason === 'pro_required') return 'Pro required'
  if (reason === 'vip_required') return 'VIP required'
  if (reason === 'subject_access_required') return 'Subject locked'
  if (reason?.startsWith('feature_required:')) return 'Feature locked'
  return 'Locked'
}

function lockMetadata(item: Pick<Exam | ExamProblem, 'required_tier' | 'required_feature_key' | 'required_subject_id'>) {
  if (item.required_tier) return `${item.required_tier.toUpperCase()} tier`
  if (item.required_feature_key) return item.required_feature_key.replace(/_/g, ' ')
  if (item.required_subject_id) return `subject access #${item.required_subject_id}`
  return ''
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
