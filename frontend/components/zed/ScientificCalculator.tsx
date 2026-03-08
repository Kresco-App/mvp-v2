'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, GripVertical, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
  inline?: boolean
}

type HistoryEntry = { expr: string; result: string }

const BUTTONS = [
  // row 1
  ['sin(', 'cos(', 'tan(', '√(', 'x²'],
  // row 2
  ['ln(', 'log(', 'π', 'e', '^'],
  // row 3
  ['7', '8', '9', '÷', 'C'],
  // row 4
  ['4', '5', '6', '×', '←'],
  // row 5
  ['1', '2', '3', '−', '('],
  // row 6
  ['0', '.', '=', '+', ')'],
]

const ACCENT = new Set(['='])
const DANGER = new Set(['C'])
const MUTED = new Set(['←', '(', ')'])
const FUNC = new Set(['sin(', 'cos(', 'tan(', '√(', 'ln(', 'log(', 'π', 'e', '^', 'x²'])

function safeEval(expr: string): string {
  try {
    const cleaned = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, String(Math.PI))
      .replace(/\be\b/g, String(Math.E))
      .replace(/sin\(/g, 'Math.sin(')
      .replace(/cos\(/g, 'Math.cos(')
      .replace(/tan\(/g, 'Math.tan(')
      .replace(/ln\(/g, 'Math.log(')
      .replace(/log\(/g, 'Math.log10(')
      .replace(/√\(/g, 'Math.sqrt(')
      .replace(/\^/g, '**')
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + cleaned + ')')()
    if (typeof result !== 'number' || isNaN(result)) return 'Erreur'
    if (!isFinite(result)) return result > 0 ? '∞' : '-∞'
    // round to avoid floating point noise
    return parseFloat(result.toPrecision(12)).toString()
  } catch {
    return 'Erreur'
  }
}

export default function ScientificCalculator({ onClose, inline = false }: Props) {
  const [display, setDisplay] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [pos, setPos] = useState({ x: 80, y: 80 })
  const dragOffset = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Drag logic
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    }
  }, [pos])

  useEffect(() => {
    if (!isDragging) return
    const move = (e: MouseEvent) => {
      setPos({
        x: Math.max(0, e.clientX - dragOffset.current.x),
        y: Math.max(0, e.clientY - dragOffset.current.y),
      })
    }
    const up = () => setIsDragging(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [isDragging])

  function handleButton(val: string) {
    if (val === 'C') { setDisplay(''); return }
    if (val === '←') { setDisplay(d => d.slice(0, -1)); return }
    if (val === 'x²') { setDisplay(d => `(${d || '0'})^2`); return }

    if (val === '=') {
      if (!display) return
      const result = safeEval(display)
      setHistory(h => [{ expr: display, result }, ...h.slice(0, 19)])
      setDisplay(result === 'Erreur' ? display : result)
      return
    }

    setDisplay(d => d + val)
  }

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.offsetParent) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter') { handleButton('='); return }
      if (e.key === 'Backspace') { handleButton('←'); return }
      if ('0123456789+-*/.()^'.includes(e.key)) {
        setDisplay(d => d + e.key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display])

  return (
    <div
      ref={containerRef}
      style={inline ? undefined : { left: pos.x, top: pos.y }}
      className={inline ? 'select-none' : 'fixed z-[200] select-none'}
    >
      <div className={cn(
        'bg-slate-900 border border-slate-700 overflow-hidden flex flex-col',
        inline ? 'rounded-3xl w-full max-w-xl mx-auto shadow-sm' : 'rounded-3xl shadow-2xl w-[440px]'
      )}>
        {/* Header / drag handle */}
        <div
          onMouseDown={inline ? undefined : onMouseDown}
          className={cn(
            'flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950',
            !inline && 'cursor-grab active:cursor-grabbing'
          )}
        >
          <div className="flex items-center gap-2.5">
            <Calculator size={18} className="text-indigo-400" />
            <span className="text-slate-300 text-sm font-semibold">Calculatrice</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Display */}
        <div className="px-6 py-5 bg-slate-950/50">
          <div className="text-right text-slate-500 text-sm min-h-[20px] mb-2 truncate">
            {history[0] ? `${history[0].expr} =` : ''}
          </div>
          <div className="text-right text-white font-mono text-5xl font-light tracking-wider min-h-[56px] truncate">
            {display || '0'}
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-5 gap-2 p-5 bg-slate-900 border-t border-slate-800/50">
          {BUTTONS.flat().map((btn, i) => (
            <button
              key={i}
              onClick={() => handleButton(btn)}
              className={cn(
                'h-16 rounded-2xl text-lg font-semibold transition-all active:scale-[0.92] shadow-sm flex flex-col items-center justify-center',
                ACCENT.has(btn) && 'bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-500/50',
                DANGER.has(btn) && 'bg-red-500/10 hover:bg-red-500/20 text-red-400',
                MUTED.has(btn) && 'bg-slate-800 hover:bg-slate-750 text-slate-400',
                FUNC.has(btn) && 'bg-slate-800 hover:bg-slate-750 text-indigo-300 text-sm',
                !ACCENT.has(btn) && !DANGER.has(btn) && !MUTED.has(btn) && !FUNC.has(btn)
                && 'bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/50',
              )}
            >
              {btn}
            </button>
          ))}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="border-t border-slate-800 px-4 py-2 space-y-0.5 max-h-[88px] overflow-y-auto">
            {history.slice(0, 5).map((h, i) => (
              <button
                key={i}
                onClick={() => setDisplay(h.result)}
                className="w-full text-right text-xs text-slate-500 hover:text-slate-300 transition truncate block"
              >
                {h.expr} = <span className="text-slate-300 font-medium">{h.result}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
