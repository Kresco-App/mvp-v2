'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface SetOption {
  id: string
  label: string
}

interface Challenge {
  id: string
  value: string
  correctSet: string
  explanation?: string
}

interface Props {
  title?: string
  prompt?: string
  sets?: SetOption[]
  challenges?: Challenge[]
  onComplete?: (correct: boolean) => void
}

const DEFAULT_SETS: SetOption[] = [
  { id: 'N', label: 'N' },
  { id: 'Z', label: 'Z' },
  { id: 'Q', label: 'Q' },
  { id: 'R', label: 'R' },
]

const DEFAULT_CHALLENGES: Challenge[] = [
  { id: 'c1', value: '7', correctSet: 'N', explanation: '7 est un entier naturel.' },
  { id: 'c2', value: '-4', correctSet: 'Z', explanation: '-4 est entier relatif, mais pas naturel.' },
  { id: 'c3', value: '3/5', correctSet: 'Q', explanation: '3/5 est un rationnel.' },
  { id: 'c4', value: 'sqrt(2)', correctSet: 'R', explanation: 'sqrt(2) est reel irrationnel.' },
]

export default function EnsemblesLab({
  title,
  prompt,
  sets,
  challenges,
  onComplete,
}: Props) {
  const setOptions = sets ?? DEFAULT_SETS
  const exercises = challenges ?? DEFAULT_CHALLENGES
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)

  const current = exercises[index]
  const isCorrect = selected === current.correctSet
  const score = useMemo(
    () => Math.round((correctCount / exercises.length) * 100),
    [correctCount, exercises.length]
  )

  function submit() {
    if (!selected || submitted) return
    setSubmitted(true)
    if (selected === current.correctSet) {
      setCorrectCount((prev) => prev + 1)
    }
  }

  function next() {
    if (index < exercises.length - 1) {
      setIndex((prev) => prev + 1)
      setSelected(null)
      setSubmitted(false)
      return
    }

    const finalCorrect = correctCount + (isCorrect ? 1 : 0)
    setFinished(true)
    onComplete?.(finalCorrect === exercises.length)
  }

  function reset() {
    setIndex(0)
    setSelected(null)
    setSubmitted(false)
    setCorrectCount(0)
    setFinished(false)
  }

  if (finished) {
    const perfect = score === 100

    return (
      <div className={`rounded-2xl border p-8 text-center space-y-4 ${perfect ? 'border-green-500/30 bg-green-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        {perfect ? (
          <CheckCircle2 size={40} className="mx-auto text-green-400" />
        ) : (
          <XCircle size={40} className="mx-auto text-amber-400" />
        )}
        <div>
          <p className="text-white text-xl font-bold">{perfect ? 'Classification parfaite' : 'Serie terminee'}</p>
          <p className="text-slate-400 mt-1">{correctCount} / {exercises.length} bonnes reponses</p>
        </div>
        <button
          onClick={reset}
          className="border border-slate-700 text-slate-300 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition"
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
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Lab Ensembles</p>
          <h3 className="text-white font-bold text-lg mt-1">{title ?? 'Classer un nombre dans le bon ensemble'}</h3>
        </div>
        <span className="text-xs text-slate-500">{index + 1} / {exercises.length}</span>
      </div>

      <p className="text-slate-400 text-sm">
        {prompt ?? 'Choisissez le plus petit ensemble numerique auquel appartient la valeur proposee.'}
      </p>

      <div className="bg-slate-800/60 rounded-2xl p-6 text-center">
        <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Valeur</p>
        <p className="text-white text-3xl font-bold">{current.value}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {setOptions.map((option) => {
          const active = selected === option.id
          const correctChoice = submitted && option.id === current.correctSet
          const wrongChoice = submitted && active && option.id !== current.correctSet

          return (
            <button
              key={option.id}
              onClick={() => !submitted && setSelected(option.id)}
              className={[
                'rounded-xl border-2 px-4 py-4 text-sm font-semibold transition',
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
              {option.label}
            </button>
          )
        })}
      </div>

      {submitted && (
        <div className={`rounded-xl p-4 text-sm ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          <p className="font-medium">{isCorrect ? 'Correct' : `La bonne reponse etait ${current.correctSet}`}</p>
          {current.explanation && <p className="mt-1 opacity-90">{current.explanation}</p>}
        </div>
      )}

      <div className="flex gap-3">
        {!submitted ? (
          <button
            onClick={submit}
            disabled={!selected}
            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Verifier
          </button>
        ) : (
          <button
            onClick={next}
            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition"
          >
            {index < exercises.length - 1 ? 'Question suivante' : 'Voir le resultat'}
          </button>
        )}
      </div>
    </div>
  )
}
