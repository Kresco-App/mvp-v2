import useSWR from 'swr'
import { getJson } from '@/lib/apiClient'

export type ExamQuestion = {
  id: number
  text: string
  order: number
  options: { id: number; text: string }[]
}

export type ExamQuiz = {
  id: number
  title: string
  pass_score: number
  questions: ExamQuestion[]
}

export type ExamResult = {
  score: number
  passed: boolean
  correct: number
  total: number
  pass_score: number
  xp_earned: number
}

export type ExamQuizDiscovery = {
  subjectId: string
  quiz: ExamQuiz | null
}

type ExamQuizDiscoveryResponse = {
  subjectId?: string | number
  subject_id?: string | number
  quiz?: ExamQuiz | null
}

export const NO_EXAM_QUIZ_MESSAGE = 'Aucun quiz disponible pour cette matiere.'

export function examQuizDiscoverySWRKey(subjectId: string | number | null | undefined) {
  const normalized = normalizeExamSubjectId(subjectId)
  return normalized ? ['exam-quiz-discovery', normalized] as const : null
}

export async function loadExamQuiz(subjectId: string | number): Promise<ExamQuizDiscovery> {
  const normalized = normalizeExamSubjectId(subjectId)
  if (!normalized) {
    throw new Error('Invalid subject id.')
  }

  const data = await getJson<ExamQuizDiscoveryResponse>(
    `/quizzes/subjects/${encodeURIComponent(normalized)}/discovery`,
  )
  const quiz = data?.quiz && Array.isArray(data.quiz.questions) && data.quiz.questions.length > 0
    ? data.quiz
    : null
  return {
    subjectId: normalizeExamSubjectId(data?.subjectId ?? data?.subject_id) ?? normalized,
    quiz,
  }
}

export function useExamQuizData(subjectId: string | number | null | undefined) {
  const normalized = normalizeExamSubjectId(subjectId)
  const key = examQuizDiscoverySWRKey(subjectId)
  const query = useSWR<ExamQuizDiscovery>(
    key,
    (keyArg: readonly ['exam-quiz-discovery', string]) => loadExamQuiz(keyArg[1]),
    { keepPreviousData: true },
  )
  const discovery = query.data?.subjectId === normalized ? query.data : null

  return {
    discovery,
    quiz: discovery?.quiz ?? null,
    noQuiz: Boolean(discovery && !discovery.quiz),
    error: query.error ?? null,
    loading: query.isLoading && !discovery,
    isValidating: query.isValidating,
    mutate: query.mutate,
  }
}

function normalizeExamSubjectId(subjectId: string | number | null | undefined) {
  const value = String(subjectId ?? '').trim()
  return value || null
}
