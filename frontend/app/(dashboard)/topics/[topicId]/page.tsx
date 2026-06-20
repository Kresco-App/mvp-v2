'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Beaker,
  Bookmark,
  BookOpen,
  Check,
  FileText,
  MessageSquare,
  RotateCcw,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { deleteJson, getJson, postJson } from '@/lib/apiClient'
import { apiDataErrorMessage } from '@/lib/apiData'
import { useWorkspaceTree } from '@/lib/topicWorkspaceTree'
import {
  formatTopicItemDuration,
  lockedContentReason,
  parseTopicWorkspaceQuery,
  shouldUseTopicItemVideoPlayer,
  tabMatchesSlot,
  topicWorkspaceQueryTargetsFromItemId,
  youtubeVideoId,
  youtubeVideoIdForTab,
  type TopicItem,
  type WorkspaceTabSlot,
} from '@/lib/topicWorkspaceViewModel'
import VideoPlayer from '@/components/VideoPlayer'
import YouTubeVideoPlayer from '@/components/YouTubeVideoPlayer'
import { LessonBody, PrimaryContentFrame, VideoFrameState, VideoLearningWorkspace, type FigmaRailItem, type FigmaRailSection, type FigmaTabItem } from '@/components/figma'
import { FigmaVideoWorkspaceSkeleton } from '@/components/figma/skeletons'
import RouteErrorState from '@/components/RouteErrorState'
import { TabPanel } from '@/components/topic-workspace/TopicWorkspacePanels'

const workspaceTabIcons: Record<WorkspaceTabSlot, LucideIcon> = {
  course: BookOpen,
  lab: Beaker,
  resources: FileText,
  notes: StickyNote,
  comments: MessageSquare,
}
const QUIZ_ITEM_TYPES = new Set(['quiz', 'checkpoint_quiz', 'quiz_set', 'question_set'])
const SAVE_TAG_OPTIONS = ['Relevant', 'Review later', 'Exam prep', 'Formula', 'Difficult']

type TopicItemSave = {
  id: number
  target_type: string
  target_id: number
  note?: string
  tags?: string[]
}

