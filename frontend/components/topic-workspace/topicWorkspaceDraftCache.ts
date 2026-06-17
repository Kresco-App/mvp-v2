const topicWorkspaceDraftCache = new Map<string, unknown>()

export function readTopicWorkspaceDraft<T>(key: string, fallback: T): T {
  return topicWorkspaceDraftCache.has(key) ? (topicWorkspaceDraftCache.get(key) as T) : fallback
}

export function writeTopicWorkspaceDraft<T>(key: string, value: T) {
  topicWorkspaceDraftCache.set(key, value)
}
