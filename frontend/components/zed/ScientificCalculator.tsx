'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import { Calculator, ChartSpline, Divide, FunctionSquare, LocateFixed, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Latex } from '@/components/animated/shared/Latex'
import { cn } from '@/lib/utils'
import {
  approximateLimit,
  evaluateMathExpression,
  evaluateMathNumber,
  expressionToLatex,
  formatMathResult,
  type LimitDirection,
} from '@/lib/zedMath'

export type CalculatorMode = 'scientific' | 'limits' | 'graph'
type HistoryEntry = { expr: string; result: string }
type GraphFunction = { id: string; expression: string; color: string }

interface Props {
  onClose?: () => void
  onFloat?: (mode: CalculatorMode) => void
  initialMode?: CalculatorMode
  variant?: 'floating' | 'docked'
  className?: string
}

const MODES: Array<{ id: CalculatorMode; label: string; icon: typeof Calculator }> = [
  { id: 'scientific', label: 'Calc', icon: Calculator },
  { id: 'limits', label: 'Limits', icon: FunctionSquare },
  { id: 'graph', label: 'Graph', icon: ChartSpline },
]

const SCIENTIFIC_BUTTONS = [
  ['7', '8', '9', '/', 'sqrt('],
  ['4', '5', '6', '*', '^'],
  ['1', '2', '3', '-', '('],
  ['0', '.', 'pi', '+', ')'],
  ['sin(', 'cos(', 'tan(', 'ln(', '='],
] as const

const GRAPH_COLORS = ['#453dee', '#0f9f6e', '#d97706', '#dc2626']
const DEFAULT_GRAPH_FUNCTIONS: GraphFunction[] = [
  { id: 'g1', expression: 'x^2', color: GRAPH_COLORS[0] },
]
const DEFAULT_FLOATING_POSITION = { x: 88, y: 82 }
const FLOATING_WIDTH = 390
const FLOATING_HEIGHT = 610
const EDGE_PADDING = 12
const tapMotion = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'
const inputMotion = 'transition-[border-color,box-shadow,background-color] duration-150 ease-out motion-reduce:transition-none'

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
}

function clampPosition(x: number, y: number, element: HTMLDivElement | null) {
  if (typeof window === 'undefined') return { x, y }
  const width = element?.offsetWidth ?? FLOATING_WIDTH
  const height = element?.offsetHeight ?? FLOATING_HEIGHT
  return {
    x: Math.min(Math.max(EDGE_PADDING, x), Math.max(EDGE_PADDING, window.innerWidth - width - EDGE_PADDING)),
    y: Math.min(Math.max(EDGE_PADDING, y), Math.max(EDGE_PADDING, window.innerHeight - height - EDGE_PADDING)),
  }
}

