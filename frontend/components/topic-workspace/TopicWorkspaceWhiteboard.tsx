'use client'

import dynamic from 'next/dynamic'
import { AlertCircle, Cloud, CloudOff, Maximize2, Minimize2, RefreshCcw, Save } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import type { TopicItem } from '@/lib/topicWorkspaceViewModel'
import {
  canvasSceneToInitialData,
  type CanvasSyncStatus,
  useTopicWhiteboard,
} from '@/hooks/useTopicWhiteboard'

const Excalidraw = dynamic(
  async () => {
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
  const whiteboard = useTopicWhiteboard({
    targetType: 'topic_item',
    targetId: item.id,
  })
  const initialData = useMemo(() => canvasSceneToInitialData(whiteboard.scene), [whiteboard.scene])
  const statusLabel = syncStatusLabel(whiteboard.syncStatus, whiteboard.isDirty, whiteboard.lastSyncedAt)
  const statusTone = syncStatusTone(whiteboard.syncStatus)

  const editor = (mode: 'compact' | 'expanded') => (
    <div className="kresco-whiteboard-editor h-full min-h-0 overflow-hidden bg-[#fbfcff]">
      <Excalidraw
        key={`${item.id}-${mode}-${whiteboard.sceneLoadKey}`}
        initialData={initialData}
        onChange={(elements, appState, files) => {
          whiteboard.handleSceneChange(
            elements as readonly unknown[],
            appState as unknown as Record<string, unknown>,
            files as unknown as Record<string, unknown>,
          )
        }}
        UIOptions={{
          tools: { image: false },
          canvasActions: {
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            saveAsImage: false,
          },
        }}
        theme="light"
        name={`${item.title} whiteboard`}
        autoFocus={mode === 'expanded'}
      />
    </div>
  )

  return (
    <>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">Lesson whiteboard</p>
            <h2 className="m-0 mt-1 text-[18px] font-black leading-tight text-[#3f3f46]">{item.title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[12px] font-black ${statusTone}`}>
              {whiteboard.syncStatus === 'offline' || whiteboard.syncStatus === 'error' || whiteboard.syncStatus === 'conflict'
                ? <CloudOff size={14} />
                : <Cloud size={14} />}
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={() => void whiteboard.saveCanvas({ notify: true })}
              disabled={whiteboard.syncStatus === 'loading' || whiteboard.syncStatus === 'saving' || !whiteboard.isDirty}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
            >
              <Save size={14} />
              Save now
            </button>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc]"
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
                className="ml-auto inline-flex items-center gap-1 text-[12px] font-black text-[#991b1b] underline"
              >
                <RefreshCcw size={13} />
                Reload
              </button>
            )}
          </div>
        )}

        <div className="h-[430px] overflow-hidden rounded-[14px] border border-[#dfe3ea] bg-white shadow-[0_10px_24px_rgba(24,24,27,0.06)]">
          {editor('compact')}
        </div>
      </section>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-[#18181b]/35 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label={`${item.title} whiteboard`}
              className="grid h-[88dvh] w-[min(1180px,94vw)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[#dfe3ea] bg-white shadow-[0_24px_80px_rgba(24,24,27,0.24)]"
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f4] px-4 py-3">
                <div className="min-w-0">
                  <p className="m-0 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">Expanded whiteboard</p>
                  <h2 className="m-0 mt-0.5 truncate text-[16px] font-black text-[#3f3f46]">{item.title}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[12px] font-black ${statusTone}`}>
                    {statusLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => void whiteboard.saveCanvas({ notify: true })}
                    disabled={whiteboard.syncStatus === 'loading' || whiteboard.syncStatus === 'saving' || !whiteboard.isDirty}
                    className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
                  >
                    <Save size={14} />
                    Save now
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc]"
                  >
                    <Minimize2 size={14} />
                    Close
                  </button>
                </div>
              </div>
              {editor('expanded')}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
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
