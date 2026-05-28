'use client'

import { useState } from 'react'
import { XCircle, ArrowRight, Trophy, RotateCcw } from 'lucide-react'
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

  const totalQuestions = data.questions.length
  const currentQuestion = data.questions[currentIndex]
  const progressPercent = (currentIndex / totalQuestions) * 100

  function handleSelect(optIndex: number) {
    if (submitting || result) return
    setSelectedOption(optIndex)
  }

  function handleNext() {
    if (selectedOption === null) return
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
    try {
      const res = await onComplete(finalAnswers)
      setResult(res)
    } finally {
      setSubmitting(false)
    }
  }

  function handleRetry() {
    setCurrentIndex(0)
    setSelectedOption(null)
    setAnswers({})
    setResult(null)
  }

  if (result) {
    const { passed: finalPassed, score: finalScore, correctCount, totalCount } = result
    return (
      <div className="max-w-xl mx-auto py-8">
        <div className={cn(
          'rounded-2xl p-10 text-center border',
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
            {!finalPassed && ` — Il faut ${passScore}% pour reussir.`}
          </p>
          {!finalPassed && (
            <button type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              <RotateCcw size={14} />
              Reessayer
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-4">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm font-medium">
            Question {currentIndex + 1} sur {totalQuestions}
          </span>
          <span className="text-slate-500 text-sm">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
        <h3 className="text-white text-lg font-bold mb-8 leading-relaxed">
          {currentQuestion.text}
        </h3>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option, optIdx) => {
            const isSelected = selectedOption === optIdx

            let optionClasses = 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
            if (isSelected) {
              optionClasses = 'bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500/50'
            }

            return (
              <button type="button"
                key={`${currentQuestion.text}-${option.text}-${optIdx}`}
                onClick={() => handleSelect(optIdx)}
                disabled={submitting}
                className={cn(
                  'w-full text-left px-5 py-4 rounded-xl border text-sm font-medium transition-all flex items-center gap-3',
                  optionClasses,
                  submitting && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className="flex-1">{option.text}</span>
              </button>
            )
          })}
        </div>

        {/* Action button */}
        <div className="mt-8 flex justify-end">
          <button type="button"
            onClick={handleNext}
            disabled={selectedOption === null || submitting}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            {submitting ? 'Validation...' : (currentIndex < totalQuestions - 1 ? 'Continuer' : 'Voir le resultat')}
            {!submitting && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
