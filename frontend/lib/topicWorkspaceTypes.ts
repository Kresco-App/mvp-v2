export interface AccessGuarded {
  can_access?: boolean
  locked_reason?: string
  access_reason?: string
  required_tier?: string
  required_feature_key?: string
  required_subject_id?: number | null
}

export interface Resource extends AccessGuarded {
  id: number
  title: string
  resource_type: string
  provider: string
  provider_resource_id: string
  url: string
  summary: string
  metadata_json?: Record<string, unknown>
}

export interface TabContent extends AccessGuarded {
  id: number
  label: string
  tab_type: string
  content: string
  config_json: any
  body_omitted?: boolean
  renderer_key: string
  order: number
  resource?: Resource | null
  is_missing?: boolean
  empty_title?: string
  empty_message?: string
}

export interface TopicItem extends AccessGuarded {
  id: number
  topic_id: number
  section_id: number
  title: string
  description: string
  item_type: string
  renderer_key: string
  duration_seconds: number
  completion_policy?: string
  progress_status: string
  watched_seconds?: number
  resume_seconds?: number
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

export interface TopicWorkspace extends AccessGuarded {
  id: number
  subject_id?: number
  subject_title: string
  slug?: string
  title: string
  description: string
  progress_pct: number
  completed_count: number
  item_count: number
  active_item_id: number | null
  sections: TopicSection[]
  active_item: TopicItem | null
  search_results: TopicItem[]
}

export interface TopicWorkspaceNote {
  id: number
  subject_id?: number | null
  topic_id?: number | null
  topic_item_id?: number | null
  tab_content_id?: number | null
  body: string
  created_at?: string
  updated_at?: string
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
