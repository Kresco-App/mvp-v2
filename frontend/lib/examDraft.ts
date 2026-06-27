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

type PendingExamDraftWrite = {
  storageKey: string
  draft: ExamDraft
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

const pendingExamDraftWrites = new Map<string, PendingExamDraftWrite>()
const parsedExamDraftCache = new Map<string, { raw: string; draft: Partial<ExamDraft> }>()
let examDraftFlushHandle: number | null = null
let examDraftFlushMode: 'idle' | 'timeout' | null = null
let examDraftPagehideListenerAttached = false

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
    return () => {
      flushPendingExamDraftWrites()
    }
  }, [])

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
    if (!raw) {
      parsedExamDraftCache.delete(storageKey)
      return null
    }
    const cached = parsedExamDraftCache.get(storageKey)
    const draft = cached?.raw === raw
      ? cached.draft
      : JSON.parse(raw) as Partial<ExamDraft>
    if (cached?.raw !== raw) parsedExamDraftCache.set(storageKey, { raw, draft })
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
    parsedExamDraftCache.delete(storageKey)
    removeExamDraft(storageKey)
    return null
  }
}

export function writeExamDraft(storageKey: string, draft: ExamDraft) {
  if (typeof window === 'undefined') return
  pendingExamDraftWrites.set(storageKey, { storageKey, draft })
  attachExamDraftPagehideListener()
  scheduleExamDraftFlush()
}

export function flushPendingExamDraftWrites() {
  if (typeof window === 'undefined') return
  if (examDraftFlushHandle !== null) {
    if (examDraftFlushMode === 'idle') {
      window.cancelIdleCallback?.(examDraftFlushHandle)
    } else {
      window.clearTimeout(examDraftFlushHandle)
    }
    examDraftFlushHandle = null
    examDraftFlushMode = null
  }

  if (pendingExamDraftWrites.size === 0) return
  const writes = Array.from(pendingExamDraftWrites.values())
  pendingExamDraftWrites.clear()

  for (const write of writes) {
    writeExamDraftNow(write.storageKey, write.draft)
  }
}

function scheduleExamDraftFlush() {
  if (examDraftFlushHandle !== null || typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    examDraftFlushMode = 'idle'
    examDraftFlushHandle = window.requestIdleCallback(() => {
      examDraftFlushHandle = null
      examDraftFlushMode = null
      flushPendingExamDraftWrites()
    }, { timeout: 800 })
    return
  }

  examDraftFlushMode = 'timeout'
  examDraftFlushHandle = window.setTimeout(() => {
    examDraftFlushHandle = null
    examDraftFlushMode = null
    flushPendingExamDraftWrites()
  }, 0)
}

function attachExamDraftPagehideListener() {
  if (examDraftPagehideListenerAttached || typeof window === 'undefined') return
  examDraftPagehideListenerAttached = true
  window.addEventListener('pagehide', flushPendingExamDraftWrites)
}

function writeExamDraftNow(storageKey: string, draft: ExamDraft) {
  if (typeof window === 'undefined') return
  try {
    const serialized = JSON.stringify(draft)
    window.localStorage.setItem(storageKey, serialized)
    parsedExamDraftCache.set(storageKey, { raw: serialized, draft })
  } catch {
    // Storage quota or browser privacy mode should not break an active exam.
  }
}

export function removeExamDraft(storageKey: string) {
  if (typeof window === 'undefined') return
  pendingExamDraftWrites.delete(storageKey)
  parsedExamDraftCache.delete(storageKey)
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
