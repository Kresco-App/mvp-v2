export const API_DATA_SESSION_CACHE_KEY_PREFIX = 'kresco:api-swr:v1:'
export const TOPIC_INTERACTION_SESSION_CACHE_KEY_PREFIX = 'kresco:topic-interactions:v1:'
export const TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX = 'kresco:top-nav-badges:v1:'

const CLIENT_SESSION_CACHE_KEY_PREFIXES = [
  API_DATA_SESSION_CACHE_KEY_PREFIX,
  TOPIC_INTERACTION_SESSION_CACHE_KEY_PREFIX,
  TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX,
] as const

export function clearStoredClientSessionCaches() {
  const storage = getClientSessionCacheStorage()
  if (!storage) return

  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && CLIENT_SESSION_CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.push(key)
    }
  }

  for (const key of keys) {
    storage.removeItem(key)
  }
}

function getClientSessionCacheStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
