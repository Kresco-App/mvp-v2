'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import {
  Bookmark,
  Check,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Lock,
  MessageSquare,
  NotebookPen,
  PlayCircle,
  RotateCcw,
  Video,
} from 'lucide-react'
import { apiDataErrorMessage, apiSWRFetcher } from '@/lib/apiData'
import { hasSuccessfulSWRCacheData } from '@/lib/swrCache'
import {
  examProblemDetailSWRKey,
  recordExamProblemProgress,
  useExamBankData,
  useExamProblemDetail,
  type Exam,
  type ExamProblem,
  type ExamProblemDetail,
  type ExamProblemPart,
} from '@/lib/courseDiscoveryData'
import {
  LessonBody,
  VideoFrameState,
  VideoLearningWorkspace,
  VideoPlayerFrame,
} from '@/components/figma/workspace'
import type {
  FigmaRailItem,
  FigmaRailSection,
  FigmaTabItem,
} from '@/components/figma/types'
import { FigmaVideoWorkspaceSkeleton } from '@/components/figma/skeletons'
import { sanitizeNavigationUrl } from '@/lib/urlSafety'

type ExamWorkspaceTabId = 'written' | 'solutions' | 'resources' | 'notes' | 'comments'
type ExamNoteDraftState = { problemId: number | null; value: string }
type PendingExamNoteDraftWrite = { problemId: number; value: string }

const examWorkspaceTabMeta: Array<{ id: ExamWorkspaceTabId; label: string; icon: FigmaTabItem['icon'] }> = [
  { id: 'written', label: 'Written', icon: FileText },
  { id: 'solutions', label: 'Solutions', icon: ClipboardCheck },
  { id: 'resources', label: 'Resources', icon: Video },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'comments', label: 'Comments', icon: MessageSquare },
]

const pendingExamNoteDraftWrites = new Map<number, PendingExamNoteDraftWrite>()
let examNoteDraftFlushHandle: number | null = null
let examNoteDraftFlushMode: 'idle' | 'timeout' | null = null
let examNoteDraftPagehideListenerAttached = false