export default function ScientificCalculator({
  onClose,
  onFloat,
  initialMode = 'scientific',
  variant = 'floating',
  className,
}: Props) {
  const [mode, setMode] = useState<CalculatorMode>(initialMode)
  const [display, setDisplay] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [position, setPosition] = useState(DEFAULT_FLOATING_POSITION)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(position)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  const evaluateCurrent = useCallback(() => {
    if (!display.trim()) return
    const result = evaluateMathExpression(display)
    setHistory((current) => [{ expr: display, result }, ...current.slice(0, 14)])
    if (result !== 'Erreur') setDisplay(result)
  }, [display])

  const insertValue = useCallback((value: string) => {
    if (value === '=') {
      evaluateCurrent()
      return
    }
    setDisplay((current) => current + value)
  }, [evaluateCurrent])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape' && variant === 'floating') {
        onClose?.()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        evaluateCurrent()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        setDisplay((current) => current.slice(0, -1))
        return
      }
      if ('0123456789+-*/.()^x'.includes(event.key)) {
        event.preventDefault()
        setDisplay((current) => current + event.key)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [evaluateCurrent, onClose, variant])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (variant !== 'floating') return
    if ((event.target as HTMLElement).closest('button,input,textarea,select')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const currentPosition = positionRef.current
    dragOffsetRef.current = {
      x: event.clientX - currentPosition.x,
      y: event.clientY - currentPosition.y,
    }
    setIsDragging(true)
  }, [variant])

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (event: PointerEvent) => {
      const next = clampPosition(
        event.clientX - dragOffsetRef.current.x,
        event.clientY - dragOffsetRef.current.y,
        containerRef.current,
      )
      positionRef.current = next
      setPosition(next)
    }
    const handleUp = () => setIsDragging(false)

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [isDragging])

  const body = (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-950',
        variant === 'floating'
          ? 'w-[min(24.5rem,calc(100vw-1.5rem))] rounded-2xl shadow-[0_24px_70px_rgba(15,23,42,0.22)] ring-1 ring-black/10'
          : 'h-full w-full',
        className,
      )}
    >
      <div
        onPointerDown={handlePointerDown}
        className={cn(
          'flex min-h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3',
          variant === 'floating' && 'touch-none cursor-grab active:cursor-grabbing',
        )}
      >
        <div className="t-tabs max-w-full overflow-hidden" role="tablist" aria-label="Calculator modes">
          {MODES.map((item) => {
            const Icon = item.icon
            const active = mode === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(item.id)}
                className="t-tab inline-flex items-center gap-1.5 text-xs font-bold"
              >
                <Icon size={13} />
                {item.label}
              </button>
            )
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {variant === 'docked' && (
            <button
              type="button"
              onClick={() => onFloat?.(mode)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 ${tapMotion} hover:bg-slate-100 hover:text-slate-950`}
              aria-label="Open calculator as floating panel"
              title="Pop out"
            >
              <Maximize2 size={16} />
            </button>
          )}
          {variant === 'floating' && (
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 ${tapMotion} hover:bg-slate-100 hover:text-slate-950`}
              aria-label="Fermer la calculatrice"
              title="Close"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={mode}
          className="min-h-0 flex-1 overflow-hidden"
          initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {mode === 'scientific' && (
            <ScientificMode
              display={display}
              history={history}
              onDisplayChange={setDisplay}
              onInsert={insertValue}
              onEvaluate={evaluateCurrent}
              onHistorySelect={setDisplay}
            />
          )}
          {mode === 'limits' && <LimitMode />}
          {mode === 'graph' && <GraphMode />}
        </motion.div>
      </AnimatePresence>
    </div>
  )

  if (variant === 'docked') return body

  return (
    <motion.div
      className="fixed z-[220] select-none"
      style={{ left: position.x, top: position.y }}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {body}
    </motion.div>
  )
}

function ScientificMode({
  display,
  history,
  onDisplayChange,
  onInsert,
  onEvaluate,
  onHistorySelect,
}: {
  display: string
  history: HistoryEntry[]
  onDisplayChange: Dispatch<SetStateAction<string>>
  onInsert: (value: string) => void
  onEvaluate: () => void
  onHistorySelect: (value: string) => void
}) {
  const latex = useMemo(() => expressionToLatex(display), [display])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4">
        <div className="mb-2 min-h-5 truncate text-right text-xs font-medium text-slate-500">
          {history[0] ? `${history[0].expr} = ${history[0].result}` : ' '}
        </div>
        <div
          className="grid min-h-[68px] place-items-end overflow-hidden rounded-xl bg-white px-4 py-3 text-right shadow-[var(--shadow-border)]"
          role="status"
          aria-live="polite"
        >
          <span className="sr-only" aria-label="Affichage calculatrice">{display || '0'}</span>
          <span aria-hidden="true">
            <Latex formula={latex} className="max-w-full overflow-hidden text-[24px] text-slate-950" />
          </span>
        </div>
        <input
          value={display}
          onChange={(event) => onDisplayChange(event.target.value)}
          placeholder="Type or use buttons"
          aria-label="Calculator expression"
          className={`mt-3 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`}
        />
      </div>

      <div className="grid grid-cols-5 gap-2 p-4">
        {SCIENTIFIC_BUTTONS.flat().map((button) => (
          <button
            key={button}
            type="button"
            onClick={() => onInsert(button)}
            className={cn(
              `flex h-12 items-center justify-center rounded-xl text-sm font-bold shadow-[var(--shadow-border)] ${tapMotion}`,
              button === '=' && 'bg-indigo-600 text-white hover:bg-indigo-700',
              ['+', '-', '*', '/', '^'].includes(button) && 'bg-slate-950 text-white hover:bg-slate-800',
              ['sin(', 'cos(', 'tan(', 'ln(', 'sqrt('].includes(button) && 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
              !['=', '+', '-', '*', '/', '^', 'sin(', 'cos(', 'tan(', 'ln(', 'sqrt('].includes(button) && 'bg-white text-slate-900 hover:bg-slate-50',
            )}
          >
            {button === '/' ? <Divide size={15} /> : button}
          </button>
        ))}
      </div>

      <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={() => onDisplayChange((current) => current.slice(0, -1))}
          className={`inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700 ${tapMotion} hover:bg-slate-200`}
        >
          Backspace
        </button>
        <button
          type="button"
          onClick={() => onDisplayChange('')}
          className={`inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-red-50 text-sm font-bold text-red-700 ${tapMotion} hover:bg-red-100`}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onEvaluate}
          className={`inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white ${tapMotion} hover:bg-indigo-700`}
        >
          Solve
        </button>
      </div>

      {history.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-3">
          <p className="mb-2 text-xs font-bold text-slate-500">History</p>
          <div className="space-y-1.5">
            {history.slice(0, 6).map((entry, index) => (
              <button
                key={`${entry.expr}-${index}`}
                type="button"
                onClick={() => onHistorySelect(entry.result)}
                className={`block w-full rounded-lg bg-white px-3 py-2 text-right text-xs text-slate-500 shadow-[var(--shadow-border)] ${tapMotion} hover:bg-slate-50 hover:text-slate-800`}
              >
                <span className="block truncate">{entry.expr}</span>
                <span className="font-bold tabular-nums text-slate-950">{entry.result}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LimitMode() {
  const [expression, setExpression] = useState('(x^2-1)/(x-1)')
  const [target, setTarget] = useState('1')
  const [direction, setDirection] = useState<LimitDirection>('both')
  const targetNumber = target.trim().toLowerCase() === 'infinity' || target.trim() === '∞'
    ? Infinity
    : target.trim().toLowerCase() === '-infinity' || target.trim() === '-∞'
      ? -Infinity
      : Number(target)
  const result = Number.isFinite(targetNumber) || targetNumber === Infinity || targetNumber === -Infinity
    ? approximateLimit(expression, targetNumber, direction)
    : null
  const resultLabel = result === null ? 'DNE' : formatMathResult(result)
  const targetLatex = targetNumber === Infinity ? '\\infty' : targetNumber === -Infinity ? '-\\infty' : target || 'a'
  const resultLatex = result === null
    ? '\\text{DNE}'
    : result === Infinity
      ? '\\infty'
      : result === -Infinity
        ? '-\\infty'
        : expressionToLatex(resultLabel)

  const insert = (value: string) => setExpression((current) => current + value)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      <div className="rounded-2xl bg-slate-50 p-3 shadow-[var(--shadow-border)]">
        <p className="mb-2 text-xs font-bold text-slate-500">Limit</p>
        <div className="rounded-xl bg-white p-4 text-center shadow-[var(--shadow-border)]">
          <Latex
            block
            formula={`\\lim_{x\\to ${targetLatex}} ${expressionToLatex(expression)} = ${resultLatex}`}
            className="text-[18px] text-slate-950"
          />
        </div>
      </div>

      <label className="mt-4 text-xs font-bold text-slate-500" htmlFor="zed-limit-expression">Function</label>
      <input
        id="zed-limit-expression"
        value={expression}
        onChange={(event) => setExpression(event.target.value)}
        className={`mt-1 h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`}
      />

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label className="min-w-0 text-xs font-bold text-slate-500" htmlFor="zed-limit-target">
          Approaches
          <input
            id="zed-limit-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className={`mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`}
          />
        </label>
        <div className="min-w-[7.5rem] text-xs font-bold text-slate-500">
          Direction
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as LimitDirection)}
            className={`mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`}
            aria-label="Limit direction"
          >
            <option value="both">Both</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {['x', '^', '/', 'sqrt(', 'sin(', 'cos(', 'ln(', 'pi', '(', ')', '+', '-'].map((button) => (
          <button
            key={button}
            type="button"
            onClick={() => insert(button)}
            className={`h-11 rounded-xl bg-white text-sm font-bold text-slate-800 shadow-[var(--shadow-border)] ${tapMotion} hover:bg-slate-50`}
          >
            {button === '/' ? <Divide className="mx-auto" size={15} /> : button}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['0', '0'],
          ['∞', 'infinity'],
          ['-∞', '-infinity'],
        ].map(([label, value]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTarget(value)}
            className={`h-10 rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700 ${tapMotion} hover:bg-indigo-100`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function GraphMode() {
  const [functions, setFunctions] = useState<GraphFunction[]>(DEFAULT_GRAPH_FUNCTIONS)
  const [draft, setDraft] = useState('sin(x)')
  const [windowState, setWindowState] = useState({ xMin: -6, xMax: 6, yMin: -4, yMax: 4 })
  const [traceX, setTraceX] = useState('1')
  const graph = useMemo(() => buildGraph(functions, windowState), [functions, windowState])
  const traceNumber = Number(traceX)

  function addFunction() {
    if (!draft.trim()) return
    setFunctions((current) => [
      ...current,
      { id: `g_${Date.now()}`, expression: draft.trim(), color: GRAPH_COLORS[current.length % GRAPH_COLORS.length] },
    ])
    setDraft('')
  }

  const zoom = (factor: number) => {
    setWindowState((current) => {
      const xMid = (current.xMin + current.xMax) / 2
      const yMid = (current.yMin + current.yMax) / 2
      const xRange = (current.xMax - current.xMin) * factor
      const yRange = (current.yMax - current.yMin) * factor
      return {
        xMin: xMid - xRange / 2,
        xMax: xMid + xRange / 2,
        yMin: yMid - yRange / 2,
        yMax: yMid + yRange / 2,
      }
    })
  }

  const pan = (dx: number, dy: number) => {
    setWindowState((current) => ({
      xMin: current.xMin + dx,
      xMax: current.xMax + dx,
      yMin: current.yMin + dy,
      yMax: current.yMax + dy,
    }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      <div className="rounded-2xl bg-white p-2 shadow-[var(--shadow-border)]">
        <svg viewBox="0 0 640 360" className="block aspect-[16/9] w-full rounded-xl bg-slate-50" role="img" aria-label="Graphing calculator plot">
          <GraphGrid windowState={windowState} />
          {graph.paths.map((path) => (
            <path key={path.id} d={path.d} fill="none" stroke={path.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          ))}
          {Number.isFinite(traceNumber) && functions.map((fn) => {
            const y = safeGraphEvaluate(fn.expression, traceNumber)
            if (y === null) return null
            const point = projectPoint(traceNumber, y, windowState)
            return (
              <g key={`trace-${fn.id}`}>
                <circle cx={point.x} cy={point.y} r="5" fill={fn.color} />
                <text x={Math.min(point.x + 8, 560)} y={Math.max(point.y - 8, 18)} className="fill-slate-700 text-[12px] font-bold">
                  ({formatMathResult(traceNumber)}, {formatMathResult(y)})
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <button type="button" onClick={() => zoom(0.75)} className={`h-10 rounded-lg bg-white font-bold shadow-[var(--shadow-border)] ${tapMotion}`}>Zoom +</button>
        <button type="button" onClick={() => zoom(1.25)} className={`h-10 rounded-lg bg-white font-bold shadow-[var(--shadow-border)] ${tapMotion}`}>Zoom -</button>
        <button type="button" onClick={() => pan(-1, 0)} className={`h-10 rounded-lg bg-white font-bold shadow-[var(--shadow-border)] ${tapMotion}`}><Minus className="mx-auto" size={16} /></button>
        <button type="button" onClick={() => pan(1, 0)} className={`h-10 rounded-lg bg-white font-bold shadow-[var(--shadow-border)] ${tapMotion}`}><Plus className="mx-auto" size={16} /></button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => pan(0, 1)} className={`h-10 rounded-lg bg-white font-bold shadow-[var(--shadow-border)] ${tapMotion}`}>Up</button>
        <button type="button" onClick={() => setWindowState({ xMin: -6, xMax: 6, yMin: -4, yMax: 4 })} className={`inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-slate-950 text-sm font-bold text-white ${tapMotion}`}><RotateCcw size={14} />Reset</button>
        <button type="button" onClick={() => pan(0, -1)} className={`h-10 rounded-lg bg-white font-bold shadow-[var(--shadow-border)] ${tapMotion}`}>Down</button>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="f(x)"
          aria-label="Function to graph"
          className={`h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`}
        />
        <button type="button" onClick={addFunction} className={`h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white ${tapMotion} hover:bg-indigo-700`}>
          Add
        </button>
      </div>

      <label className="mt-3 block text-xs font-bold text-slate-500" htmlFor="zed-graph-trace">
        Trace x
        <input
          id="zed-graph-trace"
          value={traceX}
          onChange={(event) => setTraceX(event.target.value)}
          className={`mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none ${inputMotion} focus:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-100`}
        />
      </label>

      <div className="mt-4 space-y-2">
        {functions.map((fn) => (
          <div key={fn.id} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-[var(--shadow-border)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: fn.color }} />
            <div className="min-w-0">
              <Latex formula={`y=${expressionToLatex(fn.expression)}`} className="block truncate text-sm font-bold text-slate-950" />
              {Number.isFinite(traceNumber) && (
                <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                  y({traceX}) = {formatTraceValue(fn.expression, traceNumber)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFunctions((current) => current.filter((item) => item.id !== fn.id))}
              className={`h-9 w-9 rounded-lg text-slate-400 ${tapMotion} hover:bg-red-50 hover:text-red-600`}
              aria-label={`Remove ${fn.expression}`}
            >
              <X size={15} className="mx-auto" />
            </button>
          </div>
        ))}
      </div>

      <GraphFindings functions={functions} windowState={windowState} />
    </div>
  )
}

function GraphGrid({ windowState }: { windowState: { xMin: number; xMax: number; yMin: number; yMax: number } }) {
  const xAxis = projectPoint(0, 0, windowState).y
  const yAxis = projectPoint(0, 0, windowState).x
  const vertical = range(Math.ceil(windowState.xMin), Math.floor(windowState.xMax))
  const horizontal = range(Math.ceil(windowState.yMin), Math.floor(windowState.yMax))
  return (
    <g>
      {vertical.map((x) => {
        const point = projectPoint(x, 0, windowState)
        return <line key={`x-${x}`} x1={point.x} x2={point.x} y1={0} y2={360} stroke="#e2e8f0" strokeWidth="1" />
      })}
      {horizontal.map((y) => {
        const point = projectPoint(0, y, windowState)
        return <line key={`y-${y}`} x1={0} x2={640} y1={point.y} y2={point.y} stroke="#e2e8f0" strokeWidth="1" />
      })}
      <line x1={0} x2={640} y1={xAxis} y2={xAxis} stroke="#94a3b8" strokeWidth="1.5" />
      <line x1={yAxis} x2={yAxis} y1={0} y2={360} stroke="#94a3b8" strokeWidth="1.5" />
    </g>
  )
}

function GraphFindings({
  functions,
  windowState,
}: {
  functions: GraphFunction[]
  windowState: { xMin: number; xMax: number; yMin: number; yMax: number }
}) {
  const findings = useMemo(() => ({
    roots: functions.flatMap((fn) => findRoots(fn.expression, windowState.xMin, windowState.xMax).slice(0, 3).map((x) => ({ fn, x }))),
    intersections: findIntersections(functions, windowState.xMin, windowState.xMax).slice(0, 4),
  }), [functions, windowState.xMax, windowState.xMin])

  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-3 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <LocateFixed size={14} />
        Roots and intersections
      </div>
      <div className="mt-2 space-y-1.5 text-xs tabular-nums text-slate-700">
        {findings.roots.length === 0 && findings.intersections.length === 0 && (
          <p className="text-slate-500">No visible roots or intersections in this window.</p>
        )}
        {findings.roots.map(({ fn, x }, index) => (
          <p key={`root-${fn.id}-${index}`}>
            <span style={{ color: fn.color }} className="font-bold">{fn.expression}</span> root x = {formatMathResult(x)}
          </p>
        ))}
        {findings.intersections.map((item, index) => (
          <p key={`intersection-${index}`}>
            intersection x = {formatMathResult(item.x)}, y = {formatMathResult(item.y)}
          </p>
        ))}
      </div>
    </div>
  )
}

function buildGraph(functions: GraphFunction[], windowState: { xMin: number; xMax: number; yMin: number; yMax: number }) {
  const steps = 220
  return {
    paths: functions.map((fn) => {
      let d = ''
      let open = false
      for (let index = 0; index <= steps; index += 1) {
        const x = windowState.xMin + ((windowState.xMax - windowState.xMin) * index) / steps
        const y = safeGraphEvaluate(fn.expression, x)
        if (y === null || y < windowState.yMin - 50 || y > windowState.yMax + 50) {
          open = false
          continue
        }
        const point = projectPoint(x, y, windowState)
        d += `${open ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)} `
        open = true
      }
      return { id: fn.id, d, color: fn.color }
    }),
  }
}

function safeGraphEvaluate(expression: string, x: number) {
  try {
    const value = evaluateMathNumber(expression, { x })
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function projectPoint(x: number, y: number, windowState: { xMin: number; xMax: number; yMin: number; yMax: number }) {
  return {
    x: ((x - windowState.xMin) / (windowState.xMax - windowState.xMin)) * 640,
    y: 360 - ((y - windowState.yMin) / (windowState.yMax - windowState.yMin)) * 360,
  }
}

function formatTraceValue(expression: string, x: number) {
  const value = safeGraphEvaluate(expression, x)
  return value === null ? 'undefined' : formatMathResult(value)
}

function findRoots(expression: string, xMin: number, xMax: number) {
  const roots: number[] = []
  const steps = 200
  let previousX = xMin
  let previousY = safeGraphEvaluate(expression, previousX)
  for (let index = 1; index <= steps; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / steps
    const y = safeGraphEvaluate(expression, x)
    if (previousY !== null && y !== null && Math.sign(previousY) !== Math.sign(y)) {
      roots.push(refineRoot((value) => safeGraphEvaluate(expression, value), previousX, x))
    }
    previousX = x
    previousY = y
  }
  return dedupeNumbers(roots)
}

function findIntersections(functions: GraphFunction[], xMin: number, xMax: number) {
  const intersections: Array<{ x: number; y: number }> = []
  for (let a = 0; a < functions.length; a += 1) {
    for (let b = a + 1; b < functions.length; b += 1) {
      const first = functions[a]
      const second = functions[b]
      const roots = findRoots(`(${first.expression})-(${second.expression})`, xMin, xMax)
      for (const x of roots) {
        const y = safeGraphEvaluate(first.expression, x)
        if (y !== null) intersections.push({ x, y })
      }
    }
  }
  return intersections
}

function refineRoot(fn: (value: number) => number | null, leftStart: number, rightStart: number) {
  let left = leftStart
  let right = rightStart
  for (let index = 0; index < 20; index += 1) {
    const mid = (left + right) / 2
    const leftValue = fn(left)
    const midValue = fn(mid)
    if (leftValue === null || midValue === null) break
    if (Math.sign(leftValue) === Math.sign(midValue)) left = mid
    else right = mid
  }
  return (left + right) / 2
}

function dedupeNumbers(values: number[]) {
  const sorted = values.sort((a, b) => a - b)
  return sorted.filter((value, index) => index === 0 || Math.abs(value - sorted[index - 1]) > 0.05)
}

function range(min: number, max: number) {
  const values: number[] = []
  for (let value = min; value <= max; value += 1) values.push(value)
  return values
}
