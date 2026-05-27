import type { AnimatedLessonConfig } from '@/components/animated/types'

export interface Resource {
  id: number
  title: string
  resource_type: string
  provider: string
  provider_resource_id: string
  url: string
  summary: string
  can_access?: boolean
  locked_reason?: string
}

export interface TabContent {
  id: number
  label: string
  tab_type: string
  content: string
  config_json: any
  renderer_key: string
  order: number
  can_access?: boolean
  locked_reason?: string
  resource?: Resource | null
  is_missing?: boolean
  empty_title?: string
  empty_message?: string
}

export interface TopicItem {
  id: number
  topic_id: number
  section_id: number
  title: string
  description: string
  item_type: string
  renderer_key: string
  duration_seconds: number
  progress_status: string
  can_access?: boolean
  locked_reason?: string
  primary_resource?: Resource | null
  primary_tab_content_id?: number | null
  primary_tab?: TabContent | null
  tabs: TabContent[]
}

export interface TopicSection {
  id: number
  title: string
  section_type: string
  order: number
  items: TopicItem[]
}

export interface TopicWorkspace {
  id: number
  subject_title: string
  title: string
  description: string
  progress_pct: number
  completed_count: number
  item_count: number
  active_item_id: number | null
  sections: TopicSection[]
  active_item: TopicItem | null
  search_results: TopicItem[]
  can_access?: boolean
  locked_reason?: string
  access_reason?: string
}

export type WorkspaceTabSlot = 'course' | 'lab' | 'quiz' | 'resources' | 'notes' | 'comments'

export type WorkspaceTabSlotSpec = {
  id: WorkspaceTabSlot
  label: string
  tabTypes: string[]
}

export type TopicLookups = {
  itemById: Map<number, TopicItem>
}

export type TopicWorkspaceSearchParams = {
  get(name: string): string | null
}

export type TopicWorkspaceQueryTargets = {
  itemId: number | null
  tabId: number | null
  resourceId: number | null
  quizId: number | null
  questionId: number | null
}

export type TopicWorkspaceQuerySelection = {
  activeItemId: number | null
  activeTabSlot: WorkspaceTabSlot
}

export type TopicRailSection = {
  id: string | number
  title: string
  copy: string
  open?: boolean
  items?: {
    id?: string | number
    label: string
    active?: boolean
    completed?: boolean
    disabled?: boolean
    meta?: string
  }[]
}

export const workspaceTabSlotSpecs: WorkspaceTabSlotSpec[] = [
  { id: 'course', label: 'Course', tabTypes: ['course', 'summary', 'transcript', 'formula', 'definitions', 'vocabulary', 'methods', 'mistakes', 'text'] },
  { id: 'lab', label: 'Lab', tabTypes: ['lab', 'interactive', 'simulator'] },
  { id: 'quiz', label: 'Quiz', tabTypes: ['quiz', 'checkpoint_quiz', 'questions'] },
  { id: 'resources', label: 'Resources', tabTypes: ['resources', 'resource', 'pdf', 'attachment', 'worksheet'] },
  { id: 'notes', label: 'Notes', tabTypes: ['notes'] },
  { id: 'comments', label: 'Comments', tabTypes: ['comments', 'discussion'] },
]

const animatedTabTypes = new Set([
  'activity',
  'animated',
  'animated_course',
  'course_animation',
  'interactive',
  'interactive_course',
  'lab',
  'simulator',
])

const animatedItemTypes = new Set([
  'activity',
  'animated_course',
  'checkpoint_activity',
  'interactive',
  'interactive_course',
  'lab',
  'simulator',
])

const nonAnimatedRendererKeys = new Set(['pdf', 'resource', 'vdocipher', 'video', 'youtube_embed'])

export function formatTopicItemDuration(seconds: number) {
  if (!seconds) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}

export function resourceVideoId(resource?: Resource | null) {
  const raw = resource?.provider_resource_id || resource?.url || ''
  const match = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/) || raw.match(/^[A-Za-z0-9_-]{6,}$/)
  return match?.[1] || match?.[0] || null
}

export function youtubeVideoId(item: TopicItem) {
  return resourceVideoId(item.primary_resource)
}

export function youtubeVideoIdForTab(tab: TabContent | null | undefined, item: TopicItem) {
  if (!tab) return null
  const tabVideoId = resourceVideoId(tab.resource)
  if (tabVideoId) return tabVideoId
  const type = tab.tab_type.toLowerCase()
  const rendererKey = normalizeRendererKey(tab.renderer_key).toLowerCase()
  if (type === 'video' || rendererKey === 'youtube_embed' || rendererKey === 'video') {
    return resourceVideoId(item.primary_resource)
  }
  return null
}

