'use client'

import { useState } from 'react'
import { XCircle, ArrowRight, Trophy, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuizOption {
  text: string
}

interface QuizQuestion {
  text: string
  options: QuizOption[]
}

interface QuizData {
  questions: QuizQuestion[]
}

interface SectionQuizResult {
  score: number
  passed: boolean
  correctCount: number
  totalCount: number
}

interface Props {
  data: QuizData
  passScore: number
  onComplete: (answers: Record<string, number>) => Promise<SectionQuizResult>
}

export default function SectionQuiz({ data, passScore, onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SectionQuizResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const totalQuestions = data.questions.length
  const currentQuestionNumber = currentIndex + 1
  const progressPercent = totalQuestions > 0 ? (currentQuestionNumber / totalQuestions) * 100 : 0

  function handleSelect(optIndex: number) {
    if (submitting || result) return
    setSubmitError(null)
    setSelectedOption(optIndex)
  }

  function handleNext() {
    if (selectedOption === null) return
    setSubmitError(null)
    const newAnswers = { ...answers, [currentIndex.toString()]: selectedOption }
    setAnswers(newAnswers)

    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedOption(null)
    } else {
      submitQuiz(newAnswers)
    }
  }

  async function submitQuiz(finalAnswers: Record<string, number>) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await onComplete(finalAnswers)
      setResult(res)
    } catch {
      setSubmitError('Impossible de valider le quiz. Verifiez votre connexion puis reessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRetry() {
    setCurrentIndex(0)
    setSelectedOption(null)
    setAnswers({})
    setResult(null)
    setSubmitError(null)
  }

  if (totalQuestions === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-4 sm:px-0">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-10 text-center sm:px-8">
          <h3 className="text-lg font-bold text-white">Aucun quiz disponible</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Ce quiz ne contient aucune question pour le moment.
          </p>
        </div>
      </div>
    )
  }

  const currentQuestion = data.questions[currentIndex] ?? data.questions[0]

  if (result) {
    const { passed: finalPassed, score: finalScore, correctCount, totalCount } = result
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-0">
        <div className={cn(
          'rounded-2xl border p-6 text-center sm:p-10',
          finalPassed
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-red-500/10 border-red-500/30'
        )}>
          <div className={cn(
            'w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5',
            finalPassed ? 'bg-green-500/20' : 'bg-red-500/20'
          )}>
            {finalPassed
              ? <Trophy size={36} className="text-green-400" />
              : <XCircle size={36} className="text-red-400" />
            }
          </div>
          <h3 className={cn(
            'text-2xl font-bold mb-3',
            finalPassed ? 'text-green-400' : 'text-red-400'
          )}>
            {finalPassed ? 'Quiz reussi !' : 'Quiz echoue'}
          </h3>
          <p className="text-slate-400 text-base mb-2">
            Vous avez obtenu <span className="font-bold text-white text-xl">{finalScore}%</span>
          </p>
          <p className="text-slate-500 text-sm mb-8">
            {correctCount} correct{correctCount > 1 ? 's' : ''} sur {totalCount} questions
            {!finalPassed && ` - Il faut ${passScore}% pour reussir.`}
          </p>
          {!finalPassed && (
            <button type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <RotateCcw size={14} />
              Reessayer
            </button>
          )}
        </div>
      </div>
    )
  }

  const actionLabel = submitting
    ? 'Validation...'
    : submitError
      ? "Reessayer l'envoi"
      : currentIndex < totalQuestions - 1
        ? 'Continuer'
        : 'Voir le resultat'

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-4 sm:px-0">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm font-medium">
            Question {currentQuestionNumber} sur {totalQuestions}
          </span>
          <span className="text-slate-500 text-sm">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <svg
            role="progressbar"
            aria-label="Progression du quiz"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
            className="block h-full w-full"
            viewBox="0 0 100 1"
            preserveAspectRatio="none"
          >
            <rect width={progressPercent} height="1" fill="#6366f1" rx="0.5" />
          </svg>
        </div>
      </div>

      {/* Question */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.22)] sm:p-8" aria-live="polite">
        <h3 className="text-white text-lg font-bold mb-8 leading-relaxed">
          {currentQuestion.text}
        </h3>

        {/* Options */}
        <div className="space-y-3" role="radiogroup" aria-label={currentQuestion.text}>
          {currentQuestion.options.map((option, optIdx) => {
            const isSelected = selectedOption === optIdx
            const optionLetter = String.fromCharCode(65 + optIdx)

            let optionClasses = 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
            let optionBadgeClasses = 'border-slate-600 bg-slate-900/70 text-slate-400'
            if (isSelected) {
              optionClasses = 'bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500/50'
              optionBadgeClasses = 'border-indigo-400 bg-indigo-500 text-white'
            }

            return (
              <button type="button"
                key={`${currentQuestion.text}-${option.text}-${optIdx}`}
                onClick={() => handleSelect(optIdx)}
                disabled={submitting}
                role="radio"
                aria-checked={isSelected}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-5',
                  optionClasses,
                  submitting && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors', optionBadgeClasses)} aria-hidden="true">
                  {optionLetter}
                </span>
                <span className="flex-1 leading-relaxed">{option.text}</span>
              </button>
            )
          })}
        </div>

        {submitError && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            <XCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
            <p className="m-0">{submitError}</p>
          </div>
        )}

        {/* Action button */}
        <div className="mt-8 flex justify-stretch sm:justify-end">
          <button type="button"
            onClick={handleNext}
            disabled={selectedOption === null || submitting}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {actionLabel}
            {!submitting && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
