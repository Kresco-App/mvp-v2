import useSWR, { mutate } from 'swr'
import { apiSWRFetcher } from '@/lib/apiData'
import { postJson } from '@/lib/apiClient'
import type { AccessGuarded } from '@/lib/topicWorkspaceTypes'

export type CourseTopicCard = AccessGuarded & {
  id: number
  subject_id?: number
  subject_title: string
  slug: string
  title: string
  description: string
  is_free_preview: boolean
  item_count: number
  completed_count: number
  progress_pct: number
  concepts: string[]
}

export type ExamProblem = AccessGuarded & {
  id: number
  topic_id?: number | null
  title: string
  statement: string
  written_solution: string
  written_solution_url: string
  difficulty: string
  concept_slugs: string[]
  video_resource?: { id: number; title: string; provider: string; provider_resource_id: string } | null
  progress_status?: string
  saved?: boolean
}

export type ExamProblemPart = AccessGuarded & {
  id: number
  exam_problem_id: number
  topic_id?: number | null
  video_resource_id?: number | null
  part_label: string
  title: string
  statement_body: string
  written_solution_body: string
  written_solution_url: string
  correction_video_url: string
  order: number
  difficulty: string
  concept_slugs: string[]
  metadata_json: Record<string, unknown>
  video_resource?: { id: number; title: string; provider: string; provider_resource_id: string; url?: string } | null
}

export type ExamProblemDetail = ExamProblem & {
  exam_title: string
  subject_title: string
  year: number
  session: string
  created_at?: string | null
  parts: ExamProblemPart[]
}

export type Exam = AccessGuarded & {
  id: number
  subject_id: number
  subject_title: string
  title: string
  year: number
  session: string
  statement_url: string
  problems: ExamProblem[]
}

export type ExamBankFilters = {
  progressStatus?: 'not_started' | 'opened' | 'completed' | ''
  saved?: boolean
}

export type ExamBankListResponse = {
  subject_id?: number | null
  topic_id?: number | null
  items: Exam[]
  total: number
}

export type CourseSubject = {
  id: number
  title: string
  description?: string
  chapter_count?: number
  lesson_count?: number
}

export type CourseSubjectDetail = CourseSubject & {
  thumbnail_url?: string
}

export type CourseSubjectTopic = AccessGuarded & {
  id: number
  title: string
  description: string
  item_count: number
  completed_count: number
  progress_pct: number
}

export type AdminSubject = CourseSubject

export const COURSE_TOPICS_KEY = '/courses/topics'
export const ADMIN_SUBJECTS_KEY = '/courses/subjects'

export function examBankSWRKey(query: string, filters: ExamBankFilters = {}) {
  const params = new URLSearchParams()
  const trimmedQuery = query.trim()
  if (trimmedQuery) params.set('q', trimmedQuery)
  if (filters.progressStatus) params.set('progress_status', filters.progressStatus)
  if (filters.saved === true) params.set('saved', 'true')
  if (filters.saved === false) params.set('saved', 'false')
  const queryString = params.toString()
  return `/exam-bank${queryString ? `?${queryString}` : ''}`
}

export function useCourseTopicsData() {
  const query = useSWR<CourseTopicCard[]>(COURSE_TOPICS_KEY, apiSWRFetcher)
  const topics = Array.isArray(query.data) ? query.data : []

  return {
    topics,
    loading: query.isLoading && !query.data,
    error: query.error ?? null,
    isValidating: query.isValidating,
    retry: query.mutate,
  }
}

export function useExamBankData(searchQuery: string, filters: ExamBankFilters = {}) {
  const query = useSWR<ExamBankListResponse | Exam[]>(examBankSWRKey(searchQuery, filters), apiSWRFetcher, {
    keepPreviousData: true,
  })
  const exams = Array.isArray(query.data) ? query.data : Array.isArray(query.data?.items) ? query.data.items : []

  return {
    exams,
    loading: query.isLoading && !query.data,
    error: query.error ?? null,
    isValidating: query.isValidating,
    retry: query.mutate,
  }
}

export function courseSubjectDetailSWRKey(subjectId: string | number | null | undefined) {
  const normalized = normalizeSubjectId(subjectId)
  return normalized ? `/courses/subjects/${encodeURIComponent(normalized)}` : null
}

export function courseSubjectTopicsSWRKey(subjectId: string | number | null | undefined) {
  const normalized = normalizeSubjectId(subjectId)
  return normalized ? `/courses/subjects/${encodeURIComponent(normalized)}/topics` : null
}

