import type { AnimatedLessonConfig } from '@/components/animated/types'
import { normalizeRendererKey, tabConfig } from '@/lib/topicWorkspaceTabs'
import type { TabContent, TopicItem } from '@/lib/topicWorkspaceTypes'

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
