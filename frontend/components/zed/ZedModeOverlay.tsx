'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen,
  Calculator,
  ChartSpline,
  FileText,
  Highlighter,
  Home,
  MousePointer2,
  PenLine,
  StickyNote,
  Type,
  X,
} from 'lucide-react'
import PdfViewer, { type AnnotationTool, type PdfAnnotationStats, type ZedDocumentMeta } from './PdfViewerCore'
import FormulaLibrary from './FormulaLibrary'
import ScientificCalculator, { type CalculatorMode } from './ScientificCalculator'
import { zedStorageGetItem, zedStorageRemoveItemDeferred, zedStorageSetItemDeferred } from './zedStorage'

interface Props {
  onClose: () => void
}

type ToolPanel = 'calculator' | 'limits' | 'graph' | 'formulas' | 'notes'

const ANNOTATION_TOOLS: Array<{ id: AnnotationTool; label: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'draw', label: 'Draw', icon: PenLine },
  { id: 'text', label: 'Text', icon: Type },
]

const TOOL_PANELS: Array<{ id: ToolPanel; label: string; icon: typeof Calculator; mode?: CalculatorMode }> = [
  { id: 'calculator', label: 'Calculator', icon: Calculator, mode: 'scientific' },
  { id: 'limits', label: 'Limits', icon: Calculator, mode: 'limits' },
  { id: 'graph', label: 'Graph', icon: ChartSpline, mode: 'graph' },
  { id: 'formulas', label: 'Formulas', icon: BookOpen },
  { id: 'notes', label: 'Notes', icon: StickyNote },
]

const buttonMotion = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'