export function youtubeSrcDoc(item: TopicItem, videoId: string) {
  const title = escapeHtml(item.title)
  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; overflow: hidden; background: #f4f4f5; font-family: system-ui, sans-serif; }
      a { position: absolute; inset: 0; display: grid; place-items: center; color: white; text-decoration: none; }
        img { width: 100%; height: 100%; object-fit: cover; filter: saturate(.88) brightness(1.05); }
      span { position: absolute; width: 66px; height: 49px; border-radius: 14px; background: rgba(0,0,0,.36); display: grid; place-items: center; }
      span:before { content: ""; margin-left: 4px; border-left: 17px solid white; border-top: 11px solid transparent; border-bottom: 11px solid transparent; }
      </style>
      <a href="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1" aria-label="Play ${title}">
        <img src="/figma-assets/course-video-frame.png" alt="${title}" />
        <span></span>
      </a>
    `
}

export function lockedVideoSrcDoc(item: TopicItem) {
  const title = escapeHtml(item.title || 'Locked lesson')
  const summary = escapeHtml(item.description || 'Unlock this topic to watch the full lesson and use the attached practice tools.')
  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f5; font-family: system-ui, sans-serif; color: #3f3f46; }
      article { width: min(560px, calc(100% - 48px)); border: 2px solid #e4e4e7; border-radius: 18px; background: white; padding: 24px; box-shadow: 0 18px 42px rgba(24,24,27,.08); }
      b { display: block; margin-bottom: 8px; color: #9f9fa9; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
      h2 { margin: 0; font-size: 22px; line-height: 1.2; }
      p { margin: 12px 0 0; color: #71717b; font-size: 14px; font-weight: 650; line-height: 1.55; }
    </style>
    <article aria-label="Locked lesson preview">
      <b>Locked preview</b>
      <h2>${title}</h2>
      <p>${summary}</p>
    </article>
  `
}

