'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  GripVertical,
  FileText,
  Code,
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

type RightTab = 'scratchpad' | 'calculator' | 'rappels'

const RIGHT_TABS: { id: RightTab; label: string; icon: typeof Code }[] = [
  { id: 'scratchpad', label: 'Brouillon', icon: FileText },
  { id: 'calculator', label: 'Calcul', icon: Calculator },
  { id: 'rappels', label: 'Rappels', icon: BookOpen },
]

const SPLIT_STORAGE_KEY = 'kresco_zed_split'

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
  const [rightTab, setRightTab] = useState<RightTab>('scratchpad')
  const [splitPercent, setSplitPercent] = useState(50)
  const [isResizing, setIsResizing] = useState(false)
  const [pinnedSnippets, setPinnedSnippets] = useState<PinnedSnippet[]>([])
  const [mascotMood, setMascotMood] = useState<MascotMood>('idle')
  const [isFullscreenPdf, setIsFullscreenPdf] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [showRappels, setShowRappels] = useState(false)
  const [showHomeConfirm, setShowHomeConfirm] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SPLIT_STORAGE_KEY)
      if (saved) setSplitPercent(Number(saved))
    }
  }, [])

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
    setIsResizing(true)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const pct = (moveEvent.clientX / window.innerWidth) * 100
      const clamped = Math.max(25, Math.min(75, pct))
      setSplitPercent(clamped)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent))
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
        requestExit()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [requestExit])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950"
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-indigo-400" />
            <span className="text-sm font-bold text-white">Zed Mode</span>
          </div>
          <div className="h-5 w-px bg-slate-700" />
          <PomodoroTimer engine={engine} />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCalculator(current => !current)}
            title="Calculatrice scientifique"
            className={`rounded-lg p-1.5 text-sm transition ${showCalculator ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            <Calculator size={15} />
          </button>
          <button
            onClick={() => setShowRappels(current => !current)}
            title="Rappels de cours"
            className={`rounded-lg p-1.5 text-sm transition ${showRappels ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            <BookOpen size={15} />
          </button>
          <div className="h-5 w-px bg-slate-700" />
          <div className="origin-right scale-75">
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
          <button
            onClick={requestExit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            title="Retour a l'accueil"
          >
            <House size={14} />
            <span>Accueil</span>
          </button>
          <button
            onClick={requestExit}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-white"
            title="Quitter Zed Mode (Echap)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ cursor: isResizing ? 'col-resize' : undefined }}>
        <div
          className="flex h-full flex-col overflow-hidden bg-slate-950"
          style={{ width: isFullscreenPdf ? '100%' : `${splitPercent}%` }}
        >
          <PdfViewer onPinSnippet={addPinnedSnippet} />
        </div>

        {!isFullscreenPdf && (
          <div
            className="group flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center bg-slate-800 transition-colors hover:bg-indigo-600/50"
            onMouseDown={handleResizeStart}
          >
            <GripVertical size={12} className="text-slate-400 group-hover:text-indigo-300" />
          </div>
        )}

        {!isFullscreenPdf && (
          <div
            className="flex h-full flex-col overflow-hidden bg-slate-950"
            style={{ width: `${100 - splitPercent}%` }}
          >
            <div className="flex flex-shrink-0 items-center gap-0.5 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
              {RIGHT_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setRightTab(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${rightTab === id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'}`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setIsFullscreenPdf(current => !current)}
                className="rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-white"
                title={isFullscreenPdf ? 'Afficher panneau droit' : 'PDF plein ecran'}
              >
                {isFullscreenPdf ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              {rightTab === 'scratchpad' && (
                <Scratchpad
                  pinnedSnippets={pinnedSnippets}
                  onRemoveSnippet={removePinnedSnippet}
                />
              )}
              {rightTab === 'calculator' && (
                <div className="flex h-full items-start justify-center overflow-y-auto bg-slate-950 pt-6">
                  <ScientificCalculator onClose={() => setRightTab('scratchpad')} inline />
                </div>
              )}
              {rightTab === 'rappels' && (
                <div className="h-full overflow-y-auto">
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
        {showRappels && (
          <motion.div
            key="rappels"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-[150] h-full"
          >
            <RappelsCours onClose={() => setShowRappels(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHomeConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mx-4 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            >
              <h3 className="mb-2 text-xl font-bold text-white">Quitter et revenir ?</h3>
              <p className="mb-6 text-sm text-slate-400">
                Etes-vous sur de vouloir quitter le Zed Mode et retourner a l&apos;accueil ? Toutes les annotations locales non sauvegardees seront perdues.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowHomeConfirm(false)}
                  className="rounded-xl px-4 py-2 font-medium text-slate-300 transition hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
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
