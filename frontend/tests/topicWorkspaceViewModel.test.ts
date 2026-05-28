import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  activeSectionIdForWorkspace,
  animatedConfigForTab,
  buildRailSections,
  buildTopicLookups,
  fallbackTabForSlot,
  formatTopicItemDuration,
  isAnimatedTab,
  lockedContentReason,
  lockedVideoSrcDoc,
  missingVideoSrcDoc,
  parseTopicWorkspaceQuery,
  defaultSecondaryTabSlotForItem,
  resolvePrimaryTab,
  resolveAnimatedRendererKey,
  resolveTabForSlot,
  resolveTabSlotForTopicWorkspaceQuery,
  secondaryTabSlotSpecsForItem,
  selectTopicWorkspaceQueryState,
  splitOrderingInput,
  topicWorkspaceQueryTargetsFromItemId,
  toggleMultiAnswer,
  youtubeSrcDoc,
  youtubeVideoId,
  type TabContent,
  type TopicItem,
  type TopicWorkspace,
} from '@/lib/topicWorkspaceViewModel'

const baseItem: TopicItem = {
  id: 10,
  topic_id: 2,
  section_id: 4,
  title: 'Limits <basics>',
  description: 'Intro & overview',
  item_type: 'lesson',
  renderer_key: '',
  duration_seconds: 125,
  progress_status: 'in_progress',
  primary_resource: {
    id: 1,
    title: 'Video',
    resource_type: 'video',
    provider: 'youtube',
    provider_resource_id: 'dQw4w9WgXcQ',
    url: '',
    summary: 'Watch this',
  },
  tabs: [],
}

const quizTab: TabContent = {
  id: 9,
  label: 'Checkpoint',
  tab_type: 'quiz',
  content: 'Answer',
  config_json: { questions: [{ id: 77, prompt: 'Question 77' }] },
  renderer_key: '',
  order: 1,
}

const resourceTab: TabContent = {
  id: 12,
  label: 'Worksheet',
  tab_type: 'resource',
  content: 'Resource summary',
  config_json: {},
  renderer_key: '',
  order: 2,
  resource: {
    id: 22,
    title: 'Worksheet PDF',
    resource_type: 'pdf',
    provider: 'local',
    provider_resource_id: '',
    url: '/worksheet.pdf',
    summary: 'Practice worksheet',
  },
}

const commentsTab: TabContent = {
  id: 13,
  label: 'Discussion',
  tab_type: 'comments',
  content: '',
  config_json: {},
  renderer_key: '',
  order: 3,
}