export default function TopicWorkspacePage() {
  const { topicId } = useParams<{ topicId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const workspaceSearchKey = searchParams.toString()
  const routeQueryTargets = useMemo(() => (
    parseTopicWorkspaceQuery(new URLSearchParams(workspaceSearchKey))
  ), [workspaceSearchKey])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveDetailsOpen, setSaveDetailsOpen] = useState(false)
  const [saveNote, setSaveNote] = useState('')
  const [selectedSaveTags, setSelectedSaveTags] = useState<string[]>([])
  const [saveByItemId, setSaveByItemId] = useState<Record<number, TopicItemSave | null>>({})
  const actionInFlightRef = useRef(false)
  const lastWorkspaceErrorToastRef = useRef('')
  const {
    workspace,
    workspaceError,
    loading,
    isValidating,
    topicLookups,
    activeItem,
    activePrimaryTab,
    availableTabSlots,
    activeTab,
    activeTabSlot,
    railSections,
    requestWorkspace,
    retryWorkspace,
    selectWorkspaceItem,
    selectWorkspaceTab: setWorkspaceTabSlot,
    toggleSectionId,
  } = useWorkspaceTree(topicId, routeQueryTargets)
  const loadError = workspaceError ? apiDataErrorMessage(workspaceError, 'Could not load topic workspace.') : ''

  useEffect(() => {
    if (!workspaceError) {
      lastWorkspaceErrorToastRef.current = ''
      return
    }
    if (loadError === lastWorkspaceErrorToastRef.current) return
    lastWorkspaceErrorToastRef.current = loadError
    toast.error(loadError)
  }, [loadError, workspaceError])

  const workspaceTabs = useMemo<FigmaTabItem[]>(() => {
    return availableTabSlots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      icon: workspaceTabIcons[slot.id],
      active: slot.id === activeTabSlot,
    }))
  }, [activeTabSlot, availableTabSlots])
  const isActiveItemLocked = activeItem?.can_access === false
  const activePrimaryTabIsCourse = activePrimaryTab ? tabMatchesSlot(activePrimaryTab, 'course') : false
  const activePrimaryVideoId = useMemo(() => {
    if (!activeItem || isActiveItemLocked) return null
    return youtubeVideoIdForTab(activePrimaryTab, activeItem) ?? youtubeVideoId(activeItem)
  }, [activeItem, activePrimaryTab, isActiveItemLocked])
  const shouldUsePrimaryVideoPlayer = useMemo(() => {
    if (!activeItem || isActiveItemLocked) return false
    return shouldUseTopicItemVideoPlayer(activePrimaryTab, activeItem) || shouldUseTopicItemVideoPlayer(null, activeItem)
  }, [activeItem, activePrimaryTab, isActiveItemLocked])
  const activeDurationLabel = activeItem ? formatTopicItemDuration(activeItem.duration_seconds) : ''
  const canMarkActiveItemComplete = activeItem ? canUseGenericCompletion(activeItem) : false
  const activeItemId = activeItem?.id ?? null
  const activeSaveStatusKnown = activeItem ? Object.prototype.hasOwnProperty.call(saveByItemId, activeItem.id) : false
  const activeSave = activeItem && activeSaveStatusKnown ? saveByItemId[activeItem.id] : null
  const isActiveItemSaved = Boolean(activeSave)

  useEffect(() => {
    if (!activeItem || activeItem.can_access === false || activeSaveStatusKnown) return
    let cancelled = false
    const itemId = activeItem.id

    void getJson<TopicItemSave[]>(`/interactions/saves?topic_item_id=${itemId}&limit=20`)
      .then((saves) => {
        if (cancelled) return
        const itemSave = saves.find((save) => save.target_type === 'topic_item' && save.target_id === itemId) ?? null
        setSaveByItemId((current) => (
          Object.prototype.hasOwnProperty.call(current, itemId)
            ? current
            : { ...current, [itemId]: itemSave }
        ))
      })
      .catch(() => {
        if (cancelled) return
        setSaveByItemId((current) => ({ ...current, [itemId]: null }))
      })

    return () => {
      cancelled = true
    }
  }, [activeItem, activeSaveStatusKnown])

  useEffect(() => {
    if (activeItemId === null) return
    setSaveDetailsOpen(false)
    setSaveNote(activeSave?.note ?? '')
    setSelectedSaveTags((activeSave?.tags ?? []).filter((tag) => SAVE_TAG_OPTIONS.includes(tag)))
  }, [activeItemId, activeSave?.id, activeSave?.note, activeSave?.tags])

  const selectItem = useCallback(async (item: TopicItem) => {
    selectWorkspaceItem(item)
    router.replace(`/topics/${topicId}?item=${item.id}`, { scroll: false })

    if (item.can_access === false) {
      toast.info(lockedContentReason(item.locked_reason))
      return
    }
  }, [router, selectWorkspaceItem, topicId])

  const toggleSection = useCallback((section: FigmaRailSection) => {
    toggleSectionId(section.id)
  }, [toggleSectionId])

  const selectRailItem = useCallback((railItem: FigmaRailItem) => {
    const item = topicLookups?.itemById.get(Number(railItem.id))
    if (item) selectItem(item)
  }, [selectItem, topicLookups])

  const selectWorkspaceTab = useCallback((tab: FigmaTabItem) => {
    const slotId = tab.id as WorkspaceTabSlot
    setWorkspaceTabSlot(slotId)
  }, [setWorkspaceTabSlot])

  const completeActive = useCallback(async () => {
    if (!activeItem || actionInFlightRef.current) return
    if (activeItem.can_access === false) {
      toast.info(lockedContentReason(activeItem.locked_reason))
      return
    }
    actionInFlightRef.current = true
    setIsSubmitting(true)
    try {
      const data = await postJson<any>(`/courses/topic-items/${activeItem.id}/complete`, { watched_seconds: activeItem.duration_seconds || 0 })
      toast.success(`Progress saved${data.xp_earned ? ` (+${data.xp_earned} XP)` : ''}.`)
      requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), {
        preserveActiveTab: true,
        preserveOpenSections: true,
      })
    } catch {
      toast.error('Could not save progress.')
    } finally {
      actionInFlightRef.current = false
      setIsSubmitting(false)
    }
  }, [activeItem, requestWorkspace])

  const refreshActiveProgress = useCallback(() => {
    if (!activeItem) return
    requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), {
      preserveActiveTab: true,
      preserveOpenSections: true,
    })
  }, [activeItem, requestWorkspace])

  const saveActive = useCallback(async (options: { includeDetails?: boolean } = {}) => {
    if (!activeItem || !workspace || actionInFlightRef.current) return
    if (activeItem.can_access === false) {
      toast.info(lockedContentReason(activeItem.locked_reason))
      return
    }
    actionInFlightRef.current = true
    setIsSubmitting(true)
    try {
      const save = await postJson<TopicItemSave>('/interactions/saves', {
        target_type: 'topic_item',
        target_id: activeItem.id,
        topic_id: workspace.id,
        topic_item_id: activeItem.id,
        label: activeItem.title,
        ...(options.includeDetails ? { note: saveNote, tags: selectedSaveTags } : {}),
      })
      setSaveByItemId((current) => ({ ...current, [activeItem.id]: save }))
      setSaveNote(save.note ?? '')
      setSelectedSaveTags((save.tags ?? []).filter((tag) => SAVE_TAG_OPTIONS.includes(tag)))
      setSaveDetailsOpen(false)
      toast.success(options.includeDetails ? 'Save details updated.' : 'Saved.')
    } catch {
      toast.error('Could not save item.')
    } finally {
      actionInFlightRef.current = false
      setIsSubmitting(false)
    }
  }, [activeItem, saveNote, selectedSaveTags, workspace])

  const unsaveActive = useCallback(async () => {
    if (!activeItem || !activeSave || actionInFlightRef.current) return
    actionInFlightRef.current = true
    setIsSubmitting(true)
    try {
      await deleteJson(`/interactions/saves/${activeSave.id}`)
      setSaveByItemId((current) => ({ ...current, [activeItem.id]: null }))
      setSaveDetailsOpen(false)
      setSaveNote('')
      setSelectedSaveTags([])
      toast.success('Removed from saved.')
    } catch {
      toast.error('Could not remove saved item.')
    } finally {
      actionInFlightRef.current = false
      setIsSubmitting(false)
    }
  }, [activeItem, activeSave])

  const toggleSaveTag = useCallback((tag: string) => {
    setSelectedSaveTags((current) => (
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag].slice(0, 3)
    ))
  }, [])

  const primaryContent = useMemo(() => {
    if (!activeItem) return null
    if (isActiveItemLocked) {
      return (
        <VideoFrameState
          variant="locked"
          eyebrow="Locked preview"
          title={activeItem.title || 'Locked lesson'}
          message={activeItem.description || 'Unlock this topic to watch the full lesson and use the attached practice tools.'}
        />
      )
    }
    if (shouldUsePrimaryVideoPlayer) {
      return (
        <PrimaryContentFrame>
          <VideoPlayer
            lessonId={activeItem.id}
            durationSeconds={activeItem.duration_seconds || 0}
            resumeSeconds={activeItem.resume_seconds || 0}
            onComplete={refreshActiveProgress}
          />
        </PrimaryContentFrame>
      )
    }
    if (activePrimaryVideoId) {
      return (
        <PrimaryContentFrame>
          <YouTubeVideoPlayer
            lessonId={activeItem.id}
            videoId={activePrimaryVideoId}
            durationSeconds={activeItem.duration_seconds || 0}
            resumeSeconds={activeItem.resume_seconds || 0}
            onComplete={refreshActiveProgress}
          />
        </PrimaryContentFrame>
      )
    }
    if (activePrimaryTab && !activePrimaryTabIsCourse) {
      return (
        <PrimaryContentFrame>
          <TabPanel
            tab={activePrimaryTab}
            item={activeItem}
            topicId={workspace?.id ?? Number(topicId)}
            onNoteSaved={() => requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), {
              preserveActiveTab: true,
              preserveOpenSections: true,
            })}
            onItemComplete={completeActive}
          />
        </PrimaryContentFrame>
      )
    }
    return (
      <VideoFrameState
        eyebrow="Video resource"
        title={activeItem.title || 'Lesson video'}
        message="This lesson does not have a valid video resource attached yet. Course content stays available below."
      />
    )
  }, [activeItem, activePrimaryTab, activePrimaryTabIsCourse, activePrimaryVideoId, completeActive, isActiveItemLocked, refreshActiveProgress, requestWorkspace, shouldUsePrimaryVideoPlayer, topicId, workspace?.id])

  if (loading && !workspace) {
    return <FigmaVideoWorkspaceSkeleton />
  }

  if (!workspace || !activeItem) {
    return (
      <main className="grid min-h-[520px] place-items-center py-12">
        <RouteErrorState
          eyebrow="Topic unavailable"
          title="This topic workspace could not be loaded."
          message={loadError || 'The topic data was empty or incomplete. Retry the request or go back home.'}
          homeHref="/home"
          homeLabel="Back home"
          onRetry={() => void retryWorkspace()}
        />
      </main>
    )
  }

  return (
    <VideoLearningWorkspace
      breadcrumb={`${workspace.subject_title} / ${workspace.title}`}
      title={`${workspace.subject_title}: ${activeItem.title}`}
      primaryContent={primaryContent}
      tabs={workspaceTabs}
      onTabSelect={selectWorkspaceTab}
      rail={{
        completed: workspace.completed_count,
        total: workspace.item_count,
        value: workspace.progress_pct,
        sections: railSections,
        onSectionToggle: toggleSection,
        onItemSelect: selectRailItem,
      }}
    >
      <LessonBody>
        <div className="grid gap-[24px]">
          {loadError && (
            <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-[#fde68a] bg-[#fffbeb] px-5 py-4">
              <div>
                <p className="m-0 text-[14px] font-black text-[#92400e]">Topic workspace could not be refreshed.</p>
                <p className="m-0 mt-1 text-[13px] font-bold text-[#b45309]">Cached topic data stays visible while you retry.</p>
              </div>
              <button
                type="button"
                onClick={() => void retryWorkspace()}
                disabled={isValidating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#92400e] px-4 text-[13px] font-black text-white disabled:opacity-60"
              >
                <RotateCcw size={15} />
                {isValidating ? 'Retrying...' : 'Retry topic data'}
              </button>
            </section>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {activeTab && (
              <motion.div
                key={activeTabSlot}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <TabPanel
                  tab={activeTab}
                  item={activeItem}
                  topicId={workspace.id}
                  onNoteSaved={() => requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), {
                    preserveActiveTab: true,
                    preserveOpenSections: true,
                  })}
                  onItemComplete={completeActive}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#f4f4f5] pt-4">
            {activeItem.can_access !== false && (
              <>
                {canMarkActiveItemComplete && (
                  <button
                    type="button"
                    onClick={completeActive}
                    disabled={isSubmitting}
                    className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#3a2fd3] px-4 text-[13px] font-black text-white transition hover:bg-[#2f27b8] disabled:opacity-50"
                  >
                    <Check size={15} />
                    Mark complete
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void saveActive()}
                  disabled={isSubmitting || isActiveItemSaved}
                  aria-pressed={isActiveItemSaved}
                  className={`inline-flex h-10 items-center gap-2 rounded-[12px] border px-4 text-[13px] font-black transition disabled:opacity-60 ${isActiveItemSaved ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]' : 'border-[#e4e4e7] bg-white text-[#52525c] hover:border-[#cfd2dc] hover:bg-[#f8f9fc] hover:text-[#3f3f46]'}`}
                >
                  <Bookmark size={14} fill={isActiveItemSaved ? 'currentColor' : 'none'} />
                  {isActiveItemSaved ? 'Saved' : 'Save'}
                </button>
                {isActiveItemSaved && (
                  <button
                    type="button"
                    onClick={() => setSaveDetailsOpen((open) => !open)}
                    disabled={isSubmitting}
                    className="inline-flex h-9 items-center rounded-[11px] border border-transparent px-2.5 text-[12px] font-black text-[#71717b] transition hover:bg-[#f8f9fc] hover:text-[#3f3f46] disabled:opacity-50"
                  >
                    Details
                  </button>
                )}
              </>
            )}
            {activeDurationLabel && (
              <span className="ml-1 text-[12px] font-bold text-[#9f9fa9]">{activeDurationLabel}</span>
            )}
          </div>
          {saveDetailsOpen && activeItem.can_access !== false && isActiveItemSaved && (
            <div className="grid gap-2 rounded-[10px] border border-[#f1f1f4] bg-[#fcfcfd]/70 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[11px] font-black text-[#85858f]">Optional save details</p>
                <button
                  type="button"
                  onClick={() => setSaveDetailsOpen(false)}
                  className="inline-flex h-6 items-center rounded-[8px] px-2 text-[11px] font-black text-[#a1a1aa] transition hover:bg-white hover:text-[#52525c]"
                >
                  Close
                </button>
              </div>
              <textarea
                aria-label="Saved item note"
                value={saveNote}
                onChange={(event) => setSaveNote(event.target.value)}
                maxLength={240}
                rows={1}
                className="min-h-[36px] w-full resize-none rounded-[9px] border border-[#ececf0] bg-white/80 px-2.5 py-2 text-[12px] font-semibold leading-5 text-[#3f3f46] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#d8ddff] focus:bg-white focus:ring-2 focus:ring-[#f3f5ff]"
                placeholder="Optional note"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Saved item tags">
                  {SAVE_TAG_OPTIONS.map((tag) => {
                    const selected = selectedSaveTags.includes(tag)
                    return (
                      <button
                        type="button"
                        key={tag}
                        aria-pressed={selected}
                        onClick={() => toggleSaveTag(tag)}
                        className={`inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-black transition ${selected ? 'border-[#d8ddff] bg-[#f5f6ff] text-[#453dee]' : 'border-[#ececf0] bg-transparent text-[#85858f] hover:border-[#d4d4d8] hover:bg-white hover:text-[#52525c]'}`}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => void saveActive({ includeDetails: true })}
                    disabled={isSubmitting}
                    className="inline-flex h-7 items-center rounded-[9px] border border-[#d8ddff] bg-white px-2.5 text-[11px] font-black text-[#3a2fd3] transition hover:bg-[#f7f7ff] disabled:opacity-50"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={() => void unsaveActive()}
                    disabled={isSubmitting}
                    className="inline-flex h-7 items-center rounded-[9px] border border-transparent px-2 text-[11px] font-black text-[#a1a1aa] transition hover:bg-[#fff1f2] hover:text-[#9f1239] disabled:opacity-50"
                  >
                    Remove save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </LessonBody>
    </VideoLearningWorkspace>
  )
}

function canUseGenericCompletion(item: TopicItem) {
  const itemType = item.item_type.trim().toLowerCase()
  if (QUIZ_ITEM_TYPES.has(itemType)) return false
  if (requiresTimedCompletion(item)) {
    return (item.watched_seconds ?? 0) >= requiredWatchSeconds(item.duration_seconds)
  }
  return item.progress_status !== 'completed'
}

function requiresTimedCompletion(item: TopicItem) {
  const itemType = item.item_type.trim().toLowerCase()
  const completionPolicy = (item.completion_policy ?? '').trim().toLowerCase()
  return item.duration_seconds > 0 && (
    itemType.includes('video') || ['watch', 'video', 'timed'].includes(completionPolicy)
  )
}

function requiredWatchSeconds(durationSeconds: number) {
  return Math.max(1, Math.ceil(durationSeconds * 0.9))
}
