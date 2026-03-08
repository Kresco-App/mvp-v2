'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, ArrowRight, Trophy, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuizOption {
  text: string
  is_correct: boolean
}

interface QuizQuestion {
  text: string
  options: QuizOption[]
}

interface QuizData {
  questions: QuizQuestion[]
}

interface Props {
  data: QuizData
  passScore: number
  onComplete: (score: number, passed: boolean, correctCount: number, totalQuestions: number) => void
}

export default function SectionQuiz({ data, passScore, onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)

  const totalQuestions = data.questions.length
  const currentQuestion = data.questions[currentIndex]
  const progressPercent = ((currentIndex + (submitted ? 1 : 0)) / totalQuestions) * 100

  function handleSelect(optIndex: number) {
    if (submitted) return
    setSelectedOption(optIndex)
  }

  function handleSubmitAnswer() {
    if (selectedOption === null) return
    setSubmitted(true)
    if (currentQuestion.options[selectedOption].is_correct) {
      setCorrectCount(prev => prev + 1)
    }
  }

  function handleNext() {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedOption(null)
      setSubmitted(false)
    } else {
      const score = Math.round((correctCount / totalQuestions) * 100)
      const passed = score >= passScore
      setFinished(true)
      onComplete(score, passed, correctCount, totalQuestions)
    }
  }

  function handleRetry() {
    setCurrentIndex(0)
    setSelectedOption(null)
    setSubmitted(false)
    setCorrectCount(0)
    setFinished(false)
  }

  const finalScore = Math.round((correctCount / totalQuestions) * 100)
  const finalPassed = finalScore >= passScore

  // Final score screen
  if (finished) {
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
            {correctCount} correct{correctCount > 1 ? 's' : ''} sur {totalQuestions} questions
            {!finalPassed && ` — Il faut ${passScore}% pour reussir.`}
          </p>
          {!finalPassed && (
            <button
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
            const isCorrect = option.is_correct

            let optionClasses = 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
            if (isSelected && !submitted) {
              optionClasses = 'bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500/50'
            }
            if (submitted && isCorrect) {
              optionClasses = 'bg-green-500/15 border-green-500/60 text-green-300'
            }
            if (submitted && isSelected && !isCorrect) {
              optionClasses = 'bg-red-500/15 border-red-500/60 text-red-300'
            }

            return (
              <button
                key={optIdx}
                onClick={() => handleSelect(optIdx)}
                disabled={submitted}
                className={cn(
                  'w-full text-left px-5 py-4 rounded-xl border text-sm font-medium transition-all flex items-center gap-3',
                  optionClasses,
                  submitted && 'cursor-default'
                )}
              >
                <span className="flex-1">{option.text}</span>
                {submitted && isCorrect && <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />}
                {submitted && isSelected && !isCorrect && <XCircle size={18} className="text-red-400 flex-shrink-0" />}
              </button>
            )
          })}
        </div>

        {/* Action button */}
        <div className="mt-8 flex justify-end">
          {!submitted ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={selectedOption === null}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Verifier
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              {currentIndex < totalQuestions - 1 ? 'Continuer' : 'Voir le resultat'}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
