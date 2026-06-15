import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  resolvePrimaryTab,
  resolveTabForSlot,
  secondaryTabSlotSpecsForItem,
  selectTopicWorkspaceQueryState,
  topicWorkspaceQueryTargetsFromItemId,
  type TopicItem,
  type TopicWorkspace,
  type TopicWorkspaceQueryTargets,
  type WorkspaceTabSlot,
} from '@/lib/topicWorkspaceViewModel'

export function useWorkspaceTree(
  topicId: string,
  routeQueryTargets: TopicWorkspaceQueryTargets,
) {
  const [workspace, setWorkspace] = useState<TopicWorkspace | null>(null)
  const [activeItemId, setActiveItemId] = useState<number | null>(null)
  const [activeTabSlot, setActiveTabSlot] = useState<WorkspaceTabSlot>('course')
  const [openSectionIds, setOpenSectionIds] = useState<Set<string | number>>(new Set())
  const [workspaceRequest, setWorkspaceRequest] = useState<TopicWorkspaceDataRequest>(() => ({
    ...defaultTopicWorkspaceDataRequest(),
    targets: routeQueryTargets,
  }))
  const previousTopicIdRef = useRef(topicId)
  const {
    key: workspaceKey,
    workspace: fetchedWorkspace,
    error: workspaceError,
    loading,
    isValidating,
    mutate: mutateWorkspace,
  } = useTopicWorkspaceData(topicId, workspaceRequest)

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

  const requestWorkspace = useCallback((
    targets = topicWorkspaceQueryTargetsFromItemId(null),
    options: Pick<TopicWorkspaceDataRequest, 'preserveActiveTab' | 'preserveOpenSections'> = {},
  ) => {
    setWorkspaceRequest({
      targets,
      ...options,
    })
    if (topicWorkspaceSWRKey(topicId, targets) === workspaceKey) {
      void mutateWorkspace()
    }
  }, [mutateWorkspace, topicId, workspaceKey])

  const retryWorkspace = useCallback(async () => {
    try {
      await mutateWorkspace()
    } catch {
      // SWR exposes the latest error through state; callers own reporting.
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

  useEffect(() => {
    if (!activeItem) return
    if (availableTabSlots.some((slot) => slot.id === activeTabSlot)) return
    setActiveTabSlot(defaultSecondaryTabSlotForItem(activeItem, activePrimaryTab))
  }, [activeItem, activePrimaryTab, activeTabSlot, availableTabSlots])

  const selectWorkspaceItem = useCallback((item: TopicItem) => {
    setActiveItemId(item.id)
    setActiveTabSlot(defaultSecondaryTabSlotForItem(item, resolvePrimaryTab(item)))
    setOpenSectionIds((prev) => {
      const next = new Set(prev)
      next.add(item.section_id)
      return next
    })
  }, [])

  const toggleSectionId = useCallback((sectionId: string | number) => {
    setOpenSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  const selectWorkspaceTab = useCallback((slotId: WorkspaceTabSlot) => {
    if (availableTabSlots.some((slot) => slot.id === slotId)) {
      setActiveTabSlot(slotId)
    }
  }, [availableTabSlots])

  return {
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
    selectWorkspaceTab,
    toggleSectionId,
  }
}
