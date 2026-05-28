import type { TabContent, TopicItem, WorkspaceTabSlot, WorkspaceTabSlotSpec } from '@/lib/topicWorkspaceTypes'

export const workspaceTabSlotSpecs: WorkspaceTabSlotSpec[] = [
  { id: 'course', label: 'Course', tabTypes: ['course', 'summary', 'transcript', 'formula', 'definitions', 'vocabulary', 'methods', 'mistakes', 'text'] },
  { id: 'lab', label: 'Lab', tabTypes: ['lab', 'interactive', 'simulator'] },
  { id: 'quiz', label: 'Quiz', tabTypes: ['quiz', 'checkpoint_quiz', 'questions'] },
  { id: 'resources', label: 'Resources', tabTypes: ['resources', 'resource', 'pdf', 'attachment', 'worksheet'] },
  { id: 'notes', label: 'Notes', tabTypes: ['notes'] },
  { id: 'comments', label: 'Comments', tabTypes: ['comments', 'discussion'] },
]

export function tabMatchesSlot(tab: TabContent, slot: WorkspaceTabSlot) {
  const spec = workspaceTabSlotSpecs.find((item) => item.id === slot)
  if (!spec) return false
  const type = tab.tab_type.toLowerCase()
  const label = tab.label.toLowerCase()
  return spec.tabTypes.some((candidate) => type === candidate || label.includes(candidate))
}

export function isCommentsTab(tab: TabContent) {
  return tabMatchesSlot(tab, 'comments')
}

export function resolvePrimaryTab(item: TopicItem): TabContent | null {
  const tabs = item.tabs ?? []
  if (item.primary_tab && !item.primary_tab.is_missing) return item.primary_tab
  if (item.primary_tab_content_id) {
    const explicit = tabs.find((tab) => tab.id === item.primary_tab_content_id)
    if (explicit) return explicit
  }
  if (item.primary_resource?.id) {
    const resourceTab = tabs.find((tab) => tab.resource?.id === item.primary_resource?.id)
    if (resourceTab) return resourceTab
  }
  return tabs.find((tab) => !isCommentsTab(tab)) ?? null
}

export function fallbackTabForSlot(slot: WorkspaceTabSlot, item: TopicItem): TabContent {
  const base = workspaceTabSlotSpecs.find((entry) => entry.id === slot)!
  const fallback: TabContent = {
    id: 0,
    label: base.label,
    tab_type: slot,
    content: '',
    config_json: {},
    renderer_key: '',
    order: 999,
    resource: null,
  }

  if (slot === 'course') {
    return {
      ...fallback,
      content: item.description || '',
      is_missing: !item.description,
      empty_title: 'No course content yet',
      empty_message: 'This item does not have course text attached yet.',
    }
  }

  if (slot === 'lab') {
    return {
      ...fallback,
      tab_type: 'lab',
      is_missing: true,
      empty_title: 'No lab attached',
      empty_message: 'This item does not have an interactive lab tab attached yet.',
    }
  }

  if (slot === 'quiz') {
    return {
      ...fallback,
      tab_type: 'quiz',
      is_missing: true,
      empty_title: 'No quiz attached',
      empty_message: 'This item does not have quiz questions attached yet.',
    }
  }

  if (slot === 'resources') {
    const hasResource = Boolean(item.primary_resource?.summary || item.primary_resource?.title)
    return {
      ...fallback,
      tab_type: 'resources',
      content: item.primary_resource?.summary || '',
      resource: item.primary_resource ?? null,
      is_missing: !hasResource,
      empty_title: 'No resources attached',
      empty_message: 'This item does not have resources attached yet.',
    }
  }

  if (slot === 'comments') {
    return {
      ...fallback,
      tab_type: 'comments',
      is_missing: true,
      empty_title: 'Comments unavailable',
      empty_message: 'Comments are not enabled for this item.',
    }
  }

  return fallback
}

export function resolveTabForSlot(tabs: TabContent[] = [], slot: WorkspaceTabSlot, item: TopicItem) {
  return tabs.find((tab) => tabMatchesSlot(tab, slot)) || fallbackTabForSlot(slot, item)
}

export function secondaryTabSlotSpecsForItem(item: TopicItem, primaryTab: TabContent | null = resolvePrimaryTab(item)) {
  const primarySlot = primaryTab ? workspaceTabSlotForTab(primaryTab) : null
  return workspaceTabSlotSpecs.filter((slot) => {
    if (slot.id === 'comments') return item.tabs.some((tab) => tabMatchesSlot(tab, 'comments'))
    return slot.id !== primarySlot
  })
}

export function defaultSecondaryTabSlotForItem(item: TopicItem, primaryTab: TabContent | null = resolvePrimaryTab(item)) {
  const slots = secondaryTabSlotSpecsForItem(item, primaryTab)
  return slots.find((slot) => item.tabs.some((tab) => tabMatchesSlot(tab, slot.id)))?.id ?? slots[0]?.id ?? 'course'
}

export function tabConfig(tab: TabContent): Record<string, any> {
  return tab.config_json && typeof tab.config_json === 'object' && !Array.isArray(tab.config_json)
    ? tab.config_json
    : {}
}

export function workspaceTabSlotForTab(tab: TabContent): WorkspaceTabSlot | null {
  return workspaceTabSlotSpecs.find((slot) => tabMatchesSlot(tab, slot.id))?.id ?? null
}

export function normalizeRendererKey(value?: string | null) {
  const key = value?.trim()
  if (!key) return ''
  return key
}
