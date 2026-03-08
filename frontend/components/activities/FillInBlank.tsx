'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  sentence: string
  answer: string
  hint?: string
  onComplete?: (correct: boolean) => void
}

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
          value={input}
          onChange={e => !submitted && setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !submitted && handleSubmit()}
          placeholder="..."
          className={`inline-block border-b-2 px-3 py-1 text-center font-semibold text-sm outline-none min-w-[100px] max-w-[200px] bg-transparent transition ${
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
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Verifier
          </button>
        ) : (
          <button
            onClick={() => { setInput(''); setSubmitted(false) }}
            className="border border-slate-700 text-slate-300 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition"
          >
            Reessayer
          </button>
        )}
      </div>
    </div>
  )
}
