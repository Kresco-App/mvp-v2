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
import { postJson } from '@/lib/apiClient'
import { apiDataErrorMessage } from '@/lib/apiData'
import { useWorkspaceTree } from '@/lib/topicWorkspaceTree'
import {
  formatTopicItemDuration,
  lockedContentReason,
  lockedVideoSrcDoc,
  missingVideoSrcDoc,
  parseTopicWorkspaceQuery,
  shouldUseTopicItemVideoPlayer,
  topicWorkspaceQueryTargetsFromItemId,
  youtubeVideoId,
  youtubeVideoIdForTab,
  type TopicItem,
  type WorkspaceTabSlot,
} from '@/lib/topicWorkspaceViewModel'
import VideoPlayer from '@/components/VideoPlayer'
import YouTubeVideoPlayer from '@/components/YouTubeVideoPlayer'
import { LessonBody, PrimaryContentFrame, VideoLearningWorkspace, VideoPlayerFrame, type FigmaRailItem, type FigmaRailSection, type FigmaTabItem } from '@/components/figma'
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
  const [saveTags, setSaveTags] = useState('')
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
  const activePrimaryVideoId = useMemo(() => {
    if (!activeItem || isActiveItemLocked) return null
    return youtubeVideoIdForTab(activePrimaryTab, activeItem) ?? (!activePrimaryTab ? youtubeVideoId(activeItem) : null)
  }, [activeItem, activePrimaryTab, isActiveItemLocked])
  const shouldUsePrimaryVideoPlayer = useMemo(() => {
    if (!activeItem || isActiveItemLocked) return false
    return shouldUseTopicItemVideoPlayer(activePrimaryTab, activeItem)
  }, [activeItem, activePrimaryTab, isActiveItemLocked])
  const activeDurationLabel = activeItem ? formatTopicItemDuration(activeItem.duration_seconds) : ''
  const canMarkActiveItemComplete = activeItem ? canUseGenericCompletion(activeItem) : false

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
      await postJson('/interactions/saves', {
        target_type: 'topic_item',
        target_id: activeItem.id,
        topic_id: workspace.id,
        topic_item_id: activeItem.id,
        label: activeItem.title,
        ...(options.includeDetails ? { note: saveNote, tags: parseSaveTags(saveTags) } : {}),
      })
      setSaveDetailsOpen(true)
      toast.success(options.includeDetails ? 'Save details updated.' : 'Saved.')
    } catch {
      toast.error('Could not save item.')
    } finally {
      actionInFlightRef.current = false
      setIsSubmitting(false)
    }
  }, [activeItem, saveNote, saveTags, workspace])

  const primaryContent = useMemo(() => {
    if (!activeItem) return null
    if (isActiveItemLocked) {
      return <VideoPlayerFrame videoId="" srcDoc={lockedVideoSrcDoc(activeItem)} />
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
    if (activePrimaryTab) {
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
    return <VideoPlayerFrame videoId="" srcDoc={missingVideoSrcDoc(activeItem)} />
  }, [activeItem, activePrimaryTab, activePrimaryVideoId, completeActive, isActiveItemLocked, refreshActiveProgress, requestWorkspace, shouldUsePrimaryVideoPlayer, topicId, workspace?.id])

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
                  disabled={isSubmitting}
                  className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc] hover:text-[#3f3f46] disabled:opacity-50"
                >
                  <Bookmark size={14} />
                  Save
                </button>
              </>
            )}
            {activeDurationLabel && (
              <span className="ml-1 text-[12px] font-bold text-[#9f9fa9]">{activeDurationLabel}</span>
            )}
          </div>
          {saveDetailsOpen && activeItem.can_access !== false && (
            <div className="grid gap-3 rounded-[14px] border border-[#e4e4e7] bg-white p-4">
              <div>
                <p className="m-0 text-[13px] font-black text-[#3f3f46]">Review pin details</p>
                <p className="m-0 mt-1 text-[12px] font-bold text-[#9f9fa9]">Optional note and tags for finding this item later.</p>
              </div>
              <textarea
                aria-label="Saved item note"
                value={saveNote}
                onChange={(event) => setSaveNote(event.target.value)}
                maxLength={500}
                className="min-h-20 w-full resize-y rounded-[12px] border border-[#e4e4e7] bg-[#f8f9fc] px-3 py-2 text-[13px] font-semibold leading-5 text-[#3f3f46] outline-none focus:border-[#3a2fd3] focus:bg-white"
                placeholder="Why are you saving this?"
              />
              <input
                aria-label="Saved item tags"
                value={saveTags}
                onChange={(event) => setSaveTags(event.target.value)}
                className="h-10 rounded-[12px] border border-[#e4e4e7] bg-[#f8f9fc] px-3 text-[13px] font-semibold text-[#3f3f46] outline-none focus:border-[#3a2fd3] focus:bg-white"
                placeholder="Tags separated by commas"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSaveDetailsOpen(false)}
                  className="inline-flex h-9 items-center rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void saveActive({ includeDetails: true })}
                  disabled={isSubmitting}
                  className="inline-flex h-9 items-center rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:opacity-50"
                >
                  Save details
                </button>
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

function parseSaveTags(value: string) {
  const tags: string[] = []
  const seen = new Set<string>()
  for (const part of value.split(',')) {
    const tag = part.trim().replace(/\s+/g, ' ')
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag.slice(0, 32))
    if (tags.length >= 8) break
  }
  return tags
}
