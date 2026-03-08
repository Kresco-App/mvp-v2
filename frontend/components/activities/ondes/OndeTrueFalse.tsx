'use client'

/**
 * OndeTrueFalse — Sequence of True/False questions for wave concepts.
 *
 * Activity data shape:
 * {
 *   statements: [
 *     { statement: "Une onde mécanique peut se propager dans le vide", isTrue: false, explanation: "..." },
 *     { statement: "La longueur d'onde est la distance parcourue en une période", isTrue: true },
 *   ]
 * }
 */

import { useState } from 'react'
import TrueFalse from '../TrueFalse'

interface Statement {
  statement: string
  isTrue: boolean
  explanation?: string
}

interface Props {
  statements?: Statement[]
  onComplete?: (correct: boolean) => void
}

const DEFAULT_STATEMENTS: Statement[] = [
  {
    statement: 'Une onde mécanique peut se propager dans le vide.',
    isTrue: false,
    explanation: 'Une onde mécanique a besoin d\'un milieu matériel (solide, liquide, gaz). Seules les ondes électromagnétiques se propagent dans le vide.',
  },
  {
    statement: 'La longueur d\'onde λ est la distance parcourue en une période T.',
    isTrue: true,
    explanation: 'λ = v × T, donc λ est bien la distance parcourue par l\'onde en une période.',
  },
  {
    statement: 'Doubler la fréquence divise la période par 2.',
    isTrue: true,
    explanation: 'T = 1/f, donc si f double, T est divisée par 2.',
  },
  {
    statement: 'L\'intensité d\'une onde sonore augmente avec la distance à la source.',
    isTrue: false,
    explanation: 'L\'intensité diminue avec la distance (inverse du carré de la distance en espace libre).',
  },
]

export default function OndeTrueFalse({ statements, onComplete }: Props) {
  const qs = statements ?? DEFAULT_STATEMENTS
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  function handleAnswer(correct: boolean) {
    if (correct) setScore(s => s + 1)
    setTimeout(() => {
      if (idx < qs.length - 1) {
        setIdx(i => i + 1)
      } else {
        setDone(true)
        onComplete?.(score + (correct ? 1 : 0) === qs.length)
      }
    }, 1500)
  }

  if (done) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center space-y-3">
        <p className="text-white text-xl font-bold">{score === qs.length ? 'Parfait !' : 'Série terminée'}</p>
        <p className="text-slate-400">{score} / {qs.length} correctes</p>
        <button
          onClick={() => { setIdx(0); setScore(0); setDone(false) }}
          className="border border-slate-700 text-slate-300 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition"
        >
          Recommencer
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Ondes — Vrai ou Faux</p>
        <span className="text-xs text-slate-500">{idx + 1} / {qs.length}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(idx / qs.length) * 100}%` }} />
      </div>
      <TrueFalse
        key={idx}
        statement={qs[idx].statement}
        isTrue={qs[idx].isTrue}
        explanation={qs[idx].explanation}
        onComplete={handleAnswer}
      />
    </div>
  )
}
