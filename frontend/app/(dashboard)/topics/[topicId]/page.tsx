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
  ListChecks,
  MessageSquare,
  RotateCcw,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { postJson } from '@/lib/apiClient'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  defaultTopicWorkspaceDataRequest,
  topicWorkspaceSWRKey,
  useTopicWorkspaceData,
  type TopicWorkspaceDataRequest,
} from '@/lib/topicWorkspaceData'
import {
  activeSectionIdForWorkspace,
  buildRailSections,
  buildTopicLookups,
  defaultSecondaryTabSlotForItem,
  formatTopicItemDuration,
  lockedContentReason,
  lockedVideoSrcDoc,
  missingVideoSrcDoc,
  parseTopicWorkspaceQuery,
  resolvePrimaryTab,
  resolveTabForSlot,
  secondaryTabSlotSpecsForItem,
  selectTopicWorkspaceQueryState,
  shouldUseTopicItemVideoPlayer,
  topicWorkspaceQueryTargetsFromItemId,
  youtubeSrcDoc,
  youtubeVideoId,
  youtubeVideoIdForTab,
  type TopicItem,
  type TopicWorkspace,
  type WorkspaceTabSlot,
} from '@/lib/topicWorkspaceViewModel'
import VideoPlayer from '@/components/VideoPlayer'
import { LessonBody, PrimaryContentFrame, VideoLearningWorkspace, VideoPlayerFrame, type FigmaRailItem, type FigmaRailSection, type FigmaTabItem } from '@/components/figma'
import { FigmaVideoWorkspaceSkeleton } from '@/components/figma/skeletons'
import RouteErrorState from '@/components/RouteErrorState'
import { TabPanel, TopicSearchResults, TopicWorkspaceToolbar } from '@/components/topic-workspace/TopicWorkspacePanels'

const workspaceTabIcons: Record<WorkspaceTabSlot, LucideIcon> = {
  course: BookOpen,
  lab: Beaker,
  quiz: ListChecks,
  resources: FileText,
  notes: StickyNote,
  comments: MessageSquare,
}

