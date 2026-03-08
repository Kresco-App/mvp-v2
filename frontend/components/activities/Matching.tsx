'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Pair {
  id: string
  left: string
  right: string
}

interface Props {
  question: string
  pairs: Pair[]
  onComplete?: (correct: boolean) => void
}

export default function Matching({ question, pairs, onComplete }: Props) {
  const shuffledRight = [...pairs].sort(() => Math.random() - 0.5)
  const [rightItems] = useState(shuffledRight)
  const [selected, setSelected] = useState<{ leftId: string | null; rightId: string | null }>({ leftId: null, rightId: null })
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  function selectLeft(id: string) {
    if (submitted || matches[id]) return
    setSelected(s => ({ ...s, leftId: id }))
  }

  function selectRight(id: string) {
    if (submitted) return
    if (!selected.leftId) {
      setSelected(s => ({ ...s, rightId: id }))
      return
    }
    const alreadyMapped = Object.values(matches).includes(id)
    if (alreadyMapped) return
    setMatches(m => ({ ...m, [selected.leftId!]: id }))
    setSelected({ leftId: null, rightId: null })
  }

  function removeMatch(leftId: string) {
    if (submitted) return
    setMatches(m => { const n = { ...m }; delete n[leftId]; return n })
  }

  function handleSubmit() {
    const allCorrect = pairs.every(p => matches[p.id] === p.id + '_right')
    setSubmitted(true)
    onComplete?.(allCorrect)
  }

  const matchedRightIds = Object.values(matches)
  const allMatched = Object.keys(matches).length === pairs.length

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-6">
      <p className="font-semibold text-slate-300 text-sm tracking-wide uppercase">Associez les elements :</p>
      <p className="text-white text-base">{question}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-medium mb-1">Elements</p>
          {pairs.map(pair => {
            const matchedRightId = matches[pair.id]
            const isCorrect = submitted && matchedRightId === pair.id + '_right'
            const isWrong = submitted && matchedRightId && matchedRightId !== pair.id + '_right'
            return (
              <button
                key={pair.id}
                onClick={() => matchedRightId ? removeMatch(pair.id) : selectLeft(pair.id)}
                className={`w-full text-left text-sm px-4 py-3 rounded-xl border-2 transition font-medium ${
                  selected.leftId === pair.id ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' :
                  submitted
                    ? isCorrect ? 'border-green-500/50 bg-green-500/10 text-green-300'
                    : isWrong ? 'border-red-500/50 bg-red-500/10 text-red-300'
                    : 'border-slate-700 text-slate-500'
                  : matchedRightId ? 'border-slate-600 bg-slate-800/50 text-slate-400'
                  : 'border-slate-700 hover:border-indigo-500/40 text-slate-200'
                }`}
              >
                {pair.left}
                {matchedRightId && !submitted && (
                  <span className="text-[10px] text-slate-500 block mt-1">Cliquez pour dissocier</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right column */}
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-medium mb-1">Correspondances</p>
          {rightItems.map(pair => {
            const rightId = pair.id + '_right'
            const isMatched = matchedRightIds.includes(rightId)
            const matchedLeftId = Object.keys(matches).find(k => matches[k] === rightId)
            const isCorrect = submitted && matchedLeftId === pair.id
            const isWrong = submitted && isMatched && matchedLeftId !== pair.id
            return (
              <button
                key={rightId}
                onClick={() => selectRight(rightId)}
                disabled={isMatched}
                className={`w-full text-left text-sm px-4 py-3 rounded-xl border-2 transition font-medium ${
                  submitted
                    ? isCorrect ? 'border-green-500/50 bg-green-500/10 text-green-300'
                    : isWrong ? 'border-red-500/50 bg-red-500/10 text-red-300'
                    : 'border-slate-700 text-slate-500'
                  : isMatched ? 'border-slate-700 bg-slate-800/50 text-slate-500 cursor-not-allowed'
                  : selected.leftId ? 'border-indigo-500/40 hover:border-indigo-500 hover:bg-indigo-500/10 text-slate-200'
                  : 'border-slate-700 text-slate-200'
                }`}
              >
                {pair.right}
              </button>
            )
          })}
        </div>
      </div>

      {submitted && (
        <div className={`flex items-center gap-2 text-sm font-medium p-4 rounded-xl ${
          pairs.every(p => matches[p.id] === p.id + '_right') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {pairs.every(p => matches[p.id] === p.id + '_right') ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {pairs.every(p => matches[p.id] === p.id + '_right') ? 'Toutes les paires sont correctes !' : 'Certaines paires sont incorrectes.'}
        </div>
      )}

      <div className="flex gap-3">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!allMatched}
            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Verifier
          </button>
        ) : (
          <button
            onClick={() => { setMatches({}); setSubmitted(false) }}
            className="border border-slate-700 text-slate-300 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition"
          >
            Reessayer
          </button>
        )}
      </div>
    </div>
  )
}
