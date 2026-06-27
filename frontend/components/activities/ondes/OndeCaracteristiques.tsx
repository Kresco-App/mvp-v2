'use client'

/**
 * OndeCaracteristiques — Fill-in-the-blank for wave formula/properties.
 *
 * Activity data shape:
 * {
 *   questions: [
 *     { sentence: "La célérité d'une onde est v = λ × {{blank}}", answer: "f", hint: "fréquence" },
 *     { sentence: "La période T et la fréquence f sont liées par T = {{blank}} / f", answer: "1", hint: "nombre entier" },
 *   ]
 * }
 */

import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronRight } from 'lucide-react'

interface Question {
  sentence: string
  answer: string
  hint?: string
  explanation?: string
}

interface Props {
  questions?: Question[]
  onComplete?: (correct: boolean) => void
}

const DEFAULT_QUESTIONS: Question[] = [
  {
    sentence: 'La célérité est liée à la longueur d\'onde et la fréquence : v = λ × {{blank}}',
    answer: 'f',
    hint: 'fréquence (symbole d\'une lettre)',
    explanation: 'v = λ × f  où λ est la longueur d\'onde en mètre et f la fréquence en Hz.',
  },
  {
    sentence: 'La période T et la fréquence f sont reliées par : T = {{blank}} / f',
    answer: '1',
    hint: 'Un nombre entier',
    explanation: 'T = 1/f, donc si f = 50 Hz alors T = 0,02 s.',
  },
  {
    sentence: 'Lors de la propagation d\'une onde mécanique, c\'est l\'{{blank}} qui se propage, pas la matière.',
    answer: 'énergie',
    hint: 'ce qui est transporté',
    explanation: 'La matière oscille sur place — seule l\'énergie avance.',
  },
]

const waveControlMotionClass = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'

export default function OndeCaracteristiques({ questions, onComplete }: Props) {
  const qs = questions ?? DEFAULT_QUESTIONS
  const [idx, setIdx] = useState(0)
  const [inputs, setInputs] = useState<string[]>(qs.map(() => ''))
  const [submitted, setSubmitted] = useState<boolean[]>(qs.map(() => false))
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const current = qs[idx]
  const parts = current.sentence.split('{{blank}}')
  const isCorrect = inputs[idx].trim().toLowerCase() === current.answer.trim().toLowerCase()

  function submit() {
    if (!inputs[idx].trim()) return
    const correct = inputs[idx].trim().toLowerCase() === current.answer.trim().toLowerCase()
    const newSubmitted = [...submitted]
    newSubmitted[idx] = true
    setSubmitted(newSubmitted)
    if (correct) setScore(s => s + 1)
  }

  function next() {
    if (idx < qs.length - 1) {
      setIdx(i => i + 1)
    } else {
      setDone(true)
      const finalScore = score + (isCorrect ? 1 : 0)
      onComplete?.(finalScore === qs.length)
    }
  }

  if (done) {
    const finalScore = submitted.filter(Boolean).length > 0 ? score : 0
    const allCorrect = finalScore === qs.length
    return (
      <div className={`bg-slate-900 rounded-2xl border p-8 text-center space-y-4 ${allCorrect ? 'border-green-500/30' : 'border-red-500/30'}`}>
        {allCorrect ? <CheckCircle2 size={40} className="text-green-400 mx-auto" /> : <XCircle size={40} className="text-red-400 mx-auto" />}
        <p className="text-white text-xl font-bold">{allCorrect ? 'Parfait !' : 'Continuez à travailler'}</p>
        <p className="text-slate-400">{score} / {qs.length} correctes</p>
        <button type="button"
          onClick={() => { setIdx(0); setInputs(qs.map(() => '')); setSubmitted(qs.map(() => false)); setScore(0); setDone(false) }}
          className={`min-h-10 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 ${waveControlMotionClass}`}
        >
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-300 text-sm tracking-wide uppercase">Complétez la formule</p>
        <span className="text-xs text-slate-500">{idx + 1} / {qs.length}</span>
      </div>

      {/* Sentence with inline input */}
      <div className="text-white text-base leading-relaxed flex flex-wrap items-center gap-1.5 bg-slate-800/60 rounded-xl p-5">
        <span>{parts[0]}</span>
        <input
          aria-label="Réponse formule"
          key={current.sentence}
          value={inputs[idx]}
          onChange={e => {
            if (submitted[idx]) return
            const v = [...inputs]; v[idx] = e.target.value; setInputs(v)
          }}
          onKeyDown={e => e.key === 'Enter' && !submitted[idx] && submit()}
          placeholder="___"
          className={`inline-block min-w-[80px] max-w-[150px] border-b-2 bg-transparent px-2 py-0.5 text-center text-sm font-bold outline-none transition-[border-color,box-shadow,color] duration-150 ease-out focus-visible:ring-4 focus-visible:ring-indigo-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none ${
            !submitted[idx] ? 'border-indigo-500 text-indigo-300' :
            isCorrect ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'
          }`}
        />
        {parts[1] && <span>{parts[1]}</span>}
      </div>

      {current.hint && !submitted[idx] && (
        <p className="text-sm text-slate-500">Indice : {current.hint}</p>
      )}

      {submitted[idx] && (
        <div className={`flex items-start gap-3 p-4 rounded-xl ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {isCorrect ? <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" /> : <XCircle size={18} className="flex-shrink-0 mt-0.5" />}
          <div>
            <p className="font-medium text-sm">{isCorrect ? 'Correct !' : `Faux — la réponse est "${current.answer}"`}</p>
            {current.explanation && <p className="text-xs mt-1 opacity-80">{current.explanation}</p>}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        {!submitted[idx] ? (
          <button type="button"
            onClick={submit}
            disabled={!inputs[idx].trim()}
            className={`min-h-10 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 ${waveControlMotionClass}`}
          >
            Vérifier
          </button>
        ) : (
          <button type="button"
            onClick={next}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 ${waveControlMotionClass}`}
          >
            {idx < qs.length - 1 ? 'Question suivante' : 'Voir le résultat'}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
