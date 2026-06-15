import useSWR from 'swr'
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

export type AdminSubject = {
  id: number
  title: string
  description?: string
  chapter_count?: number
  lesson_count?: number
}

export const COURSE_TOPICS_KEY = '/courses/topics'
export const ADMIN_SUBJECTS_KEY = '/courses/subjects'

export function examBankSWRKey(query: string) {
  const params = new URLSearchParams()
  const trimmedQuery = query.trim()
  if (trimmedQuery) params.set('q', trimmedQuery)
  const queryString = params.toString()
  return `/courses/exam-bank${queryString ? `?${queryString}` : ''}`
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

export function useExamBankData(searchQuery: string) {
  const query = useSWR<Exam[]>(examBankSWRKey(searchQuery), apiSWRFetcher, {
    keepPreviousData: true,
  })
  const exams = Array.isArray(query.data) ? query.data : []

  return {
    exams,
    loading: query.isLoading || query.isValidating,
    error: query.error ?? null,
    isValidating: query.isValidating,
    retry: query.mutate,
  }
}

export function useExamProblemDetail(problemId: number | null, requestVersion = 0) {
  const key = problemId ? [`/exam-bank/problems/${problemId}`, requestVersion] as const : null
  const query = useSWR<ExamProblemDetail>(key, ([url]) => apiSWRFetcher(url))
  const problem = !query.isValidating && query.data?.id === problemId ? query.data : null

  return {
    problem,
    loading: query.isLoading || query.isValidating,
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
  return postJson<ExamProblemProgress, typeof body>(`/exam-bank/problems/${problemId}/progress`, body)
}

export function useAdminSubjectsData() {
  const query = useSWR<AdminSubject[]>(ADMIN_SUBJECTS_KEY, apiSWRFetcher)
  const subjects = Array.isArray(query.data) ? query.data : []

  return {
    subjects,
    loading: query.isLoading && !query.data,
    error: query.error ?? null,
    isValidating: query.isValidating,
    retry: query.mutate,
  }
}