export default function ExamWorkspacePage() {
  const params = useParams<{ examId?: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { cache: swrCache, mutate: mutateSWRCache } = useSWRConfig()
  const examId = numberParam(params.examId)
  const routeProblemId = numberParam(searchParams.get('problem'))
  const { exams, loading, error, isValidating, retry: retryExamList } = useExamBankData('', {})
  const exam = useMemo(() => exams.find((item) => item.id === examId) ?? null, [examId, exams])
  const fallbackProblemId = firstProblemId(exam)
  const [selectedProblemId, setSelectedProblemId] = useState<number | null>(routeProblemId ?? fallbackProblemId)
  const [activeTabId, setActiveTabId] = useState<ExamWorkspaceTabId>('written')
  const [progressMutating, setProgressMutating] = useState(false)
  const [noteDraftState, setNoteDraftState] = useState<ExamNoteDraftState>({ problemId: null, value: '' })
  const noteDraft = noteDraftState.problemId === selectedProblemId
    ? noteDraftState.value
    : ''
  const openedProgressRef = useRef<Set<number> | null>(null)
  if (openedProgressRef.current === null) {
    openedProgressRef.current = new Set<number>()
  }
  const preloadedProblemDetailKeysRef = useRef<Set<string> | null>(null)
  if (preloadedProblemDetailKeysRef.current === null) {
    preloadedProblemDetailKeysRef.current = new Set<string>()
  }
  const noteDraftCacheRef = useRef<Map<number, string> | null>(null)
  if (noteDraftCacheRef.current === null) {
    noteDraftCacheRef.current = new Map<number, string>()
  }
  const lastErrorToastRef = useRef('')
  const detail = useExamProblemDetail(selectedProblemId)

  useEffect(() => {
    if (routeProblemId && routeProblemId !== selectedProblemId) {
      setSelectedProblemId(routeProblemId)
    }
  }, [routeProblemId, selectedProblemId])

  useEffect(() => {
    return () => {
      flushPendingExamNoteDraftWrites()
    }
  }, [])

  useEffect(() => {
    if (!selectedProblemId) {
      setNoteDraftState((current) => (
        current.problemId === null && current.value === ''
          ? current
          : { problemId: null, value: '' }
      ))
      return
    }

    setNoteDraftState((current) => (
      current.problemId === selectedProblemId
        ? current
        : { problemId: selectedProblemId, value: cachedExamNoteDraft(selectedProblemId, noteDraftCacheRef.current) }
    ))
  }, [selectedProblemId])

  useEffect(() => {
    if (selectedProblemId || !fallbackProblemId) return
    setSelectedProblemId(fallbackProblemId)
    router.replace(`${pathname}?problem=${fallbackProblemId}`, { scroll: false })
  }, [fallbackProblemId, pathname, router, selectedProblemId])

  useEffect(() => {
    const activeError = error || detail.error
    if (!activeError) {
      lastErrorToastRef.current = ''
      return
    }
    const message = apiDataErrorMessage(activeError, 'Could not load this exam workspace.')
    if (message === lastErrorToastRef.current) return
    lastErrorToastRef.current = message
    showToastError(message)
  }, [detail.error, error])

  const updateProblemProgress = useCallback(async (
    problem: ExamProblemDetail,
    body: { status?: 'opened' | 'completed'; saved?: boolean },
    options: { silent?: boolean } = {},
  ) => {
    setProgressMutating(true)
    try {
      const progress = await recordExamProblemProgress(problem.id, body)
      await detail.retry({
        ...problem,
        progress_status: progress.status,
        saved: progress.saved,
      }, { revalidate: false })
      if (!options.silent) showToastSuccess('Progress saved')
    } catch (progressError) {
      if (!options.silent) showToastError(apiDataErrorMessage(progressError, 'Could not save exam progress.'))
    } finally {
      setProgressMutating(false)
    }
  }, [detail])

  useEffect(() => {
    const problem = detail.problem
    const openedProgress = openedProgressRef.current ?? (openedProgressRef.current = new Set<number>())
    if (!problem || problem.can_access === false || openedProgress.has(problem.id)) return
    if (problem.progress_status === 'opened' || problem.progress_status === 'completed') return
    openedProgress.add(problem.id)
    void updateProblemProgress(problem, { status: 'opened' }, { silent: true })
  }, [detail.problem, updateProblemProgress])

  function selectProblem(problemId: number | string | undefined) {
    const parsed = typeof problemId === 'number' ? problemId : numberParam(String(problemId ?? ''))
    if (!parsed) return
    setSelectedProblemId(parsed)
    router.replace(`${pathname}?problem=${parsed}`, { scroll: false })
  }

  function preloadProblem(problemId: number | string | undefined) {
    const parsed = typeof problemId === 'number' ? problemId : numberParam(String(problemId ?? ''))
    if (!parsed || parsed === selectedProblemId) return
    const preloadKey = examProblemDetailSWRKey(parsed)
    if (preloadKey && hasSuccessfulSWRCacheData(preloadKey, swrCache)) return
    if (!preloadKey || preloadedProblemDetailKeysRef.current?.has(preloadKey)) return

    preloadedProblemDetailKeysRef.current?.add(preloadKey)
    const request = apiSWRFetcher<ExamProblemDetail>(preloadKey)
    void request.catch(() => {
      preloadedProblemDetailKeysRef.current?.delete(preloadKey)
    })
    void mutateSWRCache(preloadKey, request, {
      populateCache: true,
      revalidate: false,
    })
  }

  function updateNote(value: string) {
    setNoteDraftState({ problemId: selectedProblemId, value })
    if (selectedProblemId) {
      noteDraftCacheRef.current?.set(selectedProblemId, value)
      writeExamNoteDraft(selectedProblemId, value)
    }
  }

  if (loading && !exam) return <FigmaVideoWorkspaceSkeleton />

  if (!exam) {
    return (
      <main className="grid min-h-[520px] place-items-center py-12">
        <section className="w-full max-w-[520px] rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6 text-center">
          <p className="m-0 text-[12px] font-black uppercase tracking-[0.12em] text-[#f5900b]">Exam unavailable</p>
          <h1 className="m-0 mt-2 text-[28px] font-black leading-tight text-[#27272a]">This exam workspace could not be loaded.</h1>
          <p className="m-0 mt-3 text-[14px] font-bold leading-6 text-[#71717b]">
            {error ? apiDataErrorMessage(error, 'Retry the request or return to the Exam Bank.') : 'Return to the Exam Bank and choose another exam.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void retryExamList()}
              className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#5b60f9] px-5 text-sm font-black text-white"
            >
              <RotateCcw size={15} />
              Retry
            </button>
            <Link href="/exam-bank" className="inline-flex h-11 items-center rounded-[12px] border border-[#e4e4e7] bg-white px-5 text-sm font-black text-[#52525c] no-underline">
              Back to Exam Bank
            </Link>
          </div>
        </section>
      </main>
    )
  }

  if (detail.loading && !detail.problem) return <FigmaVideoWorkspaceSkeleton />

  const activeSummary = exam.problems.find((problem) => problem.id === selectedProblemId) ?? null
  const activeProblem = detail.problem ?? problemDetailFromSummary(exam, activeSummary)
  const stats = examProgressStats(exam, detail.problem)
  const railSections = buildProblemRailSections(exam, selectedProblemId, detail.problem)
  const tabs = examWorkspaceTabMeta.map((tab) => ({ ...tab, active: tab.id === activeTabId }))
  const title = activeProblem ? `${exam.subject_title}: ${activeProblem.title}` : `${exam.subject_title}: Exam workspace`

  return (
    <VideoLearningWorkspace
      breadcrumb={`${exam.subject_title} / ${exam.year} / ${examSessionLabel(exam.session)}`}
      title={title}
      primaryContent={<ExamProblemVideoFrame problem={activeProblem} />}
      tabs={tabs}
      onTabSelect={(tab) => setActiveTabId(tab.id as ExamWorkspaceTabId)}
      rail={{
        heading: 'Exam problems',
        completed: stats.completed,
        total: stats.total,
        value: stats.value,
        sections: railSections,
        onItemPreload: (item) => preloadProblem(item.id),
        onItemSelect: (item) => selectProblem(item.id),
      }}
    >
      <LessonBody>
        <div className="grid gap-[24px]">
          {isValidating && (
            <p className="m-0 rounded-[14px] border border-[#e4e4e7] bg-[#fafafa] px-4 py-3 text-[13px] font-bold text-[#71717b]">
              Refreshing exam workspace...
            </p>
          )}
          <div key={`${activeProblem?.id ?? 'empty'}-${activeTabId}`}>
            <ExamWorkspaceTabPanel
              activeTabId={activeTabId}
              exam={exam}
              problem={activeProblem}
              noteDraft={noteDraft}
              onNoteChange={updateNote}
            />
          </div>
          {activeProblem && activeProblem.can_access !== false && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#f4f4f5] pt-4">
              {activeProblem.progress_status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => updateProblemProgress(activeProblem, { status: 'completed' })}
                  disabled={progressMutating}
                  className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#3a2fd3] px-4 text-[13px] font-black text-white transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-[#2f27b8] active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100"
                >
                  <Check size={15} />
                  Mark problem complete
                </button>
              )}
              <button
                type="button"
                onClick={() => updateProblemProgress(activeProblem, { saved: !activeProblem.saved })}
                disabled={progressMutating}
                aria-pressed={activeProblem.saved}
                className={`inline-flex h-10 items-center gap-2 rounded-[12px] border px-4 text-[13px] font-black transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out active:scale-[0.96] disabled:opacity-60 disabled:active:scale-100 ${activeProblem.saved ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]' : 'border-[#e4e4e7] bg-white text-[#52525c] hover:border-[#cfd2dc] hover:bg-[#f8f9fc] hover:text-[#3f3f46]'}`}
              >
                <Bookmark size={14} fill={activeProblem.saved ? 'currentColor' : 'none'} />
                {activeProblem.saved ? 'Saved' : 'Save problem'}
              </button>
            </div>
          )}
        </div>
      </LessonBody>
    </VideoLearningWorkspace>
  )
}

