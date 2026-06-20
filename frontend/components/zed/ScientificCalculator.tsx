'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Calculator, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { evaluateMathExpression } from '@/lib/zedMath'
import { useEscapeKey } from '@/hooks/useClickOutside'

interface Props {
  onClose: () => void
}

type HistoryEntry = { expr: string; result: string }

const BUTTONS = [
  ['sin(', 'cos(', 'tan(', 'sqrt(', 'x^2'],
  ['ln(', 'log(', 'pi', 'e', '^'],
  ['7', '8', '9', '/', 'C'],
  ['4', '5', '6', '*', '<-'],
  ['1', '2', '3', '-', '('],
  ['0', '.', '=', '+', ')'],
]

const ACCENT = new Set(['='])
const DANGER = new Set(['C'])
const MUTED = new Set(['<-', '(', ')'])
const FUNC = new Set(['sin(', 'cos(', 'tan(', 'sqrt(', 'ln(', 'log(', 'pi', 'e', '^', 'x^2'])

const EDGE_PADDING = 12
const DEFAULT_WIDTH = 384
const DEFAULT_HEIGHT = 520

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
}

function clampPosition(x: number, y: number, el: HTMLDivElement | null) {
  if (typeof window === 'undefined') return { x, y }

  const width = el?.offsetWidth ?? DEFAULT_WIDTH
  const height = el?.offsetHeight ?? DEFAULT_HEIGHT
  const maxX = Math.max(EDGE_PADDING, window.innerWidth - width - EDGE_PADDING)
  const maxY = Math.max(EDGE_PADDING, window.innerHeight - height - EDGE_PADDING)

  return {
    x: Math.min(Math.max(EDGE_PADDING, x), maxX),
    y: Math.min(Math.max(EDGE_PADDING, y), maxY),
  }
}

export default function ScientificCalculator({ onClose }: Props) {
  const [display, setDisplay] = useState('')
  const [calcHistory, setCalcHistory] = useState<HistoryEntry[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [pos, setPos] = useState({ x: 80, y: 80 })
  const dragOffset = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEscapeKey(onClose)

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    }
  }, [pos])

  useEffect(() => {
    if (!isDragging) return

    const move = (e: PointerEvent) => {
      setPos(clampPosition(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
        containerRef.current,
      ))
    }
    const up = () => setIsDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [isDragging])

  useEffect(() => {
    setPos(current => clampPosition(current.x, current.y, containerRef.current))

    const handleResize = () => {
      setPos(current => clampPosition(current.x, current.y, containerRef.current))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [calcHistory.length])

  const handleButton = useCallback((val: string) => {
    if (val === 'C') {
      setDisplay('')
      return
    }
    if (val === '<-') {
      setDisplay(d => d.slice(0, -1))
      return
    }
    if (val === 'x^2') {
      setDisplay(d => `(${d || '0'})^2`)
      return
    }

    if (val === '=') {
      if (!display) return
      const result = evaluateMathExpression(display)
      setCalcHistory(h => [{ expr: display, result }, ...h.slice(0, 19)])
      setDisplay(result === 'Erreur' ? display : result)
      return
    }

    setDisplay(d => d + val)
  }, [display])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.isConnected) return
      if (isEditableKeyboardTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        handleButton('=')
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        handleButton('<-')
        return
      }
      if ('0123456789+-*/.()^'.includes(e.key)) {
        e.preventDefault()
        setDisplay(d => d + e.key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleButton, onClose])

  return (
    <svg className="pointer-events-none fixed inset-0 z-[200] h-screen w-screen select-none overflow-visible">
      <foreignObject
        x={pos.x}
        y={pos.y}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT + 160}
        className="pointer-events-auto overflow-visible"
      >
        <div ref={containerRef} className="select-none">
          <div className={cn(
        'flex max-h-[calc(100vh-1.5rem)] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white',
        'shadow-[0_24px_70px_rgba(15,23,42,0.20)] ring-1 ring-white/80'
      )}>
        <div
          onPointerDown={onPointerDown}
          className="flex touch-none cursor-grab items-center justify-between border-b border-slate-200 bg-white px-5 py-3 active:cursor-grabbing"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
              <Calculator size={17} />
            </span>
            <span className="text-sm font-semibold text-slate-900">Calculatrice</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fermer la calculatrice"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-6 py-5">
          <div className="mb-2 min-h-[20px] truncate text-right text-sm text-slate-500">
            {calcHistory[0] ? `${calcHistory[0].expr} =` : ''}
          </div>
          <div className="min-h-[48px] truncate text-right font-mono text-4xl font-light tracking-normal text-slate-950" role="status" aria-live="polite" aria-label="Affichage calculatrice">
            {display || '0'}
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-5 gap-2 overflow-y-auto bg-white p-5">
          {BUTTONS.flat().map((btn) => (
            <button
              key={btn}
              type="button"
              onClick={() => handleButton(btn)}
              className={cn(
                'flex h-14 flex-col items-center justify-center rounded-xl border text-base font-semibold shadow-sm transition-all active:scale-[0.96]',
                ACCENT.has(btn) && 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
                DANGER.has(btn) && 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100',
                MUTED.has(btn) && 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
                FUNC.has(btn) && 'border-emerald-100 bg-emerald-50 text-sm text-emerald-700 hover:bg-emerald-100',
                !ACCENT.has(btn) && !DANGER.has(btn) && !MUTED.has(btn) && !FUNC.has(btn)
                && 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
              )}
            >
              {btn}
            </button>
          ))}
        </div>

        {calcHistory.length > 0 && (
          <div className="max-h-[88px] space-y-0.5 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-2">
            {calcHistory.slice(0, 5).map((h, i) => (
              <button
                key={`${h.expr}-${i}`}
                type="button"
                onClick={() => setDisplay(h.result)}
                className="block w-full truncate text-right text-xs text-slate-500 transition hover:text-slate-900"
              >
                {h.expr} = <span className="font-medium text-slate-900">{h.result}</span>
              </button>
            ))}
          </div>
        )}
          </div>
      </div>
      </foreignObject>
    </svg>
  )
}
