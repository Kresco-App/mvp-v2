'use client'

import type { CSSProperties } from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  GripVertical,
  FileText,
  Calculator,
  Maximize2,
  Minimize2,
  Moon,
  BookOpen,
  House,
} from 'lucide-react'
import { useFocusEngine } from '@/hooks/useFocusEngine'
import KrescoMascot, { MascotMood } from '@/components/KrescoMascot'
import PomodoroTimer from './PomodoroTimer'
import ScientificCalculator from './ScientificCalculator'
import RappelsCours from './RappelsCours'
import Scratchpad from './Scratchpad'

const PdfViewer = dynamic(() => import('./PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  ),
})

type RightTab = 'scratchpad' | 'rappels'

const RIGHT_TABS: { id: RightTab; label: string; icon: typeof FileText }[] = [
  { id: 'scratchpad', label: 'Brouillon', icon: FileText },
  { id: 'rappels', label: 'Rappels', icon: BookOpen },
]

const SPLIT_STORAGE_KEY = 'kresco_zed_split'
const PINS_STORAGE_KEY = 'kresco_zed_pins'

function clampSplit(value: number) {
  if (!Number.isFinite(value)) return 58
  return Math.max(45, Math.min(65, value))
}

interface PinnedSnippet {
  id: string
  content: string
  type: 'text' | 'image'
}

interface Props {
  onClose: () => void
}