function ExamProblemVideoFrame({ problem }: { problem: ExamProblemDetail | null }) {
  if (!problem) {
    return (
      <VideoFrameState
        eyebrow="Problem correction"
        title="Choose a problem"
        message="Select a problem from the exam rail to load its correction video and written work."
      />
    )
  }

  if (problem.can_access === false) {
    return (
      <VideoFrameState
        eyebrow="Problem correction"
        title="Problem locked"
        message="Unlock this subject to watch the correction and read the written solution."
        variant="locked"
      />
    )
  }

  const videoSource = problemVideoSource(problem)
  if (videoSource?.youtubeId) return <VideoPlayerFrame videoId={videoSource.youtubeId} />
  if (videoSource?.url) {
    return (
      <div className="kresco-enter relative aspect-[1057/596] w-full max-w-[1057px] overflow-hidden rounded-[17.617px] border-[2.239px] border-[#e4e4e7] bg-[#f4f4f5] shadow-none transition-[box-shadow] duration-150 ease-out hover:shadow-[0_18px_40px_rgba(24,24,27,0.08)] motion-reduce:transition-none" data-exam-video-frame>
        <iframe
          title="Exam problem correction video"
          src={videoSource.url}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-presentation allow-popups"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    )
  }

  return (
    <VideoFrameState
      eyebrow="Problem correction"
      title="Video not ready"
      message="The written problem and solution tabs stay available while this correction video is being prepared."
    />
  )
}

function ExamWorkspaceTabPanel({
  activeTabId,
  exam,
  problem,
  noteDraft,
  onNoteChange,
}: {
  activeTabId: ExamWorkspaceTabId
  exam: Exam
  problem: ExamProblemDetail | null
  noteDraft: string
  onNoteChange: (value: string) => void
}) {
  if (!problem) {
    return <EmptyPanel title="No problem selected" copy="Choose a problem from the exam rail to start." />
  }

  if (problem.can_access === false) {
    return (
      <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#fff7ed] text-[#f97316]">
            <Lock size={20} />
          </div>
          <div>
            <p className="m-0 text-sm font-black text-[#71717b]">{problem.subject_title} - {problem.year} - {problem.session}</p>
            <h2 className="m-0 mt-2 text-[28px] font-black leading-tight text-[#27272a]">{problem.title}</h2>
            <p className="m-0 mt-2 text-sm font-bold text-[#71717b]">Unlock this subject to access the problem statement, written correction, and video correction.</p>
          </div>
        </div>
        <Link href="/pricing" className="mt-6 inline-flex h-11 items-center rounded-[12px] bg-[#5b60f9] px-5 text-sm font-black text-white no-underline">
          View unlock options
        </Link>
      </section>
    )
  }

  if (activeTabId === 'solutions') return <SolutionsPanel problem={problem} />
  if (activeTabId === 'resources') return <ResourcesPanel exam={exam} problem={problem} />
  if (activeTabId === 'notes') return <NotesPanel value={noteDraft} onChange={onNoteChange} />
  if (activeTabId === 'comments') {
    return (
      <EmptyPanel
        title="Comments and reviews"
        copy="Professor comments and peer reviews will live here. For now, use Notes to keep your own attempt review."
      />
    )
  }

  return <WrittenPanel problem={problem} />
}

function WrittenPanel({ problem }: { problem: ExamProblemDetail }) {
  return (
    <section className="grid gap-5">
      <ContentBlock title={problem.title} body={problem.statement} empty="No main problem statement is available yet." />
      {problem.parts.length > 0 && (
        <div className="grid gap-4">
          <h3 className="m-0 text-[18px] font-black text-[#27272a]">Problem parts</h3>
          {problem.parts.map((part) => (
            <PartStatement key={part.id} part={part} />
          ))}
        </div>
      )}
    </section>
  )
}

function SolutionsPanel({ problem }: { problem: ExamProblemDetail }) {
  return (
    <section className="grid gap-5">
      <ContentBlock title="Main written correction" body={problem.written_solution} empty="No main written correction is available yet." />
      {problem.parts.length > 0 && (
        <div className="grid gap-4">
          <h3 className="m-0 text-[18px] font-black text-[#27272a]">Part corrections</h3>
          {problem.parts.map((part) => (
            <PartSolution key={part.id} part={part} />
          ))}
        </div>
      )}
    </section>
  )
}

function ResourcesPanel({ exam, problem }: { exam: Exam; problem: ExamProblemDetail }) {
  const resources = problemResources(exam, problem)

  if (resources.length === 0) {
    return <EmptyPanel title="Resources" copy="No additional resources are attached to this problem yet." />
  }

  return (
    <section className="grid gap-3">
      {resources.map((resource) => (
        <a
          key={`${resource.href}-${resource.label}`}
          href={resource.href}
          target={resource.href.startsWith('/') ? undefined : '_blank'}
          rel={resource.href.startsWith('/') ? undefined : 'noopener noreferrer'}
          className="flex min-h-[58px] items-center justify-between gap-4 rounded-[14px] border border-[#e4e4e7] bg-white px-4 py-3 text-[#3f3f46] no-underline transition-[background-color,border-color,transform] duration-150 ease-out hover:border-[#d8ddff] hover:bg-[#fbfbff] active:scale-[0.96]"
        >
          <span className="grid gap-1">
            <strong className="text-[14px] font-black leading-[1.1]">{resource.label}</strong>
            <span className="text-[12px] font-bold text-[#9f9fa9]">{resource.copy}</span>
          </span>
          <ExternalLink size={16} className="shrink-0 text-[#71717b]" />
        </a>
      ))}
    </section>
  )
}

function NotesPanel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <section className="grid gap-3">
      <label className="grid gap-2">
        <span className="text-[14px] font-black text-[#3f3f46]">Your attempt notes</span>
        <textarea
          aria-label="Exam problem notes"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[180px] w-full resize-y rounded-[16px] border-2 border-[#e4e4e7] bg-white px-4 py-3 text-[14px] font-semibold leading-6 text-[#3f3f46] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#a1a1aa] focus:border-[#d8ddff] focus:ring-4 focus:ring-[#f4f5ff]"
          placeholder="Write your attempt, mistakes, questions, and what to revisit before watching the correction."
        />
      </label>
      <p className="m-0 text-[12px] font-bold text-[#9f9fa9]">Saved locally on this device for this problem.</p>
    </section>
  )
}

