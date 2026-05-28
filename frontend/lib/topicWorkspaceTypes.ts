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