export default function TopicWorkspacePage() {
  const { topicId } = useParams<{ topicId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const workspaceSearchKey = searchParams.toString()
  const routeQueryTargets = useMemo(() => (
    parseTopicWorkspaceQuery(new URLSearchParams(workspaceSearchKey))
  ), [workspaceSearchKey])
  const [workspace, setWorkspace] = useState<TopicWorkspace | null>(null)
  const [activeItemId, setActiveItemId] = useState<number | null>(null)
  const [activeTabSlot, setActiveTabSlot] = useState<WorkspaceTabSlot>('course')
  const [topicQuery, setTopicQuery] = useState('')
  const [openSectionIds, setOpenSectionIds] = useState<Set<string | number>>(new Set())
  const [workspaceRequest, setWorkspaceRequest] = useState<TopicWorkspaceDataRequest>(() => ({
    ...defaultTopicWorkspaceDataRequest(),
    targets: routeQueryTargets,
  }))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const lastWorkspaceErrorToastRef = useRef('')
  const previousTopicIdRef = useRef(topicId)
  const {
    key: workspaceKey,
    workspace: fetchedWorkspace,
    error: workspaceError,
    loading,
    isValidating,
    mutate: mutateWorkspace,
  } = useTopicWorkspaceData(topicId, workspaceRequest)
  const loadError = workspaceError ? apiDataErrorMessage(workspaceError, 'Could not load topic workspace.') : ''

  useEffect(() => {
    const topicChanged = previousTopicIdRef.current !== topicId
    previousTopicIdRef.current = topicId
    setWorkspaceRequest({
      ...defaultTopicWorkspaceDataRequest(),
      targets: routeQueryTargets,
    })
    if (!topicChanged) return
    setWorkspace(null)
    setActiveItemId(null)
    setActiveTabSlot('course')
    setOpenSectionIds(new Set())
  }, [routeQueryTargets, topicId])

  useEffect(() => {
    if (!fetchedWorkspace) return
    const numericTopicId = Number(topicId)
    if (Number.isFinite(numericTopicId) && fetchedWorkspace.id !== numericTopicId) return

    const selection = selectTopicWorkspaceQueryState(fetchedWorkspace, workspaceRequest.targets)
    const nextActiveItemId = selection.activeItemId
      ?? fetchedWorkspace.active_item_id
      ?? workspaceRequest.targets.itemId
      ?? fetchedWorkspace.active_item?.id
      ?? null
    const nextOpenSectionId = activeSectionIdForWorkspace(fetchedWorkspace, nextActiveItemId)

    setWorkspace(fetchedWorkspace)
    setActiveItemId(nextActiveItemId)
    if (!workspaceRequest.preserveActiveTab) setActiveTabSlot(selection.activeTabSlot)
    setOpenSectionIds((prev) => {
      if (nextOpenSectionId == null) return workspaceRequest.preserveOpenSections ? prev : new Set()
      if (!workspaceRequest.preserveOpenSections) return new Set([nextOpenSectionId])
      const next = new Set(prev)
      next.add(nextOpenSectionId)
      return next
    })
  }, [fetchedWorkspace, topicId, workspaceRequest])

  useEffect(() => {
    if (!workspaceError) {
      lastWorkspaceErrorToastRef.current = ''
      return
    }
    if (loadError === lastWorkspaceErrorToastRef.current) return
    lastWorkspaceErrorToastRef.current = loadError
    toast.error(loadError)
  }, [loadError, workspaceError])

  const requestWorkspace = useCallback((
    targets = topicWorkspaceQueryTargetsFromItemId(null),
    q = '',
    options: Pick<TopicWorkspaceDataRequest, 'preserveActiveTab' | 'preserveOpenSections'> = {},
  ) => {
    setWorkspaceRequest({
      targets,
      q,
      ...options,
    })
    if (topicWorkspaceSWRKey(topicId, targets, q) === workspaceKey) {
      void mutateWorkspace()
    }
  }, [mutateWorkspace, topicId, workspaceKey])

  const retryWorkspace = useCallback(async () => {
    try {
      await mutateWorkspace()
    } catch {
      // SWR exposes the latest error through state; the effect above owns reporting.
    }
  }, [mutateWorkspace])

  const topicLookups = useMemo(() => {
    if (!workspace) return null
    return buildTopicLookups(workspace.sections)
  }, [workspace])

  const activeItem = useMemo(() => {
    if (!workspace) return null
    return topicLookups?.itemById.get(activeItemId ?? -1) || workspace.active_item
  }, [activeItemId, topicLookups, workspace])

  const activePrimaryTab = useMemo(() => (
    activeItem ? resolvePrimaryTab(activeItem) : null
  ), [activeItem])
  const availableTabSlots = useMemo(() => (
    activeItem ? secondaryTabSlotSpecsForItem(activeItem, activePrimaryTab) : []
  ), [activeItem, activePrimaryTab])
  const activeTab = useMemo(() => (
    activeItem && availableTabSlots.some((slot) => slot.id === activeTabSlot)
      ? resolveTabForSlot(activeItem.tabs, activeTabSlot, activeItem)
      : null
  ), [activeItem, activeTabSlot, availableTabSlots])
  const railSections = useMemo(() => {
    if (!workspace) return []
    return buildRailSections(workspace, activeItemId, openSectionIds)
  }, [workspace, activeItemId, openSectionIds])
  const workspaceTabs = useMemo<FigmaTabItem[]>(() => {
    return availableTabSlots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      icon: workspaceTabIcons[slot.id],
      active: slot.id === activeTabSlot,
    }))
  }, [activeTabSlot, availableTabSlots])
  useEffect(() => {
    if (!activeItem) return
    if (availableTabSlots.some((slot) => slot.id === activeTabSlot)) return
    setActiveTabSlot(defaultSecondaryTabSlotForItem(activeItem, activePrimaryTab))
  }, [activeItem, activePrimaryTab, activeTabSlot, availableTabSlots])
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

  const selectItem = useCallback(async (item: TopicItem) => {
    setActiveItemId(item.id)
    setActiveTabSlot(defaultSecondaryTabSlotForItem(item, resolvePrimaryTab(item)))
    setOpenSectionIds((prev) => new Set(prev).add(item.section_id))

    if (item.can_access === false) {
      toast.info(lockedContentReason(item.locked_reason))
      return
    }

    router.replace(`/topics/${topicId}?item=${item.id}`, { scroll: false })
  }, [router, topicId])

  const runTopicSearch = useCallback(() => {
    if (!activeItem) return
    requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
      preserveActiveTab: true,
      preserveOpenSections: true,
    })
  }, [activeItem, requestWorkspace, topicQuery])

  const toggleSection = useCallback((section: FigmaRailSection) => {
    setOpenSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(section.id)) next.delete(section.id)
      else next.add(section.id)
      return next
    })
  }, [])

  const selectRailItem = useCallback((railItem: FigmaRailItem) => {
    const item = topicLookups?.itemById.get(Number(railItem.id))
    if (item) selectItem(item)
  }, [selectItem, topicLookups])

  const selectWorkspaceTab = useCallback((tab: FigmaTabItem) => {
    const slotId = tab.id as WorkspaceTabSlot
    if (availableTabSlots.some((slot) => slot.id === slotId)) {
      setActiveTabSlot(slotId)
    }
  }, [availableTabSlots])

  const completeActive = useCallback(async () => {
    if (!activeItem || isSubmitting) return
    if (activeItem.can_access === false) {
      toast.info(lockedContentReason(activeItem.locked_reason))
      return
    }
    setIsSubmitting(true)
    try {
      const data = await postJson<any>(`/courses/topic-items/${activeItem.id}/complete`, { watched_seconds: activeItem.duration_seconds || 0 })
      toast.success(`Progress saved${data.xp_earned ? ` (+${data.xp_earned} XP)` : ''}.`)
      requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
        preserveActiveTab: true,
        preserveOpenSections: true,
      })
    } catch {
      toast.error('Could not save progress.')
    } finally {
      setIsSubmitting(false)
    }
  }, [activeItem, isSubmitting, requestWorkspace, topicQuery])

  const saveActive = useCallback(async () => {
    if (!activeItem || !workspace || isSubmitting) return
    if (activeItem.can_access === false) {
      toast.info(lockedContentReason(activeItem.locked_reason))
      return
    }
    setIsSubmitting(true)
    try {
      await postJson('/interactions/saves', { target_type: 'topic_item', target_id: activeItem.id, topic_id: workspace.id, topic_item_id: activeItem.id, label: activeItem.title })
      toast.success('Saved.')
    } catch {
      toast.error('Could not save item.')
    } finally {
      setIsSubmitting(false)
    }
  }, [activeItem, workspace, isSubmitting])

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
            onComplete={completeActive}
          />
        </PrimaryContentFrame>
      )
    }
    if (activePrimaryVideoId) {
      return <VideoPlayerFrame videoId={activePrimaryVideoId} srcDoc={youtubeSrcDoc(activeItem, activePrimaryVideoId)} />
    }
    if (activePrimaryTab) {
      return (
        <PrimaryContentFrame>
          <TabPanel
            tab={activePrimaryTab}
            item={activeItem}
            topicId={workspace?.id ?? Number(topicId)}
            onNoteSaved={() => requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
              preserveActiveTab: true,
              preserveOpenSections: true,
            })}
            onItemComplete={completeActive}
          />
        </PrimaryContentFrame>
      )
    }
    return <VideoPlayerFrame videoId="" srcDoc={missingVideoSrcDoc(activeItem)} />
  }, [activeItem, activePrimaryTab, activePrimaryVideoId, completeActive, isActiveItemLocked, requestWorkspace, shouldUsePrimaryVideoPlayer, topicId, topicQuery, workspace?.id])

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
      breadcrumb={`2eme Bac / ${workspace.subject_title} / ${workspace.title}`}
      title={`${workspace.subject_title}: ${activeItem.title}`}
      primaryContent={primaryContent}
      toolbar={(
        <TopicWorkspaceToolbar
          query={topicQuery}
          resultCount={workspace.search_results.length}
          onQueryChange={setTopicQuery}
          onSearch={runTopicSearch}
        />
      )}
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
          <TopicSearchResults query={topicQuery} items={workspace.search_results} onSelect={selectItem} />
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
                  onNoteSaved={() => requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
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
                <button
                  type="button"
                  onClick={completeActive}
                  disabled={isSubmitting}
                  className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#3a2fd3] px-4 text-[13px] font-black text-white transition hover:bg-[#2f27b8] disabled:opacity-50"
                >
                  <Check size={15} />
                  Mark complete
                </button>
                <button
                  type="button"
                  onClick={saveActive}
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
        </div>
      </LessonBody>
    </VideoLearningWorkspace>
  )
}
