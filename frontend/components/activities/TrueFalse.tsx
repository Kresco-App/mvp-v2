'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  statement: string
  isTrue: boolean
  explanation?: string
  onComplete?: (correct: boolean) => void
}

const activityControlMotionClass = 'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'

export default function TrueFalse({ statement, isTrue, explanation, onComplete }: Props) {
  const [answer, setAnswer] = useState<boolean | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const correct = answer === isTrue

  function handleAnswer(val: boolean) {
    if (submitted) return
    setAnswer(val)
    setSubmitted(true)
    onComplete?.(val === isTrue)
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-6">
      <p className="font-semibold text-slate-300 text-sm tracking-wide uppercase">Vrai ou Faux ?</p>
      <div className="bg-slate-800/60 rounded-xl p-5">
        <p className="text-white leading-relaxed text-base">{statement}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[true, false].map(val => {
          const label = val ? 'Vrai' : 'Faux'
          const isSelected = answer === val
          const isRight = submitted && val === isTrue
          const isWrong = submitted && isSelected && val !== isTrue

          return (
            <button type="button"
              key={label}
              onClick={() => handleAnswer(val)}
              disabled={submitted}
              className={`rounded-xl border-2 py-4 text-sm font-bold ${activityControlMotionClass} ${
                submitted
                  ? isRight ? 'border-green-500 bg-green-500/15 text-green-400'
                  : isWrong ? 'border-red-500 bg-red-500/15 text-red-400'
                  : 'border-slate-700 text-slate-500'
                : 'border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-400 text-slate-300'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {submitted && (
        <>
          <div className={`flex items-center gap-2 text-sm font-medium p-4 rounded-xl ${correct ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {correct ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            {correct ? 'Correct !' : `Faux — la reponse est ${isTrue ? 'Vrai' : 'Faux'}`}
          </div>
          {explanation && (
            <p className="text-sm text-slate-400 bg-slate-800/60 rounded-xl px-5 py-4 leading-relaxed">
              {explanation}
            </p>
          )}
          <button type="button"
            onClick={() => { setAnswer(null); setSubmitted(false) }}
            className={`min-h-10 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 ${activityControlMotionClass}`}
          >
            Reessayer
          </button>
        </>
      )}
    </div>
  )
}