export default function ZedModeOverlay({ onClose }: Props) {
  const [activeAnnotationTool, setActiveAnnotationTool] = useState<AnnotationTool>('select')
  const [activePanel, setActivePanel] = useState<ToolPanel>('calculator')
  const [activeDocument, setActiveDocument] = useState<ZedDocumentMeta | null>(null)
  const [annotationStats, setAnnotationStats] = useState<PdfAnnotationStats>({
    highlights: 0,
    drawings: 0,
    textNotes: 0,
    total: 0,
  })
  const [floatingCalculatorMode, setFloatingCalculatorMode] = useState<CalculatorMode | null>(null)
  const activePanelConfig = TOOL_PANELS.find((panel) => panel.id === activePanel) ?? TOOL_PANELS[0]

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

  return (
    <div className="fixed inset-0 z-[100] flex min-w-0 flex-col overflow-hidden bg-[#eef0f4] font-rounded text-slate-950">
      <header className="flex min-h-16 flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 shadow-sm sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-[0_10px_22px_rgba(69,61,238,0.22)]">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-black tracking-normal text-slate-950">Zed Mode</h1>
              <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500 sm:inline-flex">
                local workspace
              </span>
            </div>
            <p className="truncate text-xs font-semibold text-slate-500">
              {activeDocument ? `${activeDocument.name} · ${activeDocument.pageCount} pages` : 'PDF-first study workspace'}
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <AnnotationToolbar activeTool={activeAnnotationTool} onChange={setActiveAnnotationTool} />
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 ${buttonMotion} hover:bg-slate-200 hover:text-slate-950`}
            aria-label="Return home"
          >
            <Home size={16} />
            <span className="hidden sm:inline">Home</span>
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
            onAnnotationStatsChange={setAnnotationStats}
          />
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col border-t border-slate-200 bg-white shadow-[-12px_0_36px_rgba(15,23,42,0.05)] lg:border-l lg:border-t-0">
          <div className="flex min-h-14 flex-shrink-0 items-center gap-1 border-b border-slate-200 px-2">
            {TOOL_PANELS.map((panel) => {
              const Icon = panel.icon
              const active = activePanel === panel.id
              return (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setActivePanel(panel.id)}
                  className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold ${buttonMotion} ${
                    active
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                  aria-pressed={active}
                >
                  <Icon size={15} />
                  <span className="hidden min-[1180px]:inline">{panel.label}</span>
                </button>
              )
            })}
          </div>

          <div className="flex min-h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{activePanelConfig.label}</p>
              <p className="truncate text-xs text-slate-500">{panelSubtitle(activePanel, activeDocument, annotationStats)}</p>
            </div>
            {activePanelConfig.mode && (
              <button
                type="button"
                onClick={() => setFloatingCalculatorMode(activePanelConfig.mode ?? 'scientific')}
                className={`h-9 rounded-lg bg-indigo-50 px-3 text-xs font-bold text-indigo-700 ${buttonMotion} hover:bg-indigo-100`}
              >
                Pop out
              </button>
            )}
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
                    onFloat={setFloatingCalculatorMode}
                  />
                )}
                {activePanel === 'limits' && (
                  <ScientificCalculator
                    variant="docked"
                    initialMode="limits"
                    onFloat={setFloatingCalculatorMode}
                  />
                )}
                {activePanel === 'graph' && (
                  <ScientificCalculator
                    variant="docked"
                    initialMode="graph"
                    onFloat={setFloatingCalculatorMode}
                  />
                )}
                {activePanel === 'formulas' && (
                  <FormulaLibrary onClose={() => setActivePanel('calculator')} inline />
                )}
                {activePanel === 'notes' && (
                  <ZedNotesPanel
                    document={activeDocument}
                    stats={annotationStats}
                  />
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
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="PDF annotation tools">
      {ANNOTATION_TOOLS.map((tool) => {
        const Icon = tool.icon
        const active = activeTool === tool.id
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onChange(tool.id)}
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold ${buttonMotion} ${
              active
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-950'
            }`}
            aria-pressed={active}
          >
            <Icon size={16} />
            <span>{tool.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ZedNotesPanel({
  document,
  stats,
}: {
  document: ZedDocumentMeta | null
  stats: PdfAnnotationStats
}) {
  const storageKey = useMemo(() => document ? `kresco:zed:notes:v1:${document.id}` : null, [document])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setNotes(storageKey ? zedStorageGetItem(storageKey) ?? '' : '')
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) return
    if (notes.trim()) zedStorageSetItemDeferred(storageKey, notes)
    else zedStorageRemoveItemDeferred(storageKey)
  }, [notes, storageKey])

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Highlights" value={stats.highlights} />
        <Metric label="Ink" value={stats.drawings} />
        <Metric label="Notes" value={stats.textNotes} />
      </div>

      <label className="mt-4 text-xs font-bold text-slate-500" htmlFor="zed-session-notes">
        Workspace notes
      </label>
      <textarea
        id="zed-session-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={!document}
        placeholder={document ? 'Write problem-solving notes for this PDF.' : 'Open a PDF to save notes.'}
        className="mt-2 min-h-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-800 outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      />

      <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 shadow-[var(--shadow-border)]">
        <p className="font-bold text-slate-700">{document ? document.name : 'No active PDF'}</p>
        <p className="mt-1 tabular-nums">
          {stats.total} saved annotation{stats.total === 1 ? '' : 's'} on this PDF.
        </p>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 shadow-[var(--shadow-border)]">
        <p className="font-bold text-slate-700">Annotation layer</p>
        <p className="mt-1 text-pretty">
          Highlights, ink, and text markers are stored locally on the active PDF.
        </p>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center shadow-[var(--shadow-border)]">
      <p className="text-2xl font-black tabular-nums text-slate-950">{value}</p>
      <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{label}</p>
    </div>
  )
}

function panelSubtitle(panel: ToolPanel, document: ZedDocumentMeta | null, stats: PdfAnnotationStats) {
  if (panel === 'calculator') return 'Scientific input with LaTeX display'
  if (panel === 'limits') return 'Numeric limit checks with left and right approaches'
  if (panel === 'graph') return 'Plot, trace, zoom, pan, roots, and intersections'
  if (panel === 'formulas') return 'Math, Physics, and SVT formula catalog'
  if (!document) return 'Open a PDF to save notes'
  return `${stats.total} saved annotations`
}
