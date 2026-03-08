'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, GripVertical, FileText, Code, Calculator,
  Terminal, Maximize2, Minimize2, Moon, BookOpen
} from 'lucide-react'
import { useFocusEngine } from '@/hooks/useFocusEngine'
import PomodoroTimer from './PomodoroTimer'
import ScientificCalculator from './ScientificCalculator'
import RappelsCours from './RappelsCours'
import dynamic from 'next/dynamic'
const PdfViewer = dynamic(() => import('./PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})
import Scratchpad from './Scratchpad'
import KrescoMascot, { MascotMood } from '@/components/KrescoMascot'

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

  // Load split preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SPLIT_STORAGE_KEY)
      if (saved) setSplitPercent(Number(saved))
    }
  }, [])

  // Mascot reacts to tab warnings
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
  }, [engine.tabStatus, engine.state])

  // Drag to resize split pane
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
    setPinnedSnippets(prev => prev.filter(s => s.id !== id))
  }, [])

  // ESC to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        {/* Left: Branding + Timer */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-indigo-400" />
            <span className="text-sm font-bold text-white">Zed Mode</span>
          </div>
          <div className="w-px h-5 bg-slate-700" />
          <PomodoroTimer engine={engine} />
        </div>

        {/* Right: Tools + Mascot + Close */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCalculator(s => !s)}
            title="Calculatrice scientifique"
            className={`p-1.5 rounded-lg transition text-sm ${showCalculator ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
          >
            <Calculator size={15} />
          </button>
          <button
            onClick={() => setShowRappels(s => !s)}
            title="Rappels de cours"
            className={`p-1.5 rounded-lg transition text-sm ${showRappels ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
          >
            <BookOpen size={15} />
          </button>
          <div className="w-px h-5 bg-slate-700" />
          <div className="scale-75 origin-right">
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
            onClick={() => setShowHomeConfirm(true)}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Retour à l'accueil"
          >
            <BookOpen size={16} /> {/* Placeholder for Home icon since we didn't import Home */}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Quitter Zed Mode (Echap)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main content: Split pane */}
      <div className="flex-1 flex overflow-hidden" style={{ cursor: isResizing ? 'col-resize' : undefined }}>
        {/* Left: PDF Viewer */}
        <div
          className="h-full overflow-hidden flex flex-col bg-slate-950"
          style={{ width: isFullscreenPdf ? '100%' : `${splitPercent}%` }}
        >
          <PdfViewer onPinSnippet={addPinnedSnippet} />
        </div>

        {/* Resize handle */}
        {!isFullscreenPdf && (
          <div
            className="w-1.5 bg-slate-800 hover:bg-indigo-600/50 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors group"
            onMouseDown={handleResizeStart}
          >
            <GripVertical size={12} className="text-slate-400 group-hover:text-indigo-300" />
          </div>
        )}

        {/* Right: Tabbed workspace */}
        {!isFullscreenPdf && (
          <div
            className="h-full overflow-hidden flex flex-col bg-slate-950"
            style={{ width: `${100 - splitPercent}%` }}
          >
            {/* Tab bar */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 bg-slate-900 border-b border-slate-800 flex-shrink-0">
              {RIGHT_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setRightTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition ${rightTab === id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setIsFullscreenPdf(f => !f)}
                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition"
                title={isFullscreenPdf ? 'Afficher panneau droit' : 'PDF plein ecran'}
              >
                {isFullscreenPdf ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {rightTab === 'scratchpad' && (
                <Scratchpad
                  pinnedSnippets={pinnedSnippets}
                  onRemoveSnippet={removePinnedSnippet}
                />
              )}
              {rightTab === 'calculator' && (
                <div className="h-full flex items-start justify-center pt-6 bg-slate-950 overflow-y-auto">
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
      {/* Floating Scientific Calculator */}
      {showCalculator && (
        <ScientificCalculator onClose={() => setShowCalculator(false)} />
      )}

      {/* Rappels de Cours slide-over */}
      <AnimatePresence>
        {showRappels && (
          <motion.div
            key="rappels"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full z-[150]"
          >
            <RappelsCours onClose={() => setShowRappels(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Home Confirmation Dialog */}
      <AnimatePresence>
        {showHomeConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4"
            >
              <h3 className="text-xl font-bold text-white mb-2">Quitter et revenir ?</h3>
              <p className="text-slate-400 text-sm mb-6">
                Êtes-vous sûr de vouloir quitter le Zed Mode et retourner à l'accueil ? Toutes les annotations locales non sauvegardées seront perdues.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowHomeConfirm(false)}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 font-medium transition"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowHomeConfirm(false)
                    onClose() // the parent usually manages routing, or we can use next/navigation
                    window.location.href = '/home' // forceful nav to home as requested
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
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
