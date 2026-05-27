import useSWR from 'swr'
import api from '@/lib/axios'

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

export type ExamSubjectLesson = {
  id: number
}

export type ExamSubjectChapter = {
  lessons?: ExamSubjectLesson[]
}

export type ExamSubject = {
  id?: number | string
  chapters?: ExamSubjectChapter[]
}

export type ExamQuizDiscovery = {
  subjectId: string
  quiz: ExamQuiz | null
  lessonId: number | null
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

  const { data: subject } = await api.get<ExamSubject>(`/courses/subjects/${encodeURIComponent(normalized)}`)
  const lessons = examLessonsFromSubject(subject)

  for (const lesson of lessons) {
    try {
      const { data } = await api.get<ExamQuiz>(`/quizzes/${lesson.id}`)
      if (data && Array.isArray(data.questions) && data.questions.length > 0) {
        return {
          subjectId: normalized,
          quiz: data,
          lessonId: lesson.id,
        }
      }
    } catch {
      // Missing per-lesson quizzes are expected; keep scanning the subject.
    }
  }

  return {
    subjectId: normalized,
    quiz: null,
    lessonId: null,
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
    lessonId: discovery?.lessonId ?? null,
    noQuiz: Boolean(discovery && !discovery.quiz),
    error: query.error ?? null,
    loading: query.isLoading && !discovery,
    isValidating: query.isValidating,
    mutate: query.mutate,
  }
}

export function examLessonsFromSubject(subject: ExamSubject): ExamSubjectLesson[] {
  const chapters = Array.isArray(subject.chapters) ? subject.chapters : []
  return chapters.flatMap((chapter) => (
    Array.isArray(chapter.lessons)
      ? chapter.lessons.filter((lesson) => Number.isFinite(lesson.id))
      : []
  ))
}

function normalizeExamSubjectId(subjectId: string | number | null | undefined) {
  const value = String(subjectId ?? '').trim()
  return value || null
}
