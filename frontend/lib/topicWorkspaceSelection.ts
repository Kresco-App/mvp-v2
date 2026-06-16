import {
  defaultSecondaryTabSlotForItem,
  resolvePrimaryTab,
  workspaceTabSlotForTab,
} from '@/lib/topicWorkspaceTabs'
import type {
  TopicItem,
  TopicLookups,
  TopicSection,
  TopicWorkspace,
  TopicWorkspaceQuerySelection,
  TopicWorkspaceQueryTargets,
  TopicWorkspaceSearchParams,
  WorkspaceTabSlot,
} from '@/lib/topicWorkspaceTypes'

export function buildTopicLookups(sections: TopicSection[]): TopicLookups {
  const itemById = new Map<number, TopicItem>()

  sections.forEach((section) => {
    section.items?.forEach((item) => {
      itemById.set(item.id, item)
    })
  })

  return { itemById }
}

export function topicWorkspaceQueryTargetsFromItemId(itemId?: number | null): TopicWorkspaceQueryTargets {
  return {
    itemId: positiveIntParam(itemId),
    tabId: null,
    resourceId: null,
    quizId: null,
    questionId: null,
  }
}

export function parseTopicWorkspaceQuery(params: TopicWorkspaceSearchParams): TopicWorkspaceQueryTargets {
  return {
    itemId: positiveIntParam(params.get('item') ?? params.get('item_id')),
    tabId: positiveIntParam(params.get('tab')),
    resourceId: positiveIntParam(params.get('resource')),
    quizId: positiveIntParam(params.get('quiz')),
    questionId: positiveIntParam(params.get('question')),
  }
}

export function activeSectionIdForWorkspace(workspace: TopicWorkspace, itemId: number | null) {
  if (!itemId) return workspace.active_item?.section_id ?? null

  for (const section of workspace.sections) {
    if (section.items?.some((item) => item.id === itemId)) return section.id
  }

  return workspace.active_item?.section_id ?? null
}

export function selectTopicWorkspaceQueryState(
  workspace: TopicWorkspace,
  query: TopicWorkspaceQueryTargets,
): TopicWorkspaceQuerySelection {
  const items = topicWorkspaceItems(workspace)
  const queryItem = findTopicItemForQuery(items, query)
  const activeItem = queryItem ?? workspaceActiveItem(workspace, items)

  return {
    activeItemId: activeItem?.id ?? null,
    activeTabSlot: activeItem ? resolveTabSlotForTopicWorkspaceQuery(activeItem, query) : 'course',
  }
}

export function resolveTabSlotForTopicWorkspaceQuery(
  item: TopicItem,
  query: TopicWorkspaceQueryTargets,
): WorkspaceTabSlot {
  const targetTab = findTabForQueryTarget(item, query)
  if (targetTab) {
    const targetSlot = workspaceTabSlotForTab(targetTab)
    if (targetSlot && targetTab.id !== resolvePrimaryTab(item)?.id) return targetSlot
  }
  if (query.resourceId && item.primary_resource?.id === query.resourceId) return defaultSecondaryTabSlotForItem(item)
  return defaultSecondaryTabSlotForItem(item)
}

function positiveIntParam(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null
  const text = value?.trim()
  if (!text || !/^\d+$/.test(text)) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function topicWorkspaceItems(workspace: TopicWorkspace) {
  const byId = new Map<number, TopicItem>()
  for (const section of workspace.sections) {
    for (const item of section.items ?? []) byId.set(item.id, item)
  }
  if (workspace.active_item && !byId.has(workspace.active_item.id)) {
    byId.set(workspace.active_item.id, workspace.active_item)
  }
  return Array.from(byId.values())
}

function workspaceActiveItem(workspace: TopicWorkspace, items: TopicItem[]) {
  if (workspace.active_item_id) {
    const item = items.find((candidate) => candidate.id === workspace.active_item_id)
    if (item) return item
  }
  if (workspace.active_item) return workspace.active_item
  return items[0] ?? null
}

function findTopicItemForQuery(items: TopicItem[], query: TopicWorkspaceQueryTargets) {
  if (query.itemId) {
    const item = items.find((candidate) => candidate.id === query.itemId)
    if (item) return item
  }

  if (query.tabId) {
    const item = items.find((candidate) => candidate.tabs.some((tab) => tab.id === query.tabId))
    if (item) return item
  }

  if (query.resourceId) {
    const item = items.find((candidate) => itemMatchesResourceTarget(candidate, query.resourceId!))
    if (item) return item
  }

  return null
}

function findTabForQueryTarget(item: TopicItem, query: TopicWorkspaceQueryTargets) {
  if (query.tabId) {
    const tab = item.tabs.find((candidate) => candidate.id === query.tabId)
    if (tab) return tab
  }

  if (query.resourceId) {
    const tab = item.tabs.find((candidate) => candidate.resource?.id === query.resourceId)
    if (tab) return tab
  }

  return null
}

function itemMatchesResourceTarget(item: TopicItem, resourceId: number) {
  return item.primary_resource?.id === resourceId || item.tabs.some((tab) => tab.resource?.id === resourceId)
}
