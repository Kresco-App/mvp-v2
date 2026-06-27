'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  sentence: string
  answer: string
  hint?: string
  onComplete?: (correct: boolean) => void
}

const activityControlMotionClass = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'

export default function FillInBlank({ sentence, answer, hint, onComplete }: Props) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isCorrect = input.trim().toLowerCase() === answer.trim().toLowerCase()

  const parts = sentence.split('{{blank}}')

  function handleSubmit() {
    if (!input.trim()) return
    setSubmitted(true)
    onComplete?.(isCorrect)
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-6">
      <p className="font-semibold text-slate-300 text-sm tracking-wide uppercase">Completez la phrase :</p>

      <div className="text-white leading-relaxed text-base flex items-center flex-wrap gap-1.5">
        <span>{parts[0]}</span>
        <input
          aria-label="Réponse à compléter"
          value={input}
          onChange={e => !submitted && setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !submitted && handleSubmit()}
          placeholder="..."
          className={`inline-block min-w-[100px] max-w-[200px] border-b-2 bg-transparent px-3 py-1 text-center text-sm font-semibold outline-none transition-[border-color,box-shadow,color] duration-150 ease-out focus-visible:ring-4 focus-visible:ring-indigo-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none ${
            !submitted ? 'border-indigo-500 text-indigo-400 focus:border-indigo-400' :
            isCorrect ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'
          }`}
        />
        {parts[1] && <span>{parts[1]}</span>}
      </div>

      {hint && !submitted && (
        <p className="text-sm text-slate-500">Indice : {hint}</p>
      )}

      {submitted && (
        <div className={`flex items-center gap-2 text-sm font-medium p-4 rounded-xl ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {isCorrect ? 'Correct !' : `Faux — la reponse est "${answer}"`}
        </div>
      )}

      <div className="flex gap-3">
        {!submitted ? (
          <button type="button"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className={`min-h-10 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 ${activityControlMotionClass}`}
          >
            Verifier
          </button>
        ) : (
          <button type="button"
            onClick={() => { setInput(''); setSubmitted(false) }}
            className={`min-h-10 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 ${activityControlMotionClass}`}
          >
            Reessayer
          </button>
        )}
      </div>
    </div>
  )
}
