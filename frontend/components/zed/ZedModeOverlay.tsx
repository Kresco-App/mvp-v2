'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen,
  Calculator,
  ChartSpline,
  FunctionSquare,
  Highlighter,
  Home,
  Maximize2,
  MousePointer2,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  Timer,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import PdfViewer, { type AnnotationTool, type ZedDocumentMeta } from './PdfViewerCore'
import FormulaLibrary from './FormulaLibrary'
import ScientificCalculator, { type CalculatorMode } from './ScientificCalculator'

interface Props {
  onClose: () => void
}

type ToolPanel = 'calculator' | 'limits' | 'graph' | 'formulas'
type PomodoroMode = 'focus' | 'break'

const POMODORO_DURATIONS = {
  focus: 25 * 60,
  break: 5 * 60,
} satisfies Record<PomodoroMode, number>

const ANNOTATION_TOOLS: Array<{ id: AnnotationTool; label: string; title: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Edit', title: 'Read and edit saved annotations', icon: MousePointer2 },
  { id: 'highlight', label: 'Highlight', title: 'Drag on the PDF to highlight', icon: Highlighter },
  { id: 'draw', label: 'Draw', title: 'Draw directly on the PDF', icon: PenLine },
  { id: 'text', label: 'Text', title: 'Click the PDF to add text', icon: Type },
  { id: 'delete', label: 'Delete', title: 'Click a highlight, ink stroke, or text note to delete it', icon: Trash2 },
]

const TOOL_PANELS: Array<{ id: ToolPanel; label: string; icon: typeof Calculator; mode?: CalculatorMode }> = [
  { id: 'calculator', label: 'Calculator', icon: Calculator, mode: 'scientific' },
  { id: 'limits', label: 'Limits', icon: FunctionSquare, mode: 'limits' },
  { id: 'graph', label: 'Graph', icon: ChartSpline, mode: 'graph' },
  { id: 'formulas', label: 'Formulas', icon: BookOpen },
]

const buttonMotion = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 motion-reduce:transition-none motion-reduce:active:scale-100'

