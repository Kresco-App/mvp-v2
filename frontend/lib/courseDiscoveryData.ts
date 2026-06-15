import useSWR from 'swr'
import { apiSWRFetcher } from '@/lib/apiData'
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