function PartStatement({ part }: { part: ExamProblemPart }) {
  if (part.can_access === false) return <LockedPart part={part} copy="Unlock this subject to access this part statement." />
  return <ContentBlock title={partLabel(part)} body={part.statement_body} empty="No statement is available for this part yet." />
}

function PartSolution({ part }: { part: ExamProblemPart }) {
  if (part.can_access === false) return <LockedPart part={part} copy="Unlock this subject to access this part correction." />
  const videoUrl = sanitizeNavigationUrl(part.correction_video_url || part.video_resource?.url, { allowRelative: false })

  return (
    <article className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.16px] text-[#f97316]">{part.part_label || `Part ${part.order}`}</p>
          <h4 className="m-0 mt-1 text-[18px] font-black text-[#27272a]">{part.title || partLabel(part)}</h4>
        </div>
        {videoUrl && (
          <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-[#eef2ff] px-3 text-[12px] font-black text-[#3a2fd3] no-underline transition-[background-color,transform] duration-150 ease-out hover:bg-[#e0e7ff] active:scale-[0.96]">
            <PlayCircle size={14} />
            Video
          </a>
        )}
      </div>
      <RichTextBlock body={part.written_solution_body} empty="No written correction is available for this part yet." />
    </article>
  )
}

function LockedPart({ part, copy }: { part: ExamProblemPart; copy: string }) {
  return (
    <article className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#fff7ed] text-[#f97316]">
          <Lock size={18} />
        </div>
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.16px] text-[#f97316]">{part.part_label || `Part ${part.order}`}</p>
          <h4 className="m-0 mt-1 text-[18px] font-black text-[#27272a]">{part.title || partLabel(part)}</h4>
          <p className="m-0 mt-2 text-sm font-bold text-[#71717b]">{copy}</p>
        </div>
      </div>
    </article>
  )
}

function ContentBlock({ title, body, empty }: { title: string; body: string; empty: string }) {
  return (
    <article className="rounded-[18px] border-2 border-[#e4e4e7] bg-white p-5">
      <h3 className="m-0 text-[18px] font-black text-[#27272a]">{title}</h3>
      <RichTextBlock body={body} empty={empty} />
    </article>
  )
}

function RichTextBlock({ body, empty }: { body: string; empty: string }) {
  return <div className="mt-4 whitespace-pre-wrap rounded-[14px] bg-[#fafafa] p-5 text-[15px] font-semibold leading-7 text-[#3f3f46]">{body?.trim() || empty}</div>
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="rounded-[18px] border-2 border-dashed border-[#e4e4e7] bg-white p-6 text-center">
      <h3 className="m-0 text-[18px] font-black text-[#27272a]">{title}</h3>
      <p className="m-0 mt-2 text-[14px] font-bold leading-6 text-[#71717b]">{copy}</p>
    </section>
  )
}