describe('topic workspace view model', () => {
  it('formats videos and escapes srcdoc content', () => {
    expect(formatTopicItemDuration(125)).toBe('2:05')
    expect(youtubeVideoId(baseItem)).toBe('dQw4w9WgXcQ')
    expect(youtubeSrcDoc(baseItem, 'abc123')).toContain('Limits &lt;basics&gt;')
    expect(youtubeSrcDoc(baseItem, 'abc123')).not.toContain('<img')
    expect(youtubeSrcDoc(baseItem, 'abc123')).toContain('/_next/image?')
    expect(lockedVideoSrcDoc(baseItem)).toContain('Intro &amp; overview')
    expect(missingVideoSrcDoc({ ...baseItem, title: '' })).toContain('Lesson video')
  })

  it('maps workspace sections into rail data with lock metadata', () => {
    const lockedItem = { ...baseItem, id: 11, can_access: false, locked_reason: 'vip_required', progress_status: 'completed' }
    const workspace: TopicWorkspace = {
      id: 2,
      subject_title: 'Math',
      title: 'Continuity',
      description: '',
      progress_pct: 0,
      completed_count: 0,
      item_count: 2,
      active_item_id: baseItem.id,
      active_item: baseItem,
      search_results: [],
      sections: [{ id: 4, title: 'Lessons', section_type: 'lesson', order: 1, items: [baseItem, lockedItem] }],
    }

    const lookups = buildTopicLookups(workspace.sections)
    const rail = buildRailSections(workspace, lockedItem.id, new Set([4]))

    expect(lookups.itemById.get(baseItem.id)?.title).toBe(baseItem.title)
    expect(activeSectionIdForWorkspace(workspace, lockedItem.id)).toBe(4)
    expect(rail[0].copy).toBe('Learn the basics of the subject.')
    expect(rail[0].items?.[1]).toMatchObject({ active: true, completed: true, disabled: true, meta: 'VIP required' })
    expect(lockedContentReason('feature_required:labs')).toBe('Feature locked')
  })

  it('resolves real and fallback tabs for each slot', () => {
    const item = { ...baseItem, tabs: [quizTab] }

    expect(resolveTabForSlot(item.tabs, 'quiz', item)).toBe(quizTab)
    expect(fallbackTabForSlot('course', { ...item, description: '' })).toMatchObject({
      is_missing: true,
      empty_title: 'No course content yet',
    })
    expect(fallbackTabForSlot('resources', item)).toMatchObject({
      resource: baseItem.primary_resource,
      is_missing: false,
    })
    expect(fallbackTabForSlot('comments', item)).toMatchObject({
      is_missing: true,
      empty_title: 'Comments unavailable',
    })
  })

  it('distinguishes the primary center tab from secondary tabs', () => {
    const item = {
      ...baseItem,
      primary_tab_content_id: quizTab.id,
      primary_tab: quizTab,
      tabs: [resourceTab, quizTab, commentsTab],
    }

    expect(resolvePrimaryTab(item)).toBe(quizTab)
    expect(secondaryTabSlotSpecsForItem(item).map((slot) => slot.id)).toEqual(['course', 'lab', 'resources', 'notes', 'comments'])
    expect(defaultSecondaryTabSlotForItem(item)).toBe('resources')
  })

  it('parses workspace route query targets defensively', () => {
    expect(parseTopicWorkspaceQuery(new URLSearchParams('item=10&item_id=11&tab=9&resource=-1&quiz=abc&question=77'))).toEqual({
      itemId: 10,
      tabId: 9,
      resourceId: null,
      quizId: null,
      questionId: 77,
    })
    expect(topicWorkspaceQueryTargetsFromItemId(10.5).itemId).toBeNull()
  })

  it('selects the active item and tab slot from profile deep links', () => {
    const resourceItem = {
      ...baseItem,
      id: 11,
      section_id: 5,
      title: 'Practice resources',
      tabs: [resourceTab, quizTab],
    }
    const workspace: TopicWorkspace = {
      id: 2,
      subject_title: 'Math',
      title: 'Continuity',
      description: '',
      progress_pct: 0,
      completed_count: 0,
      item_count: 2,
      active_item_id: baseItem.id,
      active_item: baseItem,
      search_results: [],
      sections: [
        { id: 4, title: 'Lessons', section_type: 'lesson', order: 1, items: [baseItem] },
        { id: 5, title: 'Practice', section_type: 'practice', order: 2, items: [resourceItem] },
      ],
    }

    expect(selectTopicWorkspaceQueryState(workspace, {
      ...topicWorkspaceQueryTargetsFromItemId(null),
      tabId: resourceTab.id,
    })).toEqual({ activeItemId: resourceItem.id, activeTabSlot: 'quiz' })
    expect(selectTopicWorkspaceQueryState(workspace, {
      ...topicWorkspaceQueryTargetsFromItemId(null),
      resourceId: resourceTab.resource?.id ?? null,
    })).toEqual({ activeItemId: resourceItem.id, activeTabSlot: 'quiz' })
    expect(resolveTabSlotForTopicWorkspaceQuery(resourceItem, {
      ...topicWorkspaceQueryTargetsFromItemId(resourceItem.id),
      quizId: quizTab.id,
    })).toBe('quiz')
    expect(resolveTabSlotForTopicWorkspaceQuery(resourceItem, {
      ...topicWorkspaceQueryTargetsFromItemId(resourceItem.id),
      questionId: 77,
    })).toBe('quiz')
    expect(resolveTabSlotForTopicWorkspaceQuery(baseItem, {
      ...topicWorkspaceQueryTargetsFromItemId(baseItem.id),
      resourceId: baseItem.primary_resource?.id ?? null,
    })).toBe('course')
  })

  it('detects animated tabs and builds renderer config metadata', () => {
    const tab = {
      ...quizTab,
      tab_type: 'lab',
      renderer_key: '',
      config_json: { rendererKey: 'wave_lab', metadata: { source: 'test' } },
    }

    expect(isAnimatedTab(tab, { ...baseItem, item_type: 'lab' })).toBe(true)
    expect(resolveAnimatedRendererKey(tab, baseItem)).toBe('wave_lab')
    expect(animatedConfigForTab(tab, baseItem, 99)).toMatchObject({
      renderer_key: 'wave_lab',
      metadata: {
        source: 'test',
        topic_id: 99,
        topic_item_id: baseItem.id,
        tab_content_id: tab.id,
      },
    })
  })

  it('normalizes quiz answer helpers', () => {
    expect(splitOrderingInput('first, second,, third')).toEqual(['first', 'second', 'third'])
    expect(toggleMultiAnswer(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleMultiAnswer(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('keeps topic workspace helpers split behind a compatibility barrel', () => {
    const barrel = readFileSync(resolve(process.cwd(), 'lib/topicWorkspaceViewModel.ts'), 'utf8')

    expect(barrel).toContain('@/lib/topicWorkspaceRendering')
    expect(barrel).toContain('@/lib/topicWorkspaceSelection')
    expect(barrel).toContain('@/lib/topicWorkspaceTabs')
    expect(barrel).toContain('@/lib/topicWorkspaceAnimation')
    expect(barrel).not.toMatch(/function\s+(youtubeSrcDoc|selectTopicWorkspaceQueryState|animatedConfigForTab)\s*\(/)
  })
})