export default function ZedModeOverlay({ onClose }: Props) {
  const [activeAnnotationTool, setActiveAnnotationTool] = useState<AnnotationTool>('select')
  const [activePanel, setActivePanel] = useState<ToolPanel>('calculator')
  const [activeDocument, setActiveDocument] = useState<ZedDocumentMeta | null>(null)
  const [floatingCalculatorMode, setFloatingCalculatorMode] = useState<CalculatorMode | null>(null)
  const [pomodoroMode, setPomodoroMode] = useState<PomodoroMode>('focus')
  const [pomodoroSeconds, setPomodoroSeconds] = useState(POMODORO_DURATIONS.focus)
  const [pomodoroRunning, setPomodoroRunning] = useState(false)
  const activePanelConfig = TOOL_PANELS.find((panel) => panel.id === activePanel) ?? TOOL_PANELS[0]

  useEffect(() => {
    if (!pomodoroRunning) return

    const intervalId = window.setInterval(() => {
      setPomodoroSeconds((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [pomodoroRunning])

  useEffect(() => {
    if (pomodoroSeconds !== 0 || !pomodoroRunning) return
    setPomodoroRunning(false)
  }, [pomodoroRunning, pomodoroSeconds])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (floatingCalculatorMode) {
        setFloatingCalculatorMode(null)
        return
      }
      setActiveAnnotationTool('select')
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [floatingCalculatorMode])

  function switchPomodoroMode() {
    const nextMode = pomodoroMode === 'focus' ? 'break' : 'focus'
    setPomodoroMode(nextMode)
    setPomodoroSeconds(POMODORO_DURATIONS[nextMode])
    setPomodoroRunning(false)
  }

  function resetPomodoroTimer() {
    setPomodoroSeconds(POMODORO_DURATIONS[pomodoroMode])
    setPomodoroRunning(false)
  }

  function togglePomodoroTimer() {
    if (!pomodoroRunning && pomodoroSeconds === 0) {
      setPomodoroSeconds(POMODORO_DURATIONS[pomodoroMode])
    }

    setPomodoroRunning((current) => !current)
  }

  return (
    <div className="fixed inset-0 z-[100] flex min-w-0 flex-col overflow-hidden bg-[#eef0f4] font-rounded text-slate-950">
      <header className="flex min-h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 shadow-sm sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="shrink-0 text-sm font-black tracking-normal text-slate-950">Zed</h1>
          <span className="hidden h-1 w-1 shrink-0 rounded-full bg-slate-300 sm:block" aria-hidden="true" />
          <p className="hidden min-w-0 truncate text-xs font-semibold text-slate-500 sm:block">
            {activeDocument ? activeDocument.name : 'PDF workspace'}
          </p>
        </div>

        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <AnnotationToolbar activeTool={activeAnnotationTool} onChange={setActiveAnnotationTool} />
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <PomodoroTimer
            mode={pomodoroMode}
            seconds={pomodoroSeconds}
            running={pomodoroRunning}
            onModeChange={switchPomodoroMode}
            onReset={resetPomodoroTimer}
            onToggle={togglePomodoroTimer}
          />
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ${buttonMotion} hover:bg-slate-200 hover:text-slate-950`}
            aria-label="Return home"
            title="Home"
          >
            <Home size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 ${buttonMotion} hover:bg-slate-100 hover:text-slate-950`}
            aria-label="Close Zed Mode"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
        <AnnotationToolbar activeTool={activeAnnotationTool} onChange={setActiveAnnotationTool} />
      </div>

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(22rem,42vh)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_390px] lg:grid-rows-1">
        <section className="min-h-0 min-w-0 overflow-hidden">
          <PdfViewer
            activeTool={activeAnnotationTool}
            onDocumentChange={setActiveDocument}
          />
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col border-t border-slate-200 bg-white shadow-[-12px_0_36px_rgba(15,23,42,0.05)] lg:border-l lg:border-t-0">
          <div className="flex min-h-14 flex-shrink-0 items-center justify-between gap-1 border-b border-slate-200 px-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {TOOL_PANELS.map((panel) => {
                const Icon = panel.icon
                const active = activePanel === panel.id
                return (
                  <button
                    key={panel.id}
                    type="button"
                    onClick={() => setActivePanel(panel.id)}
                    className={`inline-flex h-10 min-w-10 flex-1 items-center justify-center rounded-xl px-2 text-xs font-bold ${buttonMotion} ${
                      active
                        ? 'bg-slate-950 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                    aria-pressed={active}
                    title={panel.label}
                  >
                    <Icon size={15} />
                    <span className="sr-only">{panel.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
              {activePanelConfig.mode ? (
                <button
                  type="button"
                  onClick={() => setFloatingCalculatorMode(activePanelConfig.mode ?? 'scientific')}
                  className={`grid h-9 w-9 place-items-center rounded-lg text-slate-400 ${buttonMotion} hover:bg-slate-100 hover:text-slate-950`}
                  aria-label={`Pop out ${activePanelConfig.label}`}
                  title={`Pop out ${activePanelConfig.label}`}
                >
                  <Maximize2 size={15} />
                </button>
              ) : (
                <span className="h-9 w-9" aria-hidden="true" />
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activePanel}
                className="h-full min-h-0"
                initial={{ opacity: 0, y: 14, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(2px)' }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                {activePanel === 'calculator' && (
                  <ScientificCalculator
                    variant="docked"
                    initialMode="scientific"
                  />
                )}
                {activePanel === 'limits' && (
                  <ScientificCalculator
                    variant="docked"
                    initialMode="limits"
                  />
                )}
                {activePanel === 'graph' && (
                  <ScientificCalculator
                    variant="docked"
                    initialMode="graph"
                  />
                )}
                {activePanel === 'formulas' && (
                  <FormulaLibrary onClose={() => setActivePanel('calculator')} inline />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </main>

      <AnimatePresence initial={false}>
        {floatingCalculatorMode && (
          <ScientificCalculator
            key="floating-calculator"
            variant="floating"
            initialMode={floatingCalculatorMode}
            onClose={() => setFloatingCalculatorMode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function AnnotationToolbar({
  activeTool,
  onChange,
}: {
  activeTool: AnnotationTool
  onChange: (tool: AnnotationTool) => void
}) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="PDF annotation tools">
      {ANNOTATION_TOOLS.map((tool) => {
        const Icon = tool.icon
        const active = activeTool === tool.id
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onChange(tool.id)}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${buttonMotion} ${
              active
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-950'
            }`}
            aria-pressed={active}
            title={tool.title}
          >
            <Icon size={16} />
            <span className="sr-only">{tool.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function PomodoroTimer({
  mode,
  seconds,
  running,
  onModeChange,
  onReset,
  onToggle,
}: {
  mode: PomodoroMode
  seconds: number
  running: boolean
  onModeChange: () => void
  onReset: () => void
  onToggle: () => void
}) {
  const modeLabel = mode === 'focus' ? 'Focus' : 'Break'
  const Icon = running ? Pause : Play

  return (
    <div className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 md:flex" aria-label="Pomodoro timer">
      <button
        type="button"
        onClick={onModeChange}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-2.5 text-xs font-black text-slate-950 shadow-sm ${buttonMotion} hover:bg-slate-50`}
        aria-label={`Switch Pomodoro mode. Current mode: ${modeLabel}`}
        title={`Pomodoro: ${modeLabel}`}
      >
        <Timer size={15} className={mode === 'focus' ? 'text-indigo-600' : 'text-emerald-600'} />
        <span className="min-w-[3.15rem] text-right tabular-nums">{formatPomodoroTime(seconds)}</span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={`grid h-10 w-10 place-items-center rounded-lg text-slate-600 ${buttonMotion} hover:bg-white hover:text-slate-950`}
        aria-label={running ? 'Pause Pomodoro timer' : 'Start Pomodoro timer'}
        aria-pressed={running}
        title={running ? 'Pause' : 'Start'}
      >
        <Icon size={15} />
      </button>
      <button
        type="button"
        onClick={onReset}
        className={`grid h-10 w-10 place-items-center rounded-lg text-slate-500 ${buttonMotion} hover:bg-white hover:text-slate-950`}
        aria-label="Reset Pomodoro timer"
        title="Reset"
      >
        <RotateCcw size={15} />
      </button>
    </div>
  )
}

function formatPomodoroTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
