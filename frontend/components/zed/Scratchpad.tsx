'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { CornerDownLeft, Pin, Trash2, Calculator } from 'lucide-react'
import 'katex/dist/katex.min.css'
import { evaluateMathExpression } from '@/lib/zedMath'

interface PinnedSnippet {
  id: string
  content: string
  type: 'text' | 'image'
}

interface Props {
  pinnedSnippets: PinnedSnippet[]
  onRemoveSnippet: (id: string) => void
  storageKey: string
}

export default function Scratchpad({ pinnedSnippets, onRemoveSnippet, storageKey }: Props) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([])
  const [storageHydrated, setStorageHydrated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasInput = input.trim().length > 0

  useEffect(() => {
    setStorageHydrated(false)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try { setHistory(JSON.parse(saved)) } catch {}
      } else {
        setHistory([])
      }
    }
    setStorageHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (typeof window !== 'undefined' && storageHydrated) {
      localStorage.setItem(storageKey, JSON.stringify(history))
    }
  }, [history, storageHydrated, storageKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  function evaluate(expr: string): string {
    return evaluateMathExpression(expr)
  }

  function handleSubmit() {
    const expr = input.trim()
    if (!expr) return
    const result = evaluate(expr)
    setHistory(prev => [...prev, { expr, result }])
    setInput('')
  }

  function clearHistory() {
    setHistory([])
  }

  return (
    <div className="flex h-full flex-col bg-stone-50 text-slate-900">
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            <Calculator size={15} />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">Notes d&apos;etude</p>
            <p className="text-[11px] leading-tight text-slate-500">Brouillon et calculs rapides</p>
          </div>
        </div>
        {history.length > 0 && (
          <button type="button"
            onClick={clearHistory}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            title="Effacer"
            aria-label="Effacer l'historique"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Pinned snippets from PDF */}
      {pinnedSnippets.length > 0 && (
        <div className="space-y-2 border-b border-stone-200 bg-amber-50/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              <Pin size={12} />
              Epingles
            </p>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-stone-200">
              {pinnedSnippets.length}
            </span>
          </div>
          <div className="space-y-2">
            {pinnedSnippets.map(snippet => (
              <div key={snippet.id} className="group relative rounded-lg border border-stone-200 bg-white p-2 shadow-sm">
                {snippet.type === 'image' ? (
                  <Image
                    src={snippet.content}
                    alt="Extrait epingle"
                    width={320}
                    height={144}
                    sizes="320px"
                    className="max-h-36 w-full rounded-md object-contain"
                  />
                ) : (
                  <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-stone-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
                    {snippet.content}
                  </div>
                )}
                <button type="button"
                  onClick={() => onRemoveSnippet(snippet.id)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-400 opacity-0 shadow-sm ring-1 ring-stone-200 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                  title="Retirer l'epingle"
                  aria-label="Retirer l'epingle"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calculation history */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {history.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">Aucun calcul</p>
            <p className="mt-1 text-xs text-slate-500">Tapez une expression ci-dessous pour garder une trace.</p>
          </div>
        )}
        {history.map((entry, i) => {
          const isError = entry.result === 'Erreur'

          return (
            <div key={`${entry.expr}-${i}`} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words font-mono text-xs leading-relaxed text-slate-500">
                  {entry.expr}
                </p>
                <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  #{i + 1}
                </span>
              </div>
              <p className={`mt-1 break-words font-mono text-base font-semibold ${isError ? 'text-red-600' : 'text-emerald-700'}`}>
                = {entry.result}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-stone-200 bg-white px-4 py-3 shadow-[0_-1px_8px_rgba(15,23,42,0.04)]">
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-2 transition focus-within:border-amber-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Ex: sqrt(144) + 3^2"
            rows={3}
            className="max-h-32 min-h-20 w-full resize-none bg-transparent px-1 py-1 font-mono text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Expression mathematique"
          />
          <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2">
            <p className="min-w-0 text-[11px] leading-snug text-slate-500">
              sqrt, sin, cos, tan, ln, log, pi, e, ^ supportes
            </p>
            <button type="button"
              onClick={handleSubmit}
              disabled={!hasInput}
              className="flex h-8 min-w-12 items-center justify-center gap-1 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
              title="Calculer"
              aria-label="Calculer l'expression"
            >
              <span>=</span>
              <CornerDownLeft size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
