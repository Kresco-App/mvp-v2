import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExamQuiz, ExamResult } from '@/lib/examData'

export const EXAM_DRAFT_STORAGE_PREFIX = 'kresco:exam-draft:v1'

type ExamDraft = {
  subjectId: string
  quizId: number
  questionIds: number[]
  answers: Record<string, number>
  currentIdx: number
  started: boolean
  startedAt: number | null
  submitted: boolean
  result: ExamResult | null
}

export type RestoredExamDraft = {
  answers: Record<number, number>
  currentIdx: number
  started: boolean
  startedAt: number | null
  submitted: boolean
  result: ExamResult | null
}

type UseExamDraftOptions = {
  subjectId: string
  quiz: ExamQuiz | null
  quizFingerprint: string
  answers: Record<number, number>
  currentIdx: number
  started: boolean
  startedAt: number | null
  submitted: boolean
  result: ExamResult | null
  onReset: () => void
  onRestore: (draft: RestoredExamDraft) => void
}

export function useExamDraft({
  subjectId,
  quiz,
  quizFingerprint,
  answers,
  currentIdx,
  started,
  startedAt,
  submitted,
  result,
  onReset,
  onRestore,
}: UseExamDraftOptions) {
  const [draftHydrated, setDraftHydrated] = useState(false)
  const quizRef = useRef(quiz)

  useEffect(() => {
    quizRef.current = quiz
  }, [quiz])

  useEffect(() => {
    const activeQuiz = quizRef.current
    if (!activeQuiz) {
      setDraftHydrated(false)
      return
    }

    const restored = readExamDraft(subjectId, activeQuiz)
    if (!restored) {
      onReset()
      setDraftHydrated(true)
      return
    }

    onRestore(restored)
    setDraftHydrated(true)
  }, [onReset, onRestore, quizFingerprint, subjectId])

  useEffect(() => {
    if (!quiz || !draftHydrated) return
    const storageKey = examDraftStorageKey(subjectId, quiz.id)
    if (!started && !submitted) {
      removeExamDraft(storageKey)
      return
    }

    writeExamDraft(storageKey, {
      subjectId,
      quizId: quiz.id,
      questionIds: quiz.questions.map(question => question.id),
      answers,
      currentIdx,
      started,
      startedAt,
      submitted,
      result,
    })
  }, [answers, currentIdx, draftHydrated, quiz, result, started, startedAt, subjectId, submitted])

  const removeDraft = useCallback(() => {
    if (quiz) removeExamDraft(examDraftStorageKey(subjectId, quiz.id))
  }, [quiz, subjectId])

  return { draftHydrated, removeDraft }
}

export function examDraftStorageKey(subjectId: string, quizId: number) {
  return `${EXAM_DRAFT_STORAGE_PREFIX}:${subjectId}:${quizId}`
}

export function readExamDraft(subjectId: string, quiz: ExamQuiz): RestoredExamDraft | null {
  if (typeof window === 'undefined') return null
  const storageKey = examDraftStorageKey(subjectId, quiz.id)
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<ExamDraft>
    if (draft.subjectId !== subjectId || draft.quizId !== quiz.id) return null
    if (!Array.isArray(draft.questionIds) || !sameQuestionOrder(draft.questionIds, quiz)) return null

    const answers = sanitizeDraftAnswers(draft.answers, quiz)
    const hasResult = Boolean(draft.submitted && isExamResult(draft.result))
    const startedAt = typeof draft.startedAt === 'number' && Number.isFinite(draft.startedAt)
      ? draft.startedAt
      : null
    return {
      answers,
      currentIdx: clampQuestionIndex(draft.currentIdx, quiz.questions.length),
      started: Boolean((draft.started && startedAt !== null) || hasResult),
      startedAt,
      submitted: hasResult,
      result: hasResult ? draft.result as ExamResult : null,
    }
  } catch {
    removeExamDraft(storageKey)
    return null
  }
}

export function writeExamDraft(storageKey: string, draft: ExamDraft) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(draft))
  } catch {
    // Storage quota or browser privacy mode should not break an active exam.
  }
}

export function removeExamDraft(storageKey: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Ignore unavailable storage.
  }
}

export function sameQuestionOrder(questionIds: number[], quiz: ExamQuiz) {
  return questionIds.length === quiz.questions.length
    && questionIds.every((id, index) => id === quiz.questions[index]?.id)
}

export function sanitizeDraftAnswers(rawAnswers: unknown, quiz: ExamQuiz) {
  const answers: Record<number, number> = {}
  if (!rawAnswers || typeof rawAnswers !== 'object') return answers
  const optionsByQuestion = new Map(
    quiz.questions.map(question => [question.id, new Set(question.options.map(option => option.id))]),
  )

  for (const [questionIdRaw, optionIdRaw] of Object.entries(rawAnswers as Record<string, unknown>)) {
    const questionId = Number(questionIdRaw)
    const optionId = Number(optionIdRaw)
    if (!Number.isInteger(questionId) || !Number.isInteger(optionId)) continue
    if (!optionsByQuestion.get(questionId)?.has(optionId)) continue
    answers[questionId] = optionId
  }
  return answers
}

export function examQuizFingerprint(quiz: ExamQuiz) {
  return `${quiz.id}:${quiz.questions.map(question => (
    `${question.id}[${question.options.map(option => option.id).join(',')}]`
  )).join('|')}`
}

function clampQuestionIndex(index: unknown, questionCount: number) {
  if (!Number.isInteger(index)) return 0
  return Math.min(Math.max(0, index as number), Math.max(0, questionCount - 1))
}

function isExamResult(result: unknown): result is ExamResult {
  if (!result || typeof result !== 'object') return false
  const value = result as Partial<Record<keyof ExamResult, unknown>>
  return typeof value.score === 'number'
    && typeof value.passed === 'boolean'
    && typeof value.correct === 'number'
    && typeof value.total === 'number'
    && typeof value.pass_score === 'number'
    && typeof value.xp_earned === 'number'
}