export default function ZedModeOverlay({ onClose }: Props) {
  const engine = useFocusEngine()
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const [rightTab, setRightTab] = useState<RightTab>('scratchpad')
  const [splitPercent, setSplitPercent] = useState(58)
  const [isResizing, setIsResizing] = useState(false)
  const [pinnedSnippets, setPinnedSnippets] = useState<PinnedSnippet[]>([])
  const [mascotMood, setMascotMood] = useState<MascotMood>('idle')
  const [isFullscreenPdf, setIsFullscreenPdf] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [showHomeConfirm, setShowHomeConfirm] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SPLIT_STORAGE_KEY)
      if (saved) setSplitPercent(clampSplit(Number(saved)))

      const savedPins = localStorage.getItem(PINS_STORAGE_KEY)
      if (savedPins) {
        try {
          const parsed = JSON.parse(savedPins) as PinnedSnippet[]
          if (Array.isArray(parsed)) setPinnedSnippets(parsed)
        } catch {}
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pinnedSnippets))
    }
  }, [pinnedSnippets])

  useEffect(() => {
    if (engine.tabStatus === 'away' && engine.state === 'running') {
      setMascotMood('angry')
    } else if (engine.state === 'finished') {
      setMascotMood('love')
    } else if (engine.state === 'running') {
      setMascotMood('happy')
    } else {
      setMascotMood('idle')
    }
  }, [engine.state, engine.tabStatus])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (!splitContainerRef.current) return

    const bounds = splitContainerRef.current.getBoundingClientRect()
    setIsResizing(true)
    let latestSplit = splitPercent

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const pct = ((moveEvent.clientX - bounds.left) / bounds.width) * 100
      const clamped = clampSplit(pct)
      latestSplit = clamped
      setSplitPercent(clamped)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      localStorage.setItem(SPLIT_STORAGE_KEY, String(latestSplit))
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [splitPercent])

  const addPinnedSnippet = useCallback((snippet: PinnedSnippet) => {
    setPinnedSnippets(prev => [...prev, snippet])
  }, [])

  const removePinnedSnippet = useCallback((id: string) => {
    setPinnedSnippets(prev => prev.filter(snippet => snippet.id !== id))
  }, [])

  const requestExit = useCallback(() => {
    setShowHomeConfirm(true)
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (showHomeConfirm) {
          setShowHomeConfirm(false)
          return
        }
        if (showCalculator) {
          setShowCalculator(false)
          return
        }
        requestExit()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [requestExit, showCalculator, showHomeConfirm])

  const openRappelsRail = useCallback(() => {
    setRightTab('rappels')
    setIsFullscreenPdf(false)
  }, [])

  const splitVars = {
    '--zed-pdf-width': isFullscreenPdf ? '100%' : `${splitPercent}%`,
    '--zed-rail-width': `${100 - splitPercent}%`,
  } as CSSProperties

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-50 font-rounded text-slate-900"
    >
      <div className="flex min-h-14 flex-shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">Zed Mode</span>
          </div>
          <div className="hidden h-5 w-px bg-slate-200 min-[430px]:block" />
          <div className="hidden min-[430px]:block">
            <PomodoroTimer engine={engine} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <button type="button"
            onClick={() => setIsFullscreenPdf(current => !current)}
            className={`rounded-lg p-1.5 text-sm transition ${isFullscreenPdf ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
            title={isFullscreenPdf ? 'Afficher le panneau droit' : 'PDF plein ecran'}
          >
            {isFullscreenPdf ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button"
            onClick={() => setShowCalculator(current => !current)}
            title="Calculatrice scientifique"
            className={`rounded-lg p-1.5 text-sm transition ${showCalculator ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <Calculator size={15} />
          </button>
          <button type="button"
            onClick={openRappelsRail}
            title="Rappels de cours"
            className={`rounded-lg p-1.5 text-sm transition ${rightTab === 'rappels' && !isFullscreenPdf ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <BookOpen size={15} />
          </button>
          <div className="hidden h-5 w-px bg-slate-200 sm:block" />
          <div className="hidden origin-right scale-75 sm:block">
            <KrescoMascot
              mood={mascotMood}
              size={40}
              floating={engine.state === 'running'}
              message={
                engine.tabStatus === 'away' && engine.state === 'running'
                  ? 'Concentre-toi !'
                  : engine.state === 'finished'
                    ? 'Bravo, session terminee !'
                    : undefined
              }
            />
          </div>
          <button type="button"
            onClick={requestExit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 sm:px-3"
            title="Retour a l'accueil"
          >
            <House size={14} />
            <span className="hidden sm:inline">Accueil</span>
          </button>
          <button type="button"
            onClick={requestExit}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title="Quitter Zed Mode (Echap)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        ref={splitContainerRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 md:flex-row"
        style={{ ...splitVars, cursor: isResizing ? 'col-resize' : undefined }}
      >
        <div
          className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-slate-200 bg-white md:h-full md:w-[var(--zed-pdf-width)] md:border-b-0"
        >
          <PdfViewer onPinSnippet={addPinnedSnippet} />
        </div>

        {!isFullscreenPdf && (
          <div
            className="group hidden w-2 flex-shrink-0 cursor-col-resize items-center justify-center bg-slate-100 transition-colors hover:bg-indigo-100 md:flex"
            onMouseDown={handleResizeStart}
          >
            <GripVertical size={12} className="text-slate-400 group-hover:text-indigo-600" />
          </div>
        )}

        {!isFullscreenPdf && (
          <div
            className="flex min-h-[18rem] w-full min-w-0 flex-col overflow-hidden border-t border-slate-200 bg-white md:h-full md:min-h-0 md:w-[var(--zed-rail-width)] md:border-l md:border-t-0"
          >
            <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {RIGHT_TABS.map(({ id, label, icon: Icon }) => (
                <button type="button"
                  key={id}
                  onClick={() => setRightTab(id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${rightTab === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden">
              {rightTab === 'scratchpad' && (
                <Scratchpad
                  pinnedSnippets={pinnedSnippets}
                  onRemoveSnippet={removePinnedSnippet}
                />
              )}
              {rightTab === 'rappels' && (
                <div className="h-full overflow-y-auto bg-white">
                  <RappelsCours onClose={() => setRightTab('scratchpad')} inline />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showCalculator && (
        <ScientificCalculator onClose={() => setShowCalculator(false)} />
      )}

      <AnimatePresence>
        {showHomeConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <h3 className="mb-2 text-xl font-bold text-slate-900">Quitter et revenir ?</h3>
              <p className="mb-6 text-sm text-slate-500">
                Etes-vous sur de vouloir quitter le Zed Mode et retourner a l&apos;accueil ? Toutes les annotations locales non sauvegardees seront perdues.
              </p>
              <div className="flex justify-end gap-3">
                <button type="button"
                  onClick={() => setShowHomeConfirm(false)}
                  className="rounded-xl px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Annuler
                </button>
                <button type="button"
                  onClick={() => {
                    setShowHomeConfirm(false)
                    onClose()
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700"
                >
                  Confirmer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
