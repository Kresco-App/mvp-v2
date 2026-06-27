'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Exercise {
  id: string
  question: string
  expression?: string
  options: string[]
  correctOption: string
  explanation?: string
}

interface Props {
  title?: string
  prompt?: string
  exercises?: Exercise[]
  onComplete?: (correct: boolean) => void
}

const DEFAULT_EXERCISES: Exercise[] = [
  {
    id: 'l1',
    question: 'Quelle est la limite de f(x) = 2x + 1 quand x tend vers +infini ?',
    options: ['+infini', '0', '1/2', '-infini'],
    correctOption: '+infini',
    explanation: 'Une fonction affine de pente positive tend vers +infini quand x tend vers +infini.',
  },
  {
    id: 'l2',
    question: 'Pour f(x) = x^2 - 1, que vaut lim f(x) quand x tend vers 1 ?',
    options: ['0', '1', '2', 'n existe pas'],
    correctOption: '0',
    explanation: 'Une fonction polynomiale est continue : on remplace x par 1.',
  },
  {
    id: 'l3',
    question: 'Si lim f(x) = 3 quand x tend vers 2 et f(2) = 3, alors f est ... en x = 2.',
    options: ['continue', 'derivable', 'impaire', 'periodique'],
    correctOption: 'continue',
    explanation: 'La continuite en 2 exige lim f(x) = f(2).',
  },
]

const labControlMotionClass = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'

export default function LimitesContinuiteLab({
  title,
  prompt,
  exercises,
  onComplete,
}: Props) {
  const items = exercises ?? DEFAULT_EXERCISES
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)

  const current = items[index]
  const isCorrect = selected === current.correctOption

  function submit() {
    if (!selected || submitted) return
    setSubmitted(true)
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1)
    }
  }

  function next() {
    if (index < items.length - 1) {
      setIndex((prev) => prev + 1)
      setSelected(null)
      setSubmitted(false)
      return
    }

    const finalCorrect = correctCount + (isCorrect ? 1 : 0)
    setFinished(true)
    onComplete?.(finalCorrect === items.length)
  }

  function reset() {
    setIndex(0)
    setSelected(null)
    setSubmitted(false)
    setCorrectCount(0)
    setFinished(false)
  }

  if (finished) {
    const perfect = correctCount === items.length

    return (
      <div className={`rounded-2xl border p-8 text-center space-y-4 ${perfect ? 'border-green-500/30 bg-green-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        {perfect ? (
          <CheckCircle2 size={40} className="mx-auto text-green-400" />
        ) : (
          <XCircle size={40} className="mx-auto text-amber-400" />
        )}
        <div>
          <p className="text-white text-xl font-bold">{perfect ? 'Excellent' : 'Lab termine'}</p>
          <p className="text-slate-400 mt-1">{correctCount} / {items.length} bonnes reponses</p>
        </div>
        <button type="button"
          onClick={reset}
          className={`min-h-10 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 ${labControlMotionClass}`}
        >
          Reessayer
        </button>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Lab Limites</p>
          <h3 className="text-white font-bold text-lg mt-1">{title ?? 'Tester une limite ou une continuite'}</h3>
        </div>
        <span className="text-xs text-slate-500">{index + 1} / {items.length}</span>
      </div>

      <p className="text-slate-400 text-sm">
        {prompt ?? 'Choisissez la reponse correcte pour chaque situation.'}
      </p>

      <div className="rounded-2xl bg-slate-800/60 p-6">
        <p className="text-white text-base font-semibold leading-relaxed">{current.question}</p>
        {current.expression && <p className="text-indigo-300 text-sm mt-3">{current.expression}</p>}
      </div>

      <div className="space-y-3">
        {current.options.map((option) => {
          const active = selected === option
          const correctChoice = submitted && option === current.correctOption
          const wrongChoice = submitted && active && option !== current.correctOption

          return (
            <button type="button"
              key={option}
              onClick={() => !submitted && setSelected(option)}
              className={[
                `w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-medium ${labControlMotionClass}`,
                submitted
                  ? correctChoice
                    ? 'border-green-500/60 bg-green-500/15 text-green-300'
                    : wrongChoice
                      ? 'border-red-500/60 bg-red-500/15 text-red-300'
                      : 'border-slate-700 text-slate-500'
                  : active
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                    : 'border-slate-700 text-slate-200 hover:border-indigo-500/40 hover:bg-slate-800',
              ].join(' ')}
            >
              {option}
            </button>
          )
        })}
      </div>

      {submitted && (
        <div className={`rounded-xl p-4 text-sm ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          <p className="font-medium">{isCorrect ? 'Bonne reponse' : `La bonne reponse etait "${current.correctOption}"`}</p>
          {current.explanation && <p className="mt-1 opacity-90">{current.explanation}</p>}
        </div>
      )}

      <div className="flex gap-3">
        {!submitted ? (
          <button type="button"
            onClick={submit}
            disabled={!selected}
            className={`min-h-10 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 ${labControlMotionClass}`}
          >
            Verifier
          </button>
        ) : (
          <button type="button"
            onClick={next}
            className={`min-h-10 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 ${labControlMotionClass}`}
          >
            {index < items.length - 1 ? 'Question suivante' : 'Voir le resultat'}
          </button>
        )}
      </div>
    </div>
  )
}
