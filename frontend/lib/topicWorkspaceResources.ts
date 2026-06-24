import { postJson } from '@/lib/apiClient'
import { apiErrorStatus } from '@/lib/apiData'
import type { Resource } from '@/lib/topicWorkspaceTypes'
import { sanitizeNavigationUrl } from '@/lib/urlSafety'

export type TopicWorkspaceResourceAction = 'open' | 'preview' | 'download'

export type TopicWorkspaceResourceContext = {
  topic_item_id?: number | null
  tab_content_id?: number | null
}

type TopicWorkspaceResourceOpenResponse = {
  url?: string
  href?: string
  location?: string
  open_url?: string
  preview_url?: string
  download_url?: string
} | string | null

const RESOURCE_OPEN_UNAVAILABLE_STATUSES = new Set([404, 405, 501])

export function hasTopicWorkspaceResourceUrl(resource?: Resource | null) {
  return Boolean(resource?.url?.trim())
}

export function topicWorkspaceResourceOpenEndpointCandidates(resourceId: number) {
  return [
    `/courses/resources/${resourceId}/open`,
    `/resources/${resourceId}/open`,
  ]
}

export function isTopicWorkspaceResourceOpenUnavailable(error: unknown) {
  const status = apiErrorStatus(error)
  return typeof status === 'number' && RESOURCE_OPEN_UNAVAILABLE_STATUSES.has(status)
}

export function resolvedTopicWorkspaceResourceUrl(
  response: TopicWorkspaceResourceOpenResponse,
  resource: Resource,
  action: TopicWorkspaceResourceAction,
) {
  if (typeof response === 'string' && response.trim()) return sanitizeNavigationUrl(response)
  if (!response || typeof response !== 'object') return sanitizeNavigationUrl(resource.url)

  const actionSpecific =
    action === 'preview'
      ? response.preview_url
      : action === 'download'
        ? response.download_url
        : response.open_url

  return sanitizeNavigationUrl(actionSpecific || response.url || response.href || response.location || resource.url)
}

export async function resolveTopicWorkspaceResourceUrl(
  resource: Resource,
  action: TopicWorkspaceResourceAction,
  context: TopicWorkspaceResourceContext = {},
) {
  const body = {
    ...(context.topic_item_id ? { topic_item_id: context.topic_item_id } : {}),
    ...(context.tab_content_id ? { tab_content_id: context.tab_content_id } : {}),
  }

  for (const endpoint of topicWorkspaceResourceOpenEndpointCandidates(resource.id)) {
    try {
      const response = await postJson<TopicWorkspaceResourceOpenResponse>(endpoint, body)
      return resolvedTopicWorkspaceResourceUrl(response, resource, action)
    } catch (error) {
      if (isTopicWorkspaceResourceOpenUnavailable(error)) continue
      throw error
    }
  }

  return sanitizeNavigationUrl(resource.url)
}