export function useCourseSubjectDetailData(subjectId: string | number | null | undefined) {
  const subjectQuery = useSWR<CourseSubjectDetail>(courseSubjectDetailSWRKey(subjectId), apiSWRFetcher, {
    keepPreviousData: true,
  })
  const topicsQuery = useSWR<CourseSubjectTopic[]>(courseSubjectTopicsSWRKey(subjectId), apiSWRFetcher, {
    keepPreviousData: true,
  })
  const subject = subjectQuery.data ?? null
  const topics = Array.isArray(topicsQuery.data) ? topicsQuery.data : []
  const loading = (subjectQuery.isLoading && !subjectQuery.data) || (topicsQuery.isLoading && !topicsQuery.data)

  return {
    subject,
    topics,
    loading,
    error: subjectQuery.error ?? topicsQuery.error ?? null,
    isValidating: subjectQuery.isValidating || topicsQuery.isValidating,
    retry: async () => {
      await Promise.all([subjectQuery.mutate(), topicsQuery.mutate()])
    },
  }
}

export function examProblemDetailSWRKey(problemId: number | null) {
  return problemId ? `/exam-bank/problems/${problemId}` : null
}

export function useExamProblemDetail(problemId: number | null) {
  const query = useSWR<ExamProblemDetail>(examProblemDetailSWRKey(problemId), apiSWRFetcher, {
    keepPreviousData: true,
  })
  const problem = query.data?.id === problemId ? query.data : null

  return {
    problem,
    loading: query.isLoading && !problem,
    error: query.error ?? null,
    retry: query.mutate,
  }
}

export type ExamProblemProgress = {
  exam_problem_id: number
  status: string
  saved: boolean
  opened_at: string | null
  completed_at: string | null
  last_activity_at: string | null
}

export async function recordExamProblemProgress(
  problemId: number,
  body: { status?: 'opened' | 'completed'; saved?: boolean },
) {
  const progress = await postJson<ExamProblemProgress, typeof body>(`/exam-bank/problems/${problemId}/progress`, body)
  await refreshExamProblemProgressCaches(progress)
  return progress
}

async function refreshExamProblemProgressCaches(progress: ExamProblemProgress) {
  await Promise.all([
    mutate(
      isExamBankListCacheKey,
      (current: ExamBankListResponse | Exam[] | undefined) => mergeExamProblemProgressIntoListCache(current, progress),
      { revalidate: false },
    ),
    mutate(
      `/exam-bank/problems/${progress.exam_problem_id}`,
      (current: ExamProblemDetail | undefined) => mergeExamProblemProgressIntoDetail(current, progress),
      { revalidate: false },
    ),
  ])
}

function mergeExamProblemProgressIntoListCache(
  current: ExamBankListResponse | Exam[] | undefined,
  progress: ExamProblemProgress,
) {
  if (!current) return current
  if (Array.isArray(current)) return mergeExamProblemProgressIntoExams(current, progress)
  if (!Array.isArray(current.items)) return current

  const items = mergeExamProblemProgressIntoExams(current.items, progress)
  if (items === current.items) return current

  return {
    ...current,
    items,
  }
}

function mergeExamProblemProgressIntoExams(exams: Exam[], progress: ExamProblemProgress) {
  let changed = false
  const nextExams = exams.map((exam) => {
    const problems = mergeExamProblemProgressIntoProblems(exam.problems, progress)
    if (problems !== exam.problems) changed = true
    return problems === exam.problems ? exam : { ...exam, problems }
  })

  return changed ? nextExams : exams
}

function mergeExamProblemProgressIntoProblems(problems: ExamProblem[], progress: ExamProblemProgress) {
  let changed = false
  const nextProblems = problems.map((problem) => {
    if (problem.id !== progress.exam_problem_id) return problem
    changed = true
    return {
      ...problem,
      progress_status: progress.status,
      saved: progress.saved,
    }
  })

  return changed ? nextProblems : problems
}

function mergeExamProblemProgressIntoDetail(
  current: ExamProblemDetail | undefined,
  progress: ExamProblemProgress,
) {
  if (!current || current.id !== progress.exam_problem_id) return current
  return {
    ...current,
    progress_status: progress.status,
    saved: progress.saved,
  }
}

function isExamBankListCacheKey(key: unknown) {
  return typeof key === 'string' && (key === '/exam-bank' || key.startsWith('/exam-bank?'))
}

export function useAdminSubjectsData() {
  const query = useSWR<CourseSubject[]>(ADMIN_SUBJECTS_KEY, apiSWRFetcher)
  const subjects = Array.isArray(query.data) ? query.data : []

  return {
    subjects,
    loading: query.isLoading && !query.data,
    error: query.error ?? null,
    isValidating: query.isValidating,
    retry: query.mutate,
  }
}

export const useCourseSubjectsData = useAdminSubjectsData

function normalizeSubjectId(subjectId: string | number | null | undefined) {
  if (subjectId == null) return ''
  return String(subjectId).trim()
}
