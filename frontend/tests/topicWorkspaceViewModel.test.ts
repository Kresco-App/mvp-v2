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
  primaryVideoResourceForDisplay,
  defaultSecondaryTabSlotForItem,
  resolvePrimaryTab,
  resolveAnimatedRendererKey,
  resolveTabForSlot,
  resolveTabSlotForTopicWorkspaceQuery,
  secondaryTabSlotSpecsForItem,
  selectTopicWorkspaceQueryState,
  shouldUseTopicItemVideoPlayer,
  topicWorkspaceQueryTargetsFromItemId,
  youtubeSrcDoc,
  youtubeVideoId,
  youtubeVideoIdForTab,
  type TabContent,
  type TopicItem,
  type TopicWorkspace,
} from '@/lib/topicWorkspaceViewModel'
import {
  buildTabContent,
  buildTopicItem,
  buildTopicResource,
  buildTopicSection,
  buildTopicWorkspace,
} from './factories/topicWorkspace'

const baseItem: TopicItem = buildTopicItem({
  id: 10,
  title: 'Limits <basics>',
  description: 'Intro & overview',
  primary_resource: buildTopicResource({
    id: 1,
    title: 'Video',
    summary: 'Watch this',
  }),
})

const resourceTab: TabContent = buildTabContent({
  id: 12,
  label: 'Worksheet',
  tab_type: 'resource',
  content: 'Resource summary',
  order: 2,
  resource: buildTopicResource({
    id: 22,
    title: 'Worksheet PDF',
    resource_type: 'pdf',
    provider: 'local',
    provider_resource_id: '',
    url: '/worksheet.pdf',
    summary: 'Practice worksheet',
  }),
})

const commentsTab: TabContent = buildTabContent({
  id: 13,
  label: 'Discussion',
  tab_type: 'comments',
  content: '',
  order: 3,
})

const providerVideoTab: TabContent = buildTabContent({
  id: 14,
  label: 'Lesson video',
  tab_type: 'video',
  content: '',
  renderer_key: 'vdocipher',
  order: 0,
  resource: buildTopicResource({
    id: 33,
    title: 'VdoCipher stream',
    resource_type: 'video',
    provider: 'vdocipher',
    provider_resource_id: 'demo-preview',
    url: 'https://cdn.example/video',
    summary: 'Provider stream',
  }),
})

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

  it('keeps provider-backed topic item videos on the provider player path', () => {
    const providerVideoItem: TopicItem = {
      ...baseItem,
      primary_resource: providerVideoTab.resource,
      primary_tab_content_id: providerVideoTab.id,
      primary_tab: providerVideoTab,
      tabs: [providerVideoTab, resourceTab],
    }

    expect(primaryVideoResourceForDisplay(providerVideoTab, providerVideoItem)).toBe(providerVideoTab.resource)
    expect(youtubeVideoId(providerVideoItem)).toBeNull()
    expect(youtubeVideoIdForTab(providerVideoTab, providerVideoItem)).toBeNull()
    expect(shouldUseTopicItemVideoPlayer(providerVideoTab, providerVideoItem)).toBe(true)
  })

  it('maps workspace sections into rail data with lock metadata', () => {
    const lockedItem = { ...baseItem, id: 11, can_access: false, locked_reason: 'vip_required', progress_status: 'completed' }
    const workspace: TopicWorkspace = buildTopicWorkspace({
      item_count: 2,
      active_item_id: baseItem.id,
      active_item: baseItem,
      sections: [buildTopicSection({ id: 4, items: [baseItem, lockedItem] })],
    })

    const lookups = buildTopicLookups(workspace.sections)
    const rail = buildRailSections(workspace, lockedItem.id, new Set([4]))

    expect(lookups.itemById.get(baseItem.id)?.title).toBe(baseItem.title)
    expect(activeSectionIdForWorkspace(workspace, lockedItem.id)).toBe(4)
    expect(rail[0].copy).toBe('Notions essentielles.')
    expect(rail[0].items?.[1]).toMatchObject({ active: true, completed: true, disabled: true, meta: 'VIP required' })
    expect(lockedContentReason('feature_required:labs')).toBe('Feature locked')
  })

  it('resolves real and fallback tabs for each slot', () => {
    const item = { ...baseItem, tabs: [resourceTab] }

    expect(resolveTabForSlot(item.tabs, 'resources', item)).toBe(resourceTab)
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
      primary_tab_content_id: resourceTab.id,
      primary_tab: resourceTab,
      tabs: [resourceTab, commentsTab],
    }

    expect(resolvePrimaryTab(item)).toBe(resourceTab)
    expect(secondaryTabSlotSpecsForItem(item).map((slot) => slot.id)).toEqual(['course', 'lab', 'notes', 'comments'])
    expect(defaultSecondaryTabSlotForItem(item)).toBe('comments')
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
      tabs: [resourceTab],
    }
    const workspace: TopicWorkspace = buildTopicWorkspace({
      item_count: 2,
      active_item_id: baseItem.id,
      active_item: baseItem,
      sections: [
        buildTopicSection({ id: 4, items: [baseItem] }),
        buildTopicSection({ id: 5, title: 'Practice', section_type: 'practice', order: 2, items: [resourceItem] }),
      ],
    })

    expect(selectTopicWorkspaceQueryState(workspace, {
      ...topicWorkspaceQueryTargetsFromItemId(null),
      tabId: resourceTab.id,
    })).toEqual({ activeItemId: resourceItem.id, activeTabSlot: 'course' })
    expect(selectTopicWorkspaceQueryState(workspace, {
      ...topicWorkspaceQueryTargetsFromItemId(null),
      resourceId: resourceTab.resource?.id ?? null,
    })).toEqual({ activeItemId: resourceItem.id, activeTabSlot: 'course' })
    expect(resolveTabSlotForTopicWorkspaceQuery(resourceItem, {
      ...topicWorkspaceQueryTargetsFromItemId(resourceItem.id),
      quizId: 9,
    })).toBe('course')
    expect(resolveTabSlotForTopicWorkspaceQuery(resourceItem, {
      ...topicWorkspaceQueryTargetsFromItemId(resourceItem.id),
      questionId: 77,
    })).toBe('course')
    expect(resolveTabSlotForTopicWorkspaceQuery(baseItem, {
      ...topicWorkspaceQueryTargetsFromItemId(baseItem.id),
      resourceId: baseItem.primary_resource?.id ?? null,
    })).toBe('course')
  })

  it('detects animated tabs and builds renderer config metadata', () => {
    const tab = {
      ...resourceTab,
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

  it('keeps topic workspace helpers split behind a compatibility barrel', () => {
    const barrel = readFileSync(resolve(process.cwd(), 'lib/topicWorkspaceViewModel.ts'), 'utf8')

    expect(barrel).toContain('@/lib/topicWorkspaceRendering')
    expect(barrel).toContain('@/lib/topicWorkspaceSelection')
    expect(barrel).toContain('@/lib/topicWorkspaceTabs')
    expect(barrel).toContain('@/lib/topicWorkspaceAnimation')
    expect(barrel).not.toMatch(/function\s+(youtubeSrcDoc|selectTopicWorkspaceQueryState|animatedConfigForTab)\s*\(/)
  })
})
