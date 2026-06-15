'use client'

import type { MutableRefObject } from 'react'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import { useAuthStore } from '@/lib/store'
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
const STORAGE_DEFER_DELAY_MS = 0
const MIN_SPLIT_PERCENT = 45
const MAX_SPLIT_PERCENT = 65

const PDF_WIDTH_CLASSES = [
  'md:w-[45%]', 'md:w-[46%]', 'md:w-[47%]', 'md:w-[48%]', 'md:w-[49%]',
  'md:w-[50%]', 'md:w-[51%]', 'md:w-[52%]', 'md:w-[53%]', 'md:w-[54%]',
  'md:w-[55%]', 'md:w-[56%]', 'md:w-[57%]', 'md:w-[58%]', 'md:w-[59%]',
  'md:w-[60%]', 'md:w-[61%]', 'md:w-[62%]', 'md:w-[63%]', 'md:w-[64%]',
  'md:w-[65%]',
] as const

const RAIL_WIDTH_CLASSES = [
  'md:w-[55%]', 'md:w-[54%]', 'md:w-[53%]', 'md:w-[52%]', 'md:w-[51%]',
  'md:w-[50%]', 'md:w-[49%]', 'md:w-[48%]', 'md:w-[47%]', 'md:w-[46%]',
  'md:w-[45%]', 'md:w-[44%]', 'md:w-[43%]', 'md:w-[42%]', 'md:w-[41%]',
  'md:w-[40%]', 'md:w-[39%]', 'md:w-[38%]', 'md:w-[37%]', 'md:w-[36%]',
  'md:w-[35%]',
] as const

function clampSplit(value: number) {
  if (!Number.isFinite(value)) return 58
  return Math.max(MIN_SPLIT_PERCENT, Math.min(MAX_SPLIT_PERCENT, value))
}

function splitClassIndex(value: number) {
  return Math.round(clampSplit(value)) - MIN_SPLIT_PERCENT
}

interface PinnedSnippet {
  id: string
  content: string
  type: 'text' | 'image'
}

function isPinnedSnippet(value: unknown): value is PinnedSnippet {
  if (!value || typeof value !== 'object') return false
  const snippet = value as Partial<PinnedSnippet>
  return (
    typeof snippet.id === 'string' &&
    typeof snippet.content === 'string' &&
    (snippet.type === 'text' || snippet.type === 'image')
  )
}

function parsePinnedSnippets(raw: string | null): PinnedSnippet[] | null {
  if (raw === null) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isPinnedSnippet)) return null
    return parsed.map(snippet => ({
      id: snippet.id,
      content: snippet.content,
      type: snippet.type,
    }))
  } catch {
    return null
  }
}

function mergePinnedSnippets(current: PinnedSnippet[], incoming: PinnedSnippet[]) {
  const currentIds = new Set(current.map(snippet => snippet.id))
  const additions = incoming.filter(snippet => !currentIds.has(snippet.id))
  return additions.length > 0 ? [...current, ...additions] : current
}

interface Props {
  onClose: () => void
}

function userScopedStorageKey(base: string, userId: string | number | null) {
  return userId !== null ? `${base}_${userId}` : base
}

