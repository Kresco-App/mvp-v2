import type {
  Resource,
  TabContent,
  TopicItem,
  TopicSection,
  TopicWorkspace,
} from '@/lib/topicWorkspaceViewModel'

export function buildTopicResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 1,
    title: 'Lesson resource',
    resource_type: 'video',
    provider: 'youtube',
    provider_resource_id: 'dQw4w9WgXcQ',
    url: '',
    summary: 'Study this resource',
    ...overrides,
  }
}

export function buildTabContent(overrides: Partial<TabContent> = {}): TabContent {
  return {
    id: 1,
    label: 'Course',
    tab_type: 'course',
    content: 'Course content',
    config_json: {},
    renderer_key: '',
    order: 1,
    resource: null,
    ...overrides,
  }
}

export function buildTopicItem(overrides: Partial<TopicItem> = {}): TopicItem {
  return {
    id: 10,
    topic_id: 2,
    section_id: 4,
    title: 'Continuity introduction',
    description: 'Intro and overview',
    item_type: 'lesson',
    renderer_key: '',
    duration_seconds: 125,
    progress_status: 'in_progress',
    primary_resource: null,
    primary_tab_content_id: null,
    tabs: [],
    ...overrides,
  }
}

export function buildTopicSection(overrides: Partial<TopicSection> = {}): TopicSection {
  return {
    id: 4,
    title: 'Lessons',
    section_type: 'lesson',
    order: 1,
    items: [],
    ...overrides,
  }
}

export function buildTopicWorkspace(overrides: Partial<TopicWorkspace> = {}): TopicWorkspace {
  const activeItem = overrides.active_item ?? buildTopicItem()
  const activeItemId = overrides.active_item_id ?? activeItem?.id ?? null

  return {
    id: 2,
    subject_title: 'Math',
    title: 'Continuity',
    description: '',
    progress_pct: 0,
    completed_count: 0,
    item_count: activeItem ? 1 : 0,
    active_item_id: activeItemId,
    active_item: activeItem,
    sections: activeItem ? [buildTopicSection({ id: activeItem.section_id, items: [activeItem] })] : [],
    search_results: [],
    ...overrides,
  }
}