function buildProblemRailSections(exam: Exam, selectedProblemId: number | null, activeProblem: ExamProblemDetail | null): FigmaRailSection[] {
  return [
    {
      id: 'problems',
      title: 'Problems',
      copy: `${exam.year} - ${examSessionLabel(exam.session)}`,
      open: true,
      items: exam.problems.map((problem, index) => problemRailItem(problem, index, selectedProblemId, activeProblem)),
    },
  ]
}

function problemRailItem(
  problem: ExamProblem,
  index: number,
  selectedProblemId: number | null,
  activeProblem: ExamProblemDetail | null,
): FigmaRailItem {
  const activeStatus = activeProblem?.id === problem.id ? activeProblem.progress_status : problem.progress_status
  return {
    id: problem.id,
    label: problem.title || `Problem ${index + 1}`,
    active: problem.id === selectedProblemId,
    completed: activeStatus === 'completed',
    disabled: problem.can_access === false,
    meta: activeStatus === 'completed' ? 'Completed' : activeStatus === 'opened' ? 'Opened' : 'Not started',
  }
}

function examProgressStats(exam: Exam, activeProblem: ExamProblemDetail | null) {
  const statuses = exam.problems.map((problem) => (
    activeProblem?.id === problem.id ? activeProblem.progress_status : problem.progress_status
  ))
  const completed = statuses.filter((status) => status === 'completed').length
  const total = Math.max(0, exam.problems.length)
  return {
    completed,
    total,
    value: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

function firstProblemId(exam: Exam | null) {
  if (!exam) return null
  return exam.problems.find((problem) => problem.can_access !== false)?.id ?? exam.problems[0]?.id ?? null
}

function problemDetailFromSummary(exam: Exam, problem: ExamProblem | null): ExamProblemDetail | null {
  if (!problem) return null
  return {
    ...problem,
    exam_title: exam.title,
    subject_title: exam.subject_title,
    year: exam.year,
    session: exam.session,
    parts: [],
  }
}

function problemVideoSource(problem: ExamProblemDetail): { youtubeId?: string; url?: string } | null {
  const resource = problem.video_resource as ({ provider?: string; provider_resource_id?: string; url?: string } | null | undefined)
  if (resource?.provider?.toLowerCase().includes('youtube') && resource.provider_resource_id) {
    return { youtubeId: resource.provider_resource_id }
  }
  const resourceUrl = sanitizeEmbedUrl(resource?.url)
  if (resourceUrl) return { url: resourceUrl }

  for (const part of problem.parts) {
    const correctionVideoUrl = sanitizeEmbedUrl(part.correction_video_url)
    if (correctionVideoUrl) return { url: correctionVideoUrl }
    const partVideoResourceUrl = sanitizeEmbedUrl(part.video_resource?.url)
    if (partVideoResourceUrl) return { url: partVideoResourceUrl }
    if (part.video_resource?.provider?.toLowerCase().includes('youtube') && part.video_resource.provider_resource_id) {
      return { youtubeId: part.video_resource.provider_resource_id }
    }
  }

  return null
}

function sanitizeEmbedUrl(value?: string | null) {
  const safeUrl = sanitizeNavigationUrl(value, { allowRelative: false })
  if (!safeUrl) return ''
  try {
    const url = new URL(safeUrl)
    const host = url.hostname.toLowerCase()
    const allowedHosts = new Set([
      'player.vdocipher.com',
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
      'player.vimeo.com',
    ])
    return allowedHosts.has(host) ? url.toString() : ''
  } catch {
    return ''
  }
}

function problemResources(exam: Exam, problem: ExamProblemDetail) {
  const resources: Array<{ label: string; copy: string; href: string }> = []
  const statementUrl = sanitizeNavigationUrl(exam.statement_url)
  const writtenSolutionUrl = sanitizeNavigationUrl(problem.written_solution_url)
  if (statementUrl) resources.push({ label: 'Exam statement', copy: `${exam.subject_title} ${exam.year}`, href: statementUrl })
  if (writtenSolutionUrl) resources.push({ label: 'Written solution file', copy: problem.title, href: writtenSolutionUrl })
  if (problem.topic_id) resources.push({ label: 'Related course topic', copy: 'Open the linked lesson workspace', href: `/topics/${problem.topic_id}` })
  const video = problemVideoSource(problem)
  if (video?.url) resources.push({ label: 'Correction video', copy: 'Open attached correction video', href: video.url })
  return resources
}

function partLabel(part: ExamProblemPart) {
  return part.part_label || part.title || `Part ${part.order}`
}

function examSessionLabel(session: string) {
  const normalized = session.toLowerCase()
  if (normalized.includes('rattrap') || normalized.includes('retake')) return 'Rattrapage'
  if (normalized.includes('normal') || normalized.includes('main') || normalized.includes('regular')) return 'Session normale'
  return session || 'Session'
}

function examNoteStorageKey(problemId: number) {
  return `kresco:exam-problem-note:v1:${problemId}`
}

function legacyExamNoteStorageKey(problemId: number) {
  return `kresco-exam-problem-note:${problemId}`
}

function readExamNoteDraft(problemId: number) {
  const pendingWrite = pendingExamNoteDraftWrites.get(problemId)
  if (pendingWrite) return pendingWrite.value
  if (typeof window === 'undefined') return ''

  try {
    const current = window.localStorage.getItem(examNoteStorageKey(problemId))
    if (current !== null) return current

    const legacy = window.localStorage.getItem(legacyExamNoteStorageKey(problemId))
    if (legacy !== null) {
      writeExamNoteDraft(problemId, legacy)
      return legacy
    }
  } catch {
    return ''
  }

  return ''
}

function cachedExamNoteDraft(problemId: number, cache: Map<number, string> | null) {
  if (cache?.has(problemId)) return cache.get(problemId) ?? ''
  const value = readExamNoteDraft(problemId)
  cache?.set(problemId, value)
  return value
}

function writeExamNoteDraft(problemId: number, value: string) {
  if (typeof window === 'undefined') return
  pendingExamNoteDraftWrites.set(problemId, { problemId, value })
  attachExamNoteDraftPagehideListener()
  scheduleExamNoteDraftFlush()
}

function flushPendingExamNoteDraftWrites() {
  if (typeof window === 'undefined') return
  if (examNoteDraftFlushHandle !== null) {
    if (examNoteDraftFlushMode === 'idle') {
      window.cancelIdleCallback?.(examNoteDraftFlushHandle)
    } else {
      window.clearTimeout(examNoteDraftFlushHandle)
    }
    examNoteDraftFlushHandle = null
    examNoteDraftFlushMode = null
  }

  if (pendingExamNoteDraftWrites.size === 0) return
  const writes = Array.from(pendingExamNoteDraftWrites.values())
  pendingExamNoteDraftWrites.clear()

  for (const write of writes) {
    writeExamNoteDraftNow(write.problemId, write.value)
  }
}

function scheduleExamNoteDraftFlush() {
  if (examNoteDraftFlushHandle !== null || typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    examNoteDraftFlushMode = 'idle'
    examNoteDraftFlushHandle = window.requestIdleCallback(() => {
      examNoteDraftFlushHandle = null
      examNoteDraftFlushMode = null
      flushPendingExamNoteDraftWrites()
    }, { timeout: 800 })
    return
  }

  examNoteDraftFlushMode = 'timeout'
  examNoteDraftFlushHandle = window.setTimeout(() => {
    examNoteDraftFlushHandle = null
    examNoteDraftFlushMode = null
    flushPendingExamNoteDraftWrites()
  }, 300)
}

function attachExamNoteDraftPagehideListener() {
  if (examNoteDraftPagehideListenerAttached || typeof window === 'undefined') return
  examNoteDraftPagehideListenerAttached = true
  window.addEventListener('pagehide', flushPendingExamNoteDraftWrites)
}

function writeExamNoteDraftNow(problemId: number, value: string) {
  try {
    window.localStorage.setItem(examNoteStorageKey(problemId), value)
    window.localStorage.removeItem(legacyExamNoteStorageKey(problemId))
  } catch {
    // Draft persistence is best-effort.
  }
}

function numberParam(value: string | string[] | null | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
