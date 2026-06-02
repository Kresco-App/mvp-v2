import useSWR from 'swr'
import {
  topicWorkspaceQueryTargetsFromItemId,
  type TopicWorkspace,
  type TopicWorkspaceQueryTargets,
} from '@/lib/topicWorkspaceViewModel'

export type TopicWorkspaceDataRequest = {
  targets: TopicWorkspaceQueryTargets
  preserveActiveTab?: boolean
  preserveOpenSections?: boolean
}

export function defaultTopicWorkspaceDataRequest(): TopicWorkspaceDataRequest {
  return {
    targets: topicWorkspaceQueryTargetsFromItemId(null),
  }
}

export function topicWorkspaceSWRKey(
  topicId: string | number | null | undefined,
  targets: TopicWorkspaceQueryTargets = topicWorkspaceQueryTargetsFromItemId(null),
) {
  if (topicId == null || String(topicId).trim() === '') return null

  const params = new URLSearchParams()
  if (targets.itemId) params.set('item_id', String(targets.itemId))

  const query = params.toString()
  return `/courses/topics/${encodeURIComponent(String(topicId))}/workspace${query ? `?${query}` : ''}`
}

export function useTopicWorkspaceData(
  topicId: string | number | null | undefined,
  request: TopicWorkspaceDataRequest,
) {
  const key = topicWorkspaceSWRKey(topicId, request.targets)
  const query = useSWR<TopicWorkspace>(key, {
    keepPreviousData: true,
  })

  return {
    key,
    workspace: query.data ?? null,
    error: query.error ?? null,
    loading: query.isLoading && !query.data,
    isValidating: query.isValidating,
    mutate: query.mutate,
  }
}
