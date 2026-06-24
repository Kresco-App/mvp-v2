'use client'

import dynamic from 'next/dynamic'
import { AlertCircle, Cloud, CloudOff, Maximize2, RefreshCcw, Save, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { TopicItem } from '@/lib/topicWorkspaceViewModel'
import {
  canvasSceneToInitialData,
  type CanvasSyncStatus,
  useTopicWhiteboard,
} from '@/hooks/useTopicWhiteboard'

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string
  }
}

const EXCALIDRAW_ASSET_PATH = '/excalidraw/'
// Keep in sync with @excalidraw/excalidraw FONT_FAMILY.Nunito for v0.18.x.
const EXCALIDRAW_NUNITO_FONT_FAMILY = 6
const EXCALIDRAW_UI_OPTIONS = {
  tools: { image: false },
  canvasActions: {
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
  },
} as const
type WhiteboardMode = 'compact' | 'expanded'
type ViewportStateByMode = Record<WhiteboardMode, Record<string, unknown>>

const Excalidraw = dynamic(
  async () => {
    if (typeof window !== 'undefined') {
      window.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH
    }
    const excalidrawModule = await import('@excalidraw/excalidraw')
    return excalidrawModule.Excalidraw
  },
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-[280px] place-items-center bg-[#fbfcff] text-[13px] font-black text-[#9f9fa9]">
        Loading whiteboard...
      </div>
    ),
  },
)

