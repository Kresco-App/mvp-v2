'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { showToastError } from '@/lib/lazyToast'
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Loader2,
  ShieldCheck,
  FileQuestion,
} from 'lucide-react'
import { postJson } from '@/lib/apiClient'
import { apiDataErrorMessage } from '@/lib/apiData'
import { examQuizFingerprint, useExamDraft, type RestoredExamDraft } from '@/lib/examDraft'
import { NO_EXAM_QUIZ_MESSAGE, useExamQuizData, type ExamQuestion, type ExamResult } from '@/lib/examData'
import ErrorBoundary from '@/components/ErrorBoundary'
import RouteErrorState from '@/components/RouteErrorState'

const EXAM_DURATION_MINUTES = 45
const EXAM_DURATION_SECONDS = EXAM_DURATION_MINUTES * 60

function isExamDocumentHidden() {
  return typeof document !== 'undefined' && document.hidden
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

  const restoreExamState = useCallback((restored: RestoredExamDraft) => {
    setAnswers(restored.answers)
    setCurrentIdx(restored.currentIdx)
    setStarted(restored.started)
    setStartedAt(restored.startedAt)
    setSubmitted(restored.submitted)
    setSubmitting(false)
    setResult(restored.result)
    setTimeLeft(restored.startedAt ? examRemainingSeconds(restored.startedAt) : EXAM_DURATION_SECONDS)
    submitCalledRef.current = restored.submitted
  }, [])

  const { draftHydrated, removeDraft } = useExamDraft({
    subjectId,
    quiz,
    quizFingerprint,
    answers,
    currentIdx,
    started,
    startedAt,
    submitted,
    result,
    onReset: resetExamState,
    onRestore: restoreExamState,
  })

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
    showToastError(loadError)
  }, [loadError])

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
      showToastError('Erreur lors de la soumission de l\'examen.')
      setSubmitted(false)
      submitCalledRef.current = false
    } finally {
      setSubmitting(false)
    }
  }, [])

  useEffect(() => {
    if (!started || submitted || startedAt === null) return
    let interval: ReturnType<typeof setInterval> | null = null
    const updateTime = () => {
      const remaining = examRemainingSeconds(startedAt)
      setTimeLeft(remaining)
      if (remaining <= 0) void handleSubmit()
      return remaining
    }
    const stopTimer = () => {
      if (interval === null) return
      clearInterval(interval)
      interval = null
    }
    const startTimer = () => {
      if (interval !== null || isExamDocumentHidden()) return
      interval = setInterval(() => {
        if (updateTime() <= 0) stopTimer()
      }, 1000)
    }
    const handleVisibilityChange = () => {
      const remaining = updateTime()
      if (isExamDocumentHidden() || remaining <= 0) {
        stopTimer()
        return
      }
      startTimer()
    }

    if (updateTime() > 0) startTimer()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stopTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [started, startedAt, submitted, handleSubmit])

  const startExam = useCallback(() => {
    setStartedAt(current => current ?? Date.now())
    setStarted(true)
  }, [])

  const selectQuestionIndex = useCallback((index: number) => {
    setCurrentIdx(index)
  }, [])

  const answerQuestion = useCallback((questionId: number, optionId: number) => {
    setAnswers((current) => (
      current[questionId] === optionId
        ? current
        : { ...current, [questionId]: optionId }
    ))
  }, [])

  const goToPreviousQuestion = useCallback(() => {
    setCurrentIdx((current) => Math.max(0, current - 1))
  }, [])

  const goToNextQuestion = useCallback(() => {
    setCurrentIdx((current) => {
      const lastIndex = Math.max(0, (quizRef.current?.questions.length ?? 1) - 1)
      return Math.min(lastIndex, current + 1)
    })
  }, [])

  const resetExamAttempt = useCallback(() => {
    removeDraft()
    resetExamState()
  }, [removeDraft, resetExamState])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const pct = (timeLeft / EXAM_DURATION_SECONDS) * 100
  const progressPct = Math.max(0, Math.min(100, pct))
  const isUrgent = timeLeft < 300  // 5 dernieres minutes

  if ((loading && !quiz) || (quiz && !draftHydrated)) return (
    <ExamLoadingState
      title={quiz ? 'Restauration de votre session' : 'Preparation de l\'examen'}
      message={quiz ? 'Nous reprenons votre progression et le temps restant.' : 'Chargement du quiz, du chrono et des consignes.'}
    />
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
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
        <section className="w-full rounded-[24px] border border-slate-800 bg-slate-900 p-6 text-left shadow-2xl shadow-black/30 sm:p-8">
        {loadError && (
          <section role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 sm:flex-row sm:items-start sm:justify-between">
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
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-kresco/10 text-kresco">
            <AlertTriangle size={28} />
          </div>
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-kresco">Session chronometree</p>
            <h1 className="m-0 mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">Mode Examen</h1>
            <p className="m-0 mt-2 text-sm font-semibold leading-relaxed text-slate-400">{quiz.title}</p>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Duree</p>
            <p className="m-0 mt-2 text-xl font-black text-white">{EXAM_DURATION_MINUTES} min</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Questions</p>
            <p className="m-0 mt-2 text-xl font-black text-white">{quiz.questions.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Reussite</p>
            <p className="m-0 mt-2 text-xl font-black text-white">{quiz.pass_score}%</p>
          </div>
        </div>

        <p className="m-0 mt-6 text-sm leading-relaxed text-slate-400">
          Vous disposez de <strong className="text-slate-100">{EXAM_DURATION_MINUTES} minutes</strong> pour terminer cet examen.
          Pas d&apos;indices ni de tentatives supplementaires pendant la session.
        </p>
        <ul className="mt-5 space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm font-semibold text-slate-400">
          <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-kresco" />Le chrono demarre des que vous cliquez sur Commencer</li>
          <li className="flex gap-2"><FileQuestion size={16} className="mt-0.5 shrink-0 text-kresco" />Vous pouvez naviguer librement entre les questions</li>
          <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-kresco" />L&apos;examen se soumet automatiquement a la fin du temps</li>
          <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-kresco" />Minimum {quiz.pass_score}% pour reussir</li>
        </ul>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button type="button"
            onClick={() => router.back()}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-black text-slate-300 transition-[background-color,transform] duration-150 ease-out hover:bg-slate-950 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kresco"
          >
            Annuler
          </button>
          <button type="button"
            onClick={startExam}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-kresco px-4 text-sm font-black text-white transition-[background-color,transform] duration-150 ease-out hover:bg-kresco/90 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kresco"
          >
            Commencer
          </button>
        </div>
        </section>
      </div>
    </div>
  )

  // Ecran de resultats
  if (submitted && result) return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
        <section className="w-full rounded-[24px] border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl shadow-black/30 sm:p-8">
        <div className={`mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full ${result.passed ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {result.passed ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
        </div>
        <p className={`m-0 text-sm font-black uppercase tracking-[0.16em] ${result.passed ? 'text-green-300' : 'text-red-300'}`}>
          {result.passed ? 'Examen reussi' : 'Non reussi'}
        </p>
        <h2 className="m-0 mt-2 text-5xl font-black leading-none text-white">
          {result.score}%
        </h2>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Correctes</p>
            <p className="m-0 mt-2 text-xl font-black text-white">{result.correct}/{result.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Seuil</p>
            <p className="m-0 mt-2 text-xl font-black text-white">{result.pass_score}%</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">XP</p>
            <p className="m-0 mt-2 text-xl font-black text-white">{result.xp_earned}</p>
          </div>
        </div>
        <p className="m-0 mt-5 text-sm font-semibold text-slate-400">
          {result.correct} / {result.total} reponses correctes &middot; Seuil de reussite : {result.pass_score}%
        </p>
        {result.xp_earned > 0 && (
          <p className="m-0 mt-2 text-xs font-black text-kresco">+{result.xp_earned} XP gagnes</p>
        )}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button type="button"
            onClick={() => router.push('/home')}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-black text-slate-300 transition-[background-color,transform] duration-150 ease-out hover:bg-slate-950 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kresco"
          >
            Retour a l&apos;accueil
          </button>
          <button type="button"
            onClick={resetExamAttempt}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-kresco px-4 text-sm font-black text-white transition-[background-color,transform] duration-150 ease-out hover:bg-kresco/90 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kresco"
          >
            Reessayer
          </button>
        </div>
        </section>
      </div>
    </div>
  )

  // Ecran de soumission en cours
  if (submitted && submitting) return (
    <ExamLoadingState
      title="Soumission en cours"
      message="Nous enregistrons vos reponses et calculons votre score."
    />
  )

  const total = quiz.questions.length
  const questionIndex = Math.min(currentIdx, Math.max(0, total - 1))
  const question = quiz.questions[questionIndex]
  const answered = Object.keys(answers).length
  const unanswered = Math.max(0, total - answered)

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-950 text-white">
      {/* Barre superieure */}
      <div className="pointer-events-none shrink-0 border-b border-slate-800 bg-slate-900/95 px-4 py-3 shadow-lg shadow-black/10 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
        <div className="flex items-center gap-2 text-sm font-black tracking-[0.08em] text-white">
          <div className="w-2 h-2 bg-red-500 rounded-full motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none" />
          MODE EXAMEN
        </div>
        <div
          className="pointer-events-none order-last h-2 w-full overflow-hidden rounded-full bg-slate-800 sm:order-none sm:flex-1"
          role="progressbar"
          aria-label="Temps restant"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
        >
          <svg className="pointer-events-none block h-full w-full" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect
              x="0"
              y="0"
              width={progressPct}
              height="1"
              className={`transition-[fill] duration-150 ease-out motion-reduce:transition-none ${isUrgent ? 'fill-red-500' : 'fill-kresco'}`}
            />
          </svg>
        </div>
        <div
          aria-live="polite"
          className={`flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 font-mono text-sm font-black ${isUrgent ? 'text-red-300 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none' : 'text-white'}`}
        >
          <Clock size={14} />
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <span className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-slate-300">{answered}/{total} repondu(s)</span>
        </div>
        {unanswered > 0 && (
          <p className="m-0 mt-2 text-xs font-semibold text-slate-500 sm:hidden">
            {unanswered} question{unanswered > 1 ? 's' : ''} sans reponse.
          </p>
        )}
      </div>

      {/* Zone de question */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Navigation des questions */}
        <nav aria-label="Questions" className="shrink-0 border-b border-slate-800 bg-slate-900 p-3 md:w-24 md:overflow-y-auto md:border-b-0 md:border-r">
          <ExamQuestionNavigator
            answers={answers}
            currentIndex={questionIndex}
            questions={quiz.questions}
            onSelectQuestion={selectQuestionIndex}
          />
        </nav>

        {/* Question principale */}
        <ErrorBoundary
          eyebrow="Exam question error"
          title="This exam question failed to load."
          message="Retry the question panel without leaving the exam."
          homeHref="/home"
        >
          <ExamQuestionPanel
            answerId={answers[question.id]}
            question={question}
            questionIndex={questionIndex}
            submitting={submitting}
            total={total}
            unanswered={unanswered}
            onAnswer={answerQuestion}
            onNext={goToNextQuestion}
            onPrevious={goToPreviousQuestion}
            onSubmit={handleSubmit}
          />
        </ErrorBoundary>
      </div>
    </div>
  )
}

const ExamQuestionNavigator = memo(function ExamQuestionNavigator({
  answers,
  currentIndex,
  questions,
  onSelectQuestion,
}: {
  answers: Record<number, number>
  currentIndex: number
  questions: ExamQuestion[]
  onSelectQuestion: (index: number) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
      {questions.map((question, index) => {
        const answered = Boolean(answers[question.id])
        return (
          <button type="button"
            key={question.id}
            onClick={() => onSelectQuestion(index)}
            aria-current={index === currentIndex ? 'step' : undefined}
            aria-label={`Question ${index + 1}${answered ? ', repondue' : ', sans reponse'}`}
            className={`relative h-10 w-10 flex-none rounded-xl text-xs font-black transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kresco ${
              index === currentIndex ? 'bg-kresco text-white shadow-lg shadow-kresco/25' :
              answered ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {index + 1}
            {answered && index !== currentIndex && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-slate-900 bg-green-300" aria-hidden="true" />
            )}
          </button>
        )
      })}
    </div>
  )
})