export function missingVideoSrcDoc(item: TopicItem) {
  const title = escapeHtml(item.title || 'Lesson video')
  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f5; font-family: system-ui, sans-serif; color: #3f3f46; }
      article { width: min(560px, calc(100% - 48px)); border: 2px dashed #d4d4d8; border-radius: 18px; background: white; padding: 24px; text-align: center; }
      b { display: block; margin-bottom: 8px; color: #9f9fa9; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
      h2 { margin: 0; font-size: 22px; line-height: 1.2; }
      p { margin: 12px 0 0; color: #71717b; font-size: 14px; font-weight: 650; line-height: 1.55; }
    </style>
    <article aria-label="Missing lesson video">
      <b>Video unavailable</b>
      <h2>${title}</h2>
      <p>This lesson does not have a valid video resource attached yet.</p>
    </article>
  `
}

export function sectionCopy(section: TopicSection) {
  const key = `${section.title} ${section.section_type}`.toLowerCase()
  if (key.includes('lesson')) return 'Learn the basics of the subject.'
  if (key.includes('exercise')) return 'Learn by doing with interactive tasks.'
  if (key.includes('homework')) return 'Learn by practicing with real-world problems.'
  if (key.includes('bac') || key.includes('exam')) return 'Get yourself familiarized with the final boss'
  return section.items?.[0]?.description || 'Keep the flow of knowledge ongoing!'
}

export function railLabel(section: TopicSection, item: TopicItem, index: number) {
  const base = section.title.replace(/s$/i, '')
  return item.title?.trim() || `${base} ${index + 1}`
}

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

export function buildRailSections(workspace: TopicWorkspace, activeItemId: number | null, openIds: Set<string | number>): TopicRailSection[] {
  return workspace.sections.map((section) => ({
    id: section.id,
    title: section.title,
    copy: sectionCopy(section),
    open: openIds.has(section.id),
    items: section.items?.map((item, index) => ({
      id: item.id,
      label: railLabel(section, item, index),
      active: item.id === activeItemId,
      completed: item.progress_status === 'completed',
      disabled: item.can_access === false,
      meta: item.can_access === false ? lockedContentReason(item.locked_reason) : undefined,
    })) ?? [],
  }))
}

export function lockedContentReason(reason?: string) {
  if (reason === 'pro_required') return 'Pro required'
  if (reason === 'vip_required') return 'VIP required'
  if (reason === 'subject_access_required') return 'Subject locked'
  if (reason?.startsWith('feature_required:')) return 'Feature locked'
  return 'Locked'
}

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
  if ((query.quizId || query.questionId) && item.tabs.some((tab) => tabMatchesSlot(tab, 'quiz'))) return 'quiz'
  return defaultSecondaryTabSlotForItem(item)
}

export function normalizeRendererKey(value?: string | null) {
  const key = value?.trim()
  if (!key) return ''
  return key
}

export function isAnimatedTab(tab: TabContent, item: TopicItem) {
  if (tab.is_missing) return false

  const config = tabConfig(tab)
  const type = tab.tab_type.toLowerCase()
  const itemType = item.item_type.toLowerCase()
  const rendererKey = normalizeRendererKey(tab.renderer_key)
  const configRendererKey = normalizeRendererKey(config.renderer_key || config.rendererKey)
  const itemRendererKey = normalizeRendererKey(item.renderer_key)

  if (rendererKey && !nonAnimatedRendererKeys.has(rendererKey.toLowerCase())) return true
  if (configRendererKey && !nonAnimatedRendererKeys.has(configRendererKey.toLowerCase())) return true
  if (animatedTabTypes.has(type)) return true
  return Boolean(itemRendererKey && animatedItemTypes.has(itemType) && !nonAnimatedRendererKeys.has(itemRendererKey.toLowerCase()))
}

export function resolveAnimatedRendererKey(tab: TabContent, item: TopicItem) {
  if (tab.is_missing) return ''

  const config = tabConfig(tab)
  const explicitKey = [
    tab.renderer_key,
    config.renderer_key,
    config.rendererKey,
  ].find((value) => typeof value === 'string' && value.trim())

  if (explicitKey) return normalizeRendererKey(explicitKey)

  const type = tab.tab_type.toLowerCase()
  const itemType = item.item_type.toLowerCase()
  if ((animatedTabTypes.has(type) || animatedItemTypes.has(itemType)) && item.renderer_key) {
    return normalizeRendererKey(item.renderer_key)
  }

  if (animatedTabTypes.has(type) || animatedItemTypes.has(itemType)) return 'interactive_component'

  return ''
}

export function animatedConfigForTab(tab: TabContent, item: TopicItem, topicId: number): AnimatedLessonConfig {
  const config = tabConfig(tab) as AnimatedLessonConfig
  return {
    ...config,
    renderer_key: resolveAnimatedRendererKey(tab, item) || config.renderer_key,
    title: config.title ?? tab.label ?? item.title,
    description: config.description ?? tab.content ?? item.description,
    metadata: {
      ...(config.metadata ?? {}),
      topic_id: topicId,
      topic_item_id: item.id,
      ...(tab.id ? { tab_content_id: tab.id } : {}),
      tab_type: tab.tab_type,
      tab_content: tab.content,
    },
  }
}

export function normalizeOptionKey(value: unknown) {
  return String(value ?? '')
}

export function splitOrderingInput(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function toggleMultiAnswer(current: unknown, option: string) {
  const values = Array.isArray(current) ? current.map(String) : []
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option]
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

  if (query.quizId) {
    const item = items.find((candidate) => candidate.tabs.some((tab) => tabMatchesQuizTarget(tab, query.quizId!)))
    if (item) return item
  }

  if (query.questionId) {
    return items.find((candidate) => candidate.tabs.some((tab) => tabHasQuestionTarget(tab, query.questionId!))) ?? null
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

  if (query.quizId) {
    const tab = item.tabs.find((candidate) => tabMatchesQuizTarget(candidate, query.quizId!))
    if (tab) return tab
  }

  if (query.questionId) {
    return item.tabs.find((candidate) => tabHasQuestionTarget(candidate, query.questionId!))
      ?? item.tabs.find((candidate) => tabMatchesSlot(candidate, 'quiz'))
      ?? null
  }

  return null
}

function itemMatchesResourceTarget(item: TopicItem, resourceId: number) {
  return item.primary_resource?.id === resourceId || item.tabs.some((tab) => tab.resource?.id === resourceId)
}

function tabMatchesQuizTarget(tab: TabContent, quizId: number) {
  if (!tabMatchesSlot(tab, 'quiz')) return false
  const config = tabConfig(tab)
  return [
    tab.id,
    config.quiz_id,
    config.quizId,
    config.question_set_id,
    config.questionSetId,
  ].some((value) => positiveIntParam(value) === quizId)
}

function tabHasQuestionTarget(tab: TabContent, questionId: number) {
  if (!tabMatchesSlot(tab, 'quiz')) return false
  const questions = tabConfig(tab).questions
  if (!Array.isArray(questions)) return false

  return questions.some((question, index) => {
    if (!question || typeof question !== 'object') return false
    return [
      question.id,
      question.external_id,
      question.question_id,
      question.questionId,
      index + 1,
    ].some((value) => positiveIntParam(value) === questionId || String(value) === String(questionId))
  })
}
