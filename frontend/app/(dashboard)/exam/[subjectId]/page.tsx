'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, AlertTriangle, CheckCircle2, XCircle, ArrowRight, RotateCcw } from 'lucide-react'
import { postJson } from '@/lib/apiClient'
import { apiDataErrorMessage } from '@/lib/apiData'
import { NO_EXAM_QUIZ_MESSAGE, useExamQuizData, type ExamResult } from '@/lib/examData'
import ErrorBoundary from '@/components/ErrorBoundary'
import RouteErrorState from '@/components/RouteErrorState'

const EXAM_DURATION_MINUTES = 45

export default function ExamPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()

  const {
    quiz,
    lessonId,
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
  const lastLoadErrorToastRef = useRef('')
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_MINUTES * 60)
  const [started, setStarted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ExamResult | null>(null)
  const submitCalledRef = useRef(false)
  const answersRef = useRef(answers)
  const lessonIdRef = useRef(lessonId)
  const quizRef = useRef(quiz)

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  useEffect(() => {
    lessonIdRef.current = lessonId
  }, [lessonId])

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
    setAnswers({})
    setCurrentIdx(0)
    setTimeLeft(EXAM_DURATION_MINUTES * 60)
    setStarted(false)
    setSubmitted(false)
    setSubmitting(false)
    setResult(null)
    submitCalledRef.current = false
  }, [quiz?.id, subjectId])

  async function retryExam() {
    try {
      await retryExamData()
    } catch {
      // SWR owns the latest error state; the effect above owns user-visible reporting.
    }
  }

  const handleSubmit = useCallback(async () => {
    const activeQuiz = quizRef.current
    const activeLessonId = lessonIdRef.current
    if (submitCalledRef.current || !activeQuiz || !activeLessonId) return
    submitCalledRef.current = true
    setSubmitted(true)
    setSubmitting(true)
    try {
      const data = await postJson<ExamResult>(`/quizzes/lessons/${activeLessonId}/quiz/submit`, { answers: answersRef.current })
      setResult(data)
    } catch {
      toast.error('Erreur lors de la soumission de l\'examen.')
      setSubmitted(false)
      submitCalledRef.current = false
    } finally {
      setSubmitting(false)
    }
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!started || submitted) return
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval)
          handleSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [started, submitted, handleSubmit])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const pct = (timeLeft / (EXAM_DURATION_MINUTES * 60)) * 100
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
            onClick={() => setStarted(true)}
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
            onClick={() => {
              setSubmitted(false)
              setAnswers({})
              setCurrentIdx(0)
              setTimeLeft(EXAM_DURATION_MINUTES * 60)
              setStarted(false)
              setResult(null)
              submitCalledRef.current = false
            }}
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