export default function ZedModeOverlay({ onClose }: Props) {
  const engine = useFocusEngine()
  const currentUserId = useAuthStore((state) => state.user?.id ?? null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const activeResizeCleanupRef = useRef<(() => void) | null>(null)
  const splitStorageWriteTimerRef = useRef<number | null>(null)
  const pinsStorageWriteTimerRef = useRef<number | null>(null)
  const isStorageHydratedRef = useRef(false)
  const skipNextPinsPersistRef = useRef(false)
  const [rightTab, setRightTab] = useState<RightTab>('scratchpad')
  const [splitPercent, setSplitPercent] = useState(58)
  const [isResizing, setIsResizing] = useState(false)
  const [pinnedSnippets, setPinnedSnippets] = useState<PinnedSnippet[]>([])
  const [mascotMood, setMascotMood] = useState<MascotMood>('idle')
  const [isFullscreenPdf, setIsFullscreenPdf] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [showHomeConfirm, setShowHomeConfirm] = useState(false)
  const pinsStorageKey = useMemo(() => userScopedStorageKey(PINS_STORAGE_KEY, currentUserId), [currentUserId])
  const scratchpadStorageKey = useMemo(() => userScopedStorageKey('kresco_zed_scratchpad', currentUserId), [currentUserId])

  const clearDeferredStorageWrite = useCallback((timerRef: MutableRefObject<number | null>) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleStorageWrite = useCallback(
      (
      timerRef: MutableRefObject<number | null>,
      write: () => void,
    ) => {
      if (typeof window === 'undefined') return
      clearDeferredStorageWrite(timerRef)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        write()
      }, STORAGE_DEFER_DELAY_MS)
    },
    [clearDeferredStorageWrite],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    isStorageHydratedRef.current = false
    skipNextPinsPersistRef.current = false

    const idleCallback = window.requestIdleCallback?.(() => {
      const saved = localStorage.getItem(SPLIT_STORAGE_KEY)
      if (saved) setSplitPercent(clampSplit(Number(saved)))

      const savedPins = parsePinnedSnippets(localStorage.getItem(pinsStorageKey))
      setPinnedSnippets(savedPins ?? [])

      isStorageHydratedRef.current = true
    })

    if (idleCallback !== undefined) {
      return () => {
        window.cancelIdleCallback?.(idleCallback)
      }
    }

    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem(SPLIT_STORAGE_KEY)
      if (saved) setSplitPercent(clampSplit(Number(saved)))

      const savedPins = parsePinnedSnippets(localStorage.getItem(pinsStorageKey))
      setPinnedSnippets(savedPins ?? [])

      isStorageHydratedRef.current = true
    }, STORAGE_DEFER_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [pinsStorageKey])

  useEffect(() => {
    if (!isStorageHydratedRef.current) return
    scheduleStorageWrite(pinsStorageWriteTimerRef, () => {
      if (skipNextPinsPersistRef.current) {
        skipNextPinsPersistRef.current = false
        return
      }

      if (pinnedSnippets.length === 0) {
        localStorage.removeItem(pinsStorageKey)
      } else {
        localStorage.setItem(pinsStorageKey, JSON.stringify(pinnedSnippets))
      }
    })
  }, [pinnedSnippets, pinsStorageKey, scheduleStorageWrite])

  useEffect(() => {
    if (typeof window === 'undefined') return

    function clearPinsFromExternalStorage() {
      setPinnedSnippets(prev => {
        if (prev.length === 0) return prev
        skipNextPinsPersistRef.current = true
        return []
      })
    }

    function handleStorage(event: StorageEvent) {
      if (event.storageArea && event.storageArea !== localStorage) return

      if (event.key === null) {
        setSplitPercent(58)
        clearPinsFromExternalStorage()
        return
      }

      if (event.key === SPLIT_STORAGE_KEY) {
        setSplitPercent(event.newValue === null ? 58 : clampSplit(Number(event.newValue)))
        return
      }

      if (event.key !== pinsStorageKey) return

      if (event.newValue === null) {
        clearPinsFromExternalStorage()
        return
      }

      const incomingPins = parsePinnedSnippets(event.newValue)
      if (!incomingPins) return
      setPinnedSnippets(prev => mergePinnedSnippets(prev, incomingPins))
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [pinsStorageKey])

  useEffect(() => {
    return () => {
      clearDeferredStorageWrite(splitStorageWriteTimerRef)
      clearDeferredStorageWrite(pinsStorageWriteTimerRef)
    }
  }, [clearDeferredStorageWrite])

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

  const cleanupActiveResize = useCallback(() => {
    activeResizeCleanupRef.current?.()
    activeResizeCleanupRef.current = null
  }, [])

  useEffect(() => cleanupActiveResize, [cleanupActiveResize])

  const persistSplitPercent = useCallback((nextSplit: number) => {
    scheduleStorageWrite(splitStorageWriteTimerRef, () => {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(nextSplit))
    })
  }, [scheduleStorageWrite])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (!splitContainerRef.current) return

    cleanupActiveResize()
    const bounds = splitContainerRef.current.getBoundingClientRect()
    setIsResizing(true)
    let latestSplit = splitPercent

    function handleMouseMove(moveEvent: MouseEvent) {
      const pct = ((moveEvent.clientX - bounds.left) / bounds.width) * 100
      const clamped = clampSplit(pct)
      latestSplit = clamped
      setSplitPercent(clamped)
    }

    function removeResizeListeners() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    function handleMouseUp() {
      setIsResizing(false)
      persistSplitPercent(latestSplit)
      cleanupActiveResize()
    }

    activeResizeCleanupRef.current = removeResizeListeners
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [cleanupActiveResize, persistSplitPercent, splitPercent])

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextSplit = splitPercent
    if (event.key === 'ArrowLeft') nextSplit = splitPercent - 2
    else if (event.key === 'ArrowRight') nextSplit = splitPercent + 2
    else if (event.key === 'Home') nextSplit = 45
    else if (event.key === 'End') nextSplit = 65
    else return

    event.preventDefault()
    const clamped = clampSplit(nextSplit)
    setSplitPercent(clamped)
    persistSplitPercent(clamped)
  }, [persistSplitPercent, splitPercent])

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

  const splitIndex = splitClassIndex(splitPercent)
  const pdfWidthClass = isFullscreenPdf ? 'md:w-full' : PDF_WIDTH_CLASSES[splitIndex]
  const railWidthClass = RAIL_WIDTH_CLASSES[splitIndex]

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
            aria-label={isFullscreenPdf ? 'Afficher le panneau droit' : 'PDF plein ecran'}
            aria-pressed={isFullscreenPdf}
          >
            {isFullscreenPdf ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button"
            onClick={() => setShowCalculator(current => !current)}
            title="Calculatrice scientifique"
            aria-label="Calculatrice scientifique"
            aria-pressed={showCalculator}
            className={`rounded-lg p-1.5 text-sm transition ${showCalculator ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <Calculator size={15} />
          </button>
          <button type="button"
            onClick={openRappelsRail}
            title="Rappels de cours"
            aria-label="Rappels de cours"
            aria-pressed={rightTab === 'rappels' && !isFullscreenPdf}
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
            aria-label="Retour a l'accueil"
          >
            <House size={14} />
            <span className="hidden sm:inline">Accueil</span>
          </button>
          <button type="button"
            onClick={requestExit}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title="Quitter Zed Mode (Echap)"
            aria-label="Quitter Zed Mode"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        ref={splitContainerRef}
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 md:flex-row ${isResizing ? 'cursor-col-resize' : ''}`}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-slate-200 bg-white md:h-full md:border-b-0 ${pdfWidthClass}`}
        >
          <PdfViewer onPinSnippet={addPinnedSnippet} />
        </div>

        {!isFullscreenPdf && (
          <div
            role="separator"
            aria-label="Redimensionner le panneau Zed"
            aria-orientation="vertical"
            aria-valuemin={45}
            aria-valuemax={65}
            aria-valuenow={Math.round(splitPercent)}
            tabIndex={0}
            className="group hidden w-2 flex-shrink-0 cursor-col-resize items-center justify-center bg-slate-100 transition-colors hover:bg-indigo-100 md:flex"
            onMouseDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
          >
            <GripVertical size={12} className="text-slate-400 group-hover:text-indigo-600" />
          </div>
        )}

        {!isFullscreenPdf && (
          <div
            className={`flex min-h-[18rem] w-full min-w-0 flex-col overflow-hidden border-t border-slate-200 bg-white md:h-full md:min-h-0 md:border-l md:border-t-0 ${railWidthClass}`}
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
                  storageKey={scratchpadStorageKey}
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
