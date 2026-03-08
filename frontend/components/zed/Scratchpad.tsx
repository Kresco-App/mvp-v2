'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2, Calculator } from 'lucide-react'
import 'katex/dist/katex.min.css'

const STORAGE_KEY = 'kresco_zed_scratchpad'

interface PinnedSnippet {
  id: string
  content: string
  type: 'text' | 'image'
}

interface Props {
  pinnedSnippets: PinnedSnippet[]
  onRemoveSnippet: (id: string) => void
}

export default function Scratchpad({ pinnedSnippets, onRemoveSnippet }: Props) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try { setHistory(JSON.parse(saved)) } catch {}
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    }
  }, [history])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  function evaluate(expr: string): string {
    try {
      // Basic safe math evaluation
      const sanitized = expr
        .replace(/\^/g, '**')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/log\(/g, 'Math.log(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/abs\(/g, 'Math.abs(')
        .replace(/pi/g, 'Math.PI')
        .replace(/e(?![a-z])/g, 'Math.E')

      // Only allow math characters
      if (/[^0-9+\-*/().%\s,Math.sqrtsincoanglobEPI]/.test(sanitized.replace(/Math\.\w+/g, ''))) {
        return 'Expression invalide'
      }

      const result = Function('"use strict"; return (' + sanitized + ')')()
      if (typeof result === 'number') {
        return Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '')
      }
      return String(result)
    } catch {
      return 'Erreur'
    }
  }

  function handleSubmit() {
    if (!input.trim()) return
    const result = evaluate(input.trim())
    setHistory(prev => [...prev, { expr: input.trim(), result }])
    setInput('')
  }

  function clearHistory() {
    setHistory([])
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Calculator size={14} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-400">Brouillon / Calculs</span>
        </div>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-slate-500 hover:text-red-400 transition p-1"
            title="Effacer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Pinned snippets from PDF */}
      {pinnedSnippets.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-800 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Epingles</p>
          {pinnedSnippets.map(snippet => (
            <div key={snippet.id} className="relative group">
              {snippet.type === 'image' ? (
                <img src={snippet.content} alt="Snippet" className="rounded-lg max-h-32 w-auto" />
              ) : (
                <div className="bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300">
                  {snippet.content}
                </div>
              )}
              <button
                onClick={() => onRemoveSnippet(snippet.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
              >
                <Trash2 size={10} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Calculation history */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {history.length === 0 && (
          <div className="text-center py-8">
            <p className="text-slate-400 text-sm">Aucun calcul</p>
            <p className="text-slate-300 text-xs mt-1">Tapez une expression ci-dessous</p>
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className="space-y-0.5">
            <p className="text-xs text-slate-500 font-mono">{entry.expr}</p>
            <p className={`text-sm font-mono font-bold ${entry.result === 'Erreur' || entry.result === 'Expression invalide' ? 'text-red-400' : 'text-indigo-300'}`}>
              = {entry.result}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Ex: sqrt(144) + 3^2"
            className="flex-1 bg-slate-800 border border-slate-700 text-white text-sm font-mono px-3 py-2 rounded-lg outline-none focus:border-indigo-500 transition placeholder:text-slate-400"
          />
          <button
            onClick={handleSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            =
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">sqrt, sin, cos, tan, log, pi, ^ supportes</p>
      </div>
    </div>
  )
}
