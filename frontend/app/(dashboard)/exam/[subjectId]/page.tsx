'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, AlertTriangle, CheckCircle2, XCircle, ArrowRight, RotateCcw } from 'lucide-react'
import { postJson } from '@/lib/apiClient'
import { apiDataErrorMessage } from '@/lib/apiData'
import { NO_EXAM_QUIZ_MESSAGE, useExamQuizData, type ExamQuiz, type ExamResult } from '@/lib/examData'
import ErrorBoundary from '@/components/ErrorBoundary'
import RouteErrorState from '@/components/RouteErrorState'

const EXAM_DURATION_MINUTES = 45
const EXAM_DURATION_SECONDS = EXAM_DURATION_MINUTES * 60
const EXAM_DRAFT_STORAGE_PREFIX = 'kresco:exam-draft:v1'

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

export default function ExamPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()

  const {
    quiz,
    noQuiz,
    error: examError,
    loading,
    isValidating,
    mutate: retryExamData,
  } = useExamQuizData(subjectId)
  const loadError = examError
    ? apiDataErrorMessage(examError, 'Erreur lors du chargement de l\'examen.')
    : noQuiz
      ? NO_EXAM_QUIZ_MESSAGE
      : ''
  const quizFingerprint = quiz ? examQuizFingerprint(quiz) : ''
  const lastLoadErrorToastRef = useRef('')
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS)
  const [started, setStarted] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ExamResult | null>(null)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const submitCalledRef = useRef(false)
  const answersRef = useRef(answers)
  const quizRef = useRef(quiz)

  const resetExamState = useCallback(() => {
    setAnswers({})
    setCurrentIdx(0)
    setTimeLeft(EXAM_DURATION_SECONDS)
    setStarted(false)
    setStartedAt(null)
    setSubmitted(false)
    setSubmitting(false)
    setResult(null)
    submitCalledRef.current = false
  }, [])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  useEffect(() => {
    quizRef.current = quiz
  }, [quiz])

  useEffect(() => {
    if (!loadError) {
      lastLoadErrorToastRef.current = ''
      return
    }
    if (loadError === lastLoadErrorToastRef.current) return
    lastLoadErrorToastRef.current = loadError
    toast.error(loadError)
  }, [loadError])

  useEffect(() => {
    const activeQuiz = quizRef.current
    if (!activeQuiz) {
      setDraftHydrated(false)
      return
    }

    const restored = readExamDraft(subjectId, activeQuiz)
    if (!restored) {
      resetExamState()
      setDraftHydrated(true)
      return
    }

    setAnswers(restored.answers)
    setCurrentIdx(restored.currentIdx)
    setStarted(restored.started)
    setStartedAt(restored.startedAt)
    setSubmitted(restored.submitted)
    setSubmitting(false)
    setResult(restored.result)
    setTimeLeft(restored.startedAt ? examRemainingSeconds(restored.startedAt) : EXAM_DURATION_SECONDS)
    submitCalledRef.current = restored.submitted
    setDraftHydrated(true)
  }, [quizFingerprint, resetExamState, subjectId])

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

  async function retryExam() {
    try {
      await retryExamData()
    } catch {
      // SWR owns the latest error state; the effect above owns user-visible reporting.
    }
  }

  const handleSubmit = useCallback(async () => {
    const activeQuiz = quizRef.current
    if (submitCalledRef.current || !activeQuiz) return
    submitCalledRef.current = true
    setSubmitted(true)
    setSubmitting(true)
    try {
      const data = await postJson<ExamResult>(`/quizzes/${activeQuiz.id}/submit`, { answers: answersRef.current })
      setResult(data)
    } catch {
      toast.error('Erreur lors de la soumission de l\'examen.')
      setSubmitted(false)
      submitCalledRef.current = false
    } finally {
      setSubmitting(false)
    }
  }, [])

  useEffect(() => {
    if (!started || submitted || startedAt === null) return
    const updateTime = () => {
      const remaining = examRemainingSeconds(startedAt)
      setTimeLeft(remaining)
      if (remaining <= 0) void handleSubmit()
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [started, startedAt, submitted, handleSubmit])

  const startExam = useCallback(() => {
    setStartedAt(current => current ?? Date.now())
    setStarted(true)
  }, [])

  const resetExamAttempt = useCallback(() => {
    if (quiz) removeExamDraft(examDraftStorageKey(subjectId, quiz.id))
    resetExamState()
  }, [quiz, resetExamState, subjectId])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const pct = (timeLeft / EXAM_DURATION_SECONDS) * 100
  const isUrgent = timeLeft < 300  // 5 dernieres minutes

  if (loading && !quiz) return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
      <div className="w-8 h-8 border-2 border-kresco border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!quiz) return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900 px-6">
      <RouteErrorState
        eyebrow="Exam unavailable"
        title="This exam could not be loaded."
        message={loadError || 'The exam data was empty or incomplete. Retry the request or go back home.'}
        homeHref="/home"
        homeLabel="Back home"
        onRetry={() => void retryExam()}
      />
    </div>
  )

  // Ecran pre-examen
  if (!started) return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl mx-4">
        {loadError && (
          <section role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-left">
            <div>
              <p className="m-0 text-xs font-bold text-amber-100">Exam data could not be refreshed.</p>
              <p className="m-0 mt-1 text-[11px] font-semibold text-amber-200/80">Cached quiz data stays visible while you retry.</p>
            </div>
            <button
              type="button"
              onClick={() => void retryExam()}
              disabled={isValidating}
              className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-[11px] font-bold text-slate-950 disabled:opacity-60"
            >
              <RotateCcw size={13} />
              {isValidating ? 'Retrying' : 'Retry'}
            </button>
          </section>
        )}
        <div className="w-16 h-16 bg-kresco/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={28} className="text-kresco" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Mode Examen</h1>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          Vous disposez de <strong>{EXAM_DURATION_MINUTES} minutes</strong> pour terminer cet examen.
          Pas d&apos;indices ni de tentatives supplementaires pendant l&apos;examen. Assurez-vous d&apos;etre pret.
        </p>
        <ul className="text-xs text-slate-500 space-y-1.5 mb-8 text-left bg-slate-950 rounded-xl p-4">
          <li>Le chrono demarre des que vous cliquez sur Commencer</li>
          <li>Vous pouvez naviguer librement entre les questions</li>
          <li>L&apos;examen se soumet automatiquement a la fin du temps</li>
          <li>Minimum 80% pour reussir</li>
        </ul>
        <div className="flex gap-3">
          <button type="button"
            onClick={() => router.back()}
            className="flex-1 border border-slate-700 text-slate-400 font-semibold py-3 rounded-xl hover:bg-slate-950 transition"
          >
            Annuler
          </button>
          <button type="button"
            onClick={startExam}
            className="flex-1 bg-kresco text-white font-semibold py-3 rounded-xl hover:bg-kresco/90 transition"
          >
            Commencer
          </button>
        </div>
      </div>
    </div>
  )

  // Ecran de resultats
  if (submitted && result) return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl mx-4">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${result.passed ? 'bg-green-100' : 'bg-red-100'}`}>
          {result.passed ? <CheckCircle2 size={36} className="text-green-600" /> : <XCircle size={36} className="text-red-500" />}
        </div>
        <h2 className="text-3xl font-black mb-1" style={{ color: result.passed ? '#16a34a' : '#dc2626' }}>
          {result.score}%
        </h2>
        <p className={`text-sm font-semibold mb-1 ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
          {result.passed ? 'Examen reussi !' : 'Non reussi'}
        </p>
        <p className="text-slate-400 text-xs mb-2">
          {result.correct} / {result.total} reponses correctes · Seuil de reussite : 80%
        </p>
        {result.xp_earned > 0 && (
          <p className="text-indigo-600 text-xs font-semibold mb-6">+{result.xp_earned} XP gagnes !</p>
        )}
        <div className="flex gap-3 mt-6">
          <button type="button"
            onClick={() => router.push('/home')}
            className="flex-1 border border-slate-700 text-slate-400 font-semibold py-3 rounded-xl hover:bg-slate-950 transition"
          >
            Retour a l&apos;accueil
          </button>
          <button type="button"
            onClick={resetExamAttempt}
            className="flex-1 bg-kresco text-white font-semibold py-3 rounded-xl hover:bg-kresco/90 transition"
          >
            Reessayer
          </button>
        </div>
      </div>
    </div>
  )

  // Ecran de soumission en cours
  if (submitted && submitting) return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
      <div className="w-8 h-8 border-2 border-kresco border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const question = quiz.questions[currentIdx]
  const answered = Object.keys(answers).length
  const total = quiz.questions.length

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      {/* Barre superieure */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2 text-white font-bold">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          MODE EXAMEN
        </div>
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : 'bg-kresco'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className={`flex items-center gap-1.5 font-mono font-bold text-sm ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          <Clock size={14} />
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <span className="text-slate-400 text-xs">{answered}/{total} repondu(s)</span>
      </div>

      {/* Zone de question */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation des questions */}
        <div className="w-20 bg-slate-800 border-r border-slate-700 p-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1.5">
            {quiz.questions.map((q, i) => (
              <button type="button"
                key={q.id}
                onClick={() => setCurrentIdx(i)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                  i === currentIdx ? 'bg-kresco text-white' :
                  answers[q.id] ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Question principale */}
        <ErrorBoundary
          eyebrow="Exam question error"
          title="This exam question failed to load."
          message="Retry the question panel without leaving the exam."
          homeHref="/home"
        >
          <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
            <div className="w-full max-w-2xl">
              <p className="text-slate-400 text-sm mb-4">Question {currentIdx + 1} sur {total}</p>
              <div className="bg-slate-800 rounded-2xl p-6 mb-6">
                <p className="text-white text-lg font-semibold leading-relaxed">{question.text}</p>
              </div>

              <div className="space-y-3 mb-8">
                {question.options.map(opt => (
                  <button type="button"
                    key={opt.id}
                    onClick={() => setAnswers(a => ({ ...a, [question.id]: opt.id }))}
                    className={`w-full text-left px-5 py-4 rounded-xl border-2 transition text-sm ${
                      answers[question.id] === opt.id
                        ? 'border-kresco bg-kresco/10 text-white font-semibold'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>

              <div className="flex justify-between">
                <button type="button"
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="text-slate-400 text-sm hover:text-white transition disabled:opacity-30"
                >
                  Precedent
                </button>
                {currentIdx < total - 1 ? (
                  <button type="button"
                    onClick={() => setCurrentIdx(i => i + 1)}
                    className="flex items-center gap-2 bg-kresco text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-kresco/90 transition"
                  >
                    Suivant <ArrowRight size={14} />
                  </button>
                ) : (
                  <button type="button"
                    onClick={handleSubmit}
                    className="flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-green-700 transition"
                  >
                    Soumettre l&apos;examen
                  </button>
                )}
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>
    </div>
  )
}

function examDraftStorageKey(subjectId: string, quizId: number) {
  return `${EXAM_DRAFT_STORAGE_PREFIX}:${subjectId}:${quizId}`
}

function examRemainingSeconds(startedAt: number, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))
  return Math.max(0, EXAM_DURATION_SECONDS - elapsed)
}

function readExamDraft(subjectId: string, quiz: ExamQuiz) {
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

function writeExamDraft(storageKey: string, draft: ExamDraft) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(draft))
  } catch {
    // Storage quota or browser privacy mode should not break an active exam.
  }
}

function removeExamDraft(storageKey: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Ignore unavailable storage.
  }
}

function sameQuestionOrder(questionIds: number[], quiz: ExamQuiz) {
  return questionIds.length === quiz.questions.length
    && questionIds.every((id, index) => id === quiz.questions[index]?.id)
}

function sanitizeDraftAnswers(rawAnswers: unknown, quiz: ExamQuiz) {
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

function examQuizFingerprint(quiz: ExamQuiz) {
  return `${quiz.id}:${quiz.questions.map(question => (
    `${question.id}[${question.options.map(option => option.id).join(',')}]`
  )).join('|')}`
}