export function TopicWorkspaceWhiteboard({
  item,
}: {
  item: TopicItem
}) {
  const [expanded, setExpanded] = useState(false)
  const [viewportStateByMode, setViewportStateByMode] = useState<ViewportStateByMode>({
    compact: {},
    expanded: {},
  })
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const whiteboard = useTopicWhiteboard({
    targetType: 'topic_item',
    targetId: item.id,
  })
  const { handleSceneChange } = whiteboard
  const activeMode: WhiteboardMode = expanded ? 'expanded' : 'compact'
  const activeViewportState = viewportStateByMode[activeMode]
  const initialData = useMemo(() => {
    const sceneData = canvasSceneToInitialData(whiteboard.scene)
    return {
      ...sceneData,
      appState: {
        ...withoutViewportState(sceneData.appState),
        ...activeViewportState,
        currentItemFontFamily: EXCALIDRAW_NUNITO_FONT_FAMILY,
      },
    }
  }, [activeViewportState, whiteboard.scene])
  const statusLabel = syncStatusLabel(whiteboard.syncStatus, whiteboard.isDirty, whiteboard.lastSyncedAt)
  const statusTone = syncStatusTone(whiteboard.syncStatus)
  const hasActiveViewportState = Object.keys(activeViewportState).length > 0

  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    void document.fonts.load('16px Nunito')
    void document.fonts.load('16px Excalifont')
  }, [])

  const rememberViewportState = useCallback((mode: WhiteboardMode, appState: unknown) => {
    if (!appState || typeof appState !== 'object') return
    const record = appState as Record<string, unknown>
    const nextViewportState: Record<string, unknown> = {}
    if (typeof record.scrollX === 'number') nextViewportState.scrollX = record.scrollX
    if (typeof record.scrollY === 'number') nextViewportState.scrollY = record.scrollY
    if (record.zoom !== undefined) nextViewportState.zoom = record.zoom
    if (Object.keys(nextViewportState).length === 0) return

    setViewportStateByMode((current) => (
      shallowEqualRecord(current[mode], nextViewportState)
        ? current
        : { ...current, [mode]: nextViewportState }
    ))
  }, [])

  const openExpanded = useCallback(() => {
    rememberViewportState('compact', excalidrawApiRef.current?.getAppState())
    setExpanded(true)
  }, [rememberViewportState])

  const closeExpanded = useCallback(() => {
    rememberViewportState('expanded', excalidrawApiRef.current?.getAppState())
    setExpanded(false)
  }, [rememberViewportState])

  useEffect(() => {
    if (!expanded) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeExpanded()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeExpanded, expanded])

  useEffect(() => {
    if (!expanded) return
    const timeout = window.setTimeout(() => {
      const api = excalidrawApiRef.current
      if (!api) return

      api.refresh()
      if (hasActiveViewportState) return

      const elements = api.getSceneElements()
      if (elements.length > 0) {
        api.scrollToContent(elements, {
          fitToViewport: true,
          viewportZoomFactor: 0.72,
          animate: false,
        })
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [expanded, hasActiveViewportState, whiteboard.sceneLoadKey])

  const handleCanvasChange = useCallback((elements: readonly unknown[], appState: unknown, files: unknown) => {
    handleSceneChange(
      elements,
      appState as Record<string, unknown>,
      files as Record<string, unknown>,
    )
  }, [handleSceneChange])

  const handleExcalidrawApi = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawApiRef.current = api
  }, [])

  const editor = (mode: 'compact' | 'expanded') => (
    <div className="kresco-whiteboard-editor relative h-full min-h-0 overflow-hidden bg-[#fbfcff] [--ui-font:var(--font-rounded),Nunito,system-ui,sans-serif]">
      <Excalidraw
        key={`${item.id}-${mode}-${whiteboard.sceneLoadKey}`}
        initialData={initialData}
        excalidrawAPI={handleExcalidrawApi}
        onChange={handleCanvasChange}
        UIOptions={EXCALIDRAW_UI_OPTIONS}
        theme="light"
        name={`${item.title} whiteboard`}
        langCode="fr-FR"
        autoFocus={mode === 'expanded'}
      />
    </div>
  )
  const expandedOverlay = (
    <AnimatePresence>
      {expanded && (
        <motion.div
          data-testid="whiteboard-expanded-backdrop"
          className="fixed inset-0 z-[1000] grid place-items-center bg-[#18181b]/35 p-3 backdrop-blur-[2px] max-[640px]:p-2"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeExpanded()
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeExpanded()
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={`${item.title} whiteboard`}
            className="grid h-[calc(100dvh_-_24px)] max-h-[920px] w-[calc(100vw_-_24px)] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[#dfe3ea] bg-white shadow-[0_28px_80px_rgba(24,24,27,0.28)] max-[640px]:h-[calc(100dvh_-_16px)] max-[640px]:w-[calc(100vw_-_16px)] max-[640px]:rounded-[14px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 border-b border-[#edf0f4] bg-white px-4 py-2 max-[640px]:px-3">
              <div className="min-w-0">
                <p className="m-0 truncate text-[11px] font-bold text-[#9f9fa9]">Click outside or press Esc to return</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 max-[640px]:w-full max-[640px]:justify-start">
                <span role="status" aria-live="polite" className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[12px] font-black ${statusTone}`}>
                  {statusLabel}
                </span>
                {whiteboard.isDirty && (
                  <button
                    type="button"
                    onClick={() => void whiteboard.saveCanvas({ notify: true })}
                    disabled={whiteboard.syncStatus === 'loading' || whiteboard.syncStatus === 'saving'}
                    className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition-[background-color,transform] duration-200 hover:bg-[#2f27b8] active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9] disabled:active:scale-100 max-[460px]:flex-1 max-[460px]:justify-center"
                  >
                    <Save size={14} />
                    Save now
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeExpanded}
                  aria-label="Close"
                  title="Close whiteboard"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d4d4d8] bg-white text-[#52525c] transition-[background-color,border-color,transform] duration-200 hover:border-[#cfd2dc] hover:bg-[#f8f9fc] active:scale-[0.96] max-[460px]:ml-auto"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {editor('expanded')}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">Lesson whiteboard</p>
            <h2 className="m-0 mt-1 text-[18px] font-black leading-tight text-[#3f3f46]">{item.title}</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 max-[640px]:w-full max-[640px]:justify-start">
            <span role="status" aria-live="polite" className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[12px] font-black ${statusTone}`}>
              {whiteboard.syncStatus === 'offline' || whiteboard.syncStatus === 'error' || whiteboard.syncStatus === 'conflict'
                ? <CloudOff size={14} />
                : <Cloud size={14} />}
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={() => void whiteboard.saveCanvas({ notify: true })}
              disabled={whiteboard.syncStatus === 'loading' || whiteboard.syncStatus === 'saving' || !whiteboard.isDirty}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition-[background-color,transform] duration-200 hover:bg-[#2f27b8] active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9] disabled:active:scale-100 max-[460px]:flex-1 max-[460px]:justify-center"
            >
              <Save size={14} />
              Save now
            </button>
            <button
              type="button"
              onClick={openExpanded}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] transition-[background-color,border-color,transform] duration-200 hover:border-[#cfd2dc] hover:bg-[#f8f9fc] active:scale-[0.96] max-[460px]:flex-1 max-[460px]:justify-center"
            >
              <Maximize2 size={14} />
              Expand
            </button>
          </div>
        </div>

        {whiteboard.errorMessage && (
          <div className="flex items-start gap-2 rounded-[12px] border border-[#fee2e2] bg-[#fef2f2] px-3 py-2 text-[12px] font-bold leading-5 text-[#b91c1c]">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{whiteboard.errorMessage}</span>
            {whiteboard.syncStatus === 'conflict' && (
              <button
                type="button"
                onClick={whiteboard.reloadFromServer}
                className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-[10px] px-2 text-[12px] font-black text-[#991b1b] underline transition-transform duration-200 active:scale-[0.96]"
              >
                <RefreshCcw size={13} />
                Reload
              </button>
            )}
          </div>
        )}

        <div className="h-[clamp(520px,72dvh,860px)] overflow-hidden rounded-[14px] border border-[#dfe3ea] bg-white shadow-[0_10px_24px_rgba(24,24,27,0.06)] max-[640px]:h-[clamp(430px,68dvh,620px)]">
          {!expanded && editor('compact')}
        </div>
      </section>

      {typeof document === 'undefined' ? expandedOverlay : createPortal(expandedOverlay, document.body)}
    </>
  )
}

function withoutViewportState(appState: Record<string, unknown> | null | undefined) {
  const nextAppState = { ...(appState ?? {}) }
  delete nextAppState.scrollX
  delete nextAppState.scrollY
  delete nextAppState.zoom
  return nextAppState
}

function shallowEqualRecord(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

function syncStatusLabel(status: CanvasSyncStatus, dirty: boolean, lastSyncedAt: string | null) {
  if (status === 'loading') return 'Loading'
  if (status === 'saving') return 'Saving'
  if (status === 'conflict') return 'Changed elsewhere'
  if (status === 'offline') return 'Local draft'
  if (status === 'error') return dirty ? 'Not synced' : 'Sync issue'
  if (dirty) return 'Unsaved changes'
  if (!lastSyncedAt) return 'Saved'
  const date = new Date(lastSyncedAt)
  if (Number.isNaN(date.getTime())) return 'Saved'
  return `Saved ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function syncStatusTone(status: CanvasSyncStatus) {
  if (status === 'conflict' || status === 'error') return 'border border-[#fee2e2] bg-[#fef2f2] text-[#b91c1c]'
  if (status === 'offline' || status === 'dirty') return 'border border-[#fde68a] bg-[#fffbeb] text-[#b45309]'
  if (status === 'saving') return 'border border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]'
  return 'border border-[#dcfce7] bg-[#f0fdf4] text-[#15803d]'
}