const ExamQuestionPanel = memo(function ExamQuestionPanel({
  answerId,
  question,
  questionIndex,
  submitting,
  total,
  unanswered,
  onAnswer,
  onNext,
  onPrevious,
  onSubmit,
}: {
  answerId: number | undefined
  question: ExamQuestion
  questionIndex: number
  submitting: boolean
  total: number
  unanswered: number
  onAnswer: (questionId: number, optionId: number) => void
  onNext: () => void
  onPrevious: () => void
  onSubmit: () => void
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-black/10 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm font-black text-slate-400">Question {questionIndex + 1} sur {total}</p>
            <span className={`rounded-xl px-3 py-1.5 text-xs font-black ${answerId ? 'bg-green-500/15 text-green-300' : 'bg-slate-800 text-slate-400'}`}>
              {answerId ? 'Repondue' : 'Sans reponse'}
            </span>
          </div>
          <h1 className="m-0 text-xl font-black leading-relaxed text-white sm:text-2xl">{question.text}</h1>
        </section>

        {question.options.length > 0 ? (
          <div className="grid gap-3" role="radiogroup" aria-label={`Reponses pour la question ${questionIndex + 1}`}>
            {question.options.map(opt => {
              const selected = answerId === opt.id
              return (
                <button type="button"
                  key={opt.id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onAnswer(question.id, opt.id)}
                  className={`scroll-mt-28 flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-4 text-left text-sm font-semibold leading-relaxed transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kresco sm:px-5 ${
                    selected
                      ? 'border-kresco bg-kresco/10 text-white shadow-lg shadow-kresco/10'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? 'border-kresco bg-kresco text-white' : 'border-slate-600 text-transparent'}`} aria-hidden="true">
                    <CheckCircle2 size={14} />
                  </span>
                  <span>{opt.text}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <section role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-sm font-semibold leading-relaxed text-amber-100">
            Cette question n&apos;a pas encore de choix de reponse publies. Vous pouvez passer a la question suivante ou soumettre si vous avez termine.
          </section>
        )}

        <footer className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button"
            onClick={onPrevious}
            disabled={questionIndex === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-800 px-4 text-sm font-black text-slate-300 transition-[background-color,color,opacity,transform] duration-150 ease-out hover:bg-slate-900 hover:text-white active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100"
          >
            <ArrowLeft size={14} />
            Precedent
          </button>
          <p className="m-0 text-center text-xs font-semibold text-slate-500 sm:flex-1">
            {unanswered === 0 ? 'Toutes les questions ont une reponse.' : `${unanswered} question${unanswered > 1 ? 's' : ''} sans reponse.`}
          </p>
          {questionIndex < total - 1 ? (
            <button type="button"
              onClick={onNext}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-kresco px-5 text-sm font-black text-white transition-[background-color,transform] duration-150 ease-out hover:bg-kresco/90 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kresco"
            >
              Suivant <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-5 text-sm font-black text-white transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-green-700 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            >
              Soumettre l&apos;examen
            </button>
          )}
        </footer>
      </div>
    </main>
  )
})

function ExamLoadingState({ title, message }: { title: string; message: string }) {
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-[24px] border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-kresco/10 text-kresco">
          <Loader2 size={26} className="animate-spin motion-reduce:animate-none" />
        </div>
        <h1 className="m-0 mt-5 text-xl font-black text-white">{title}</h1>
        <p className="m-0 mt-2 text-sm font-semibold leading-relaxed text-slate-400">{message}</p>
        <div className="mt-6 grid gap-2" aria-hidden="true">
          <div className="h-2 rounded-full bg-slate-800" />
          <div className="mx-auto h-2 w-4/5 rounded-full bg-slate-800" />
          <div className="mx-auto h-2 w-3/5 rounded-full bg-slate-800" />
        </div>
      </section>
    </div>
  )
}

function examRemainingSeconds(startedAt: number, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))
  return Math.max(0, EXAM_DURATION_SECONDS - elapsed)
}
