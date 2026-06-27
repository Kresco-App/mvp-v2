import { TOPIC_INTERACTION_SESSION_CACHE_KEY_PREFIX } from './clientSessionCache'

export { TOPIC_INTERACTION_SESSION_CACHE_KEY_PREFIX } from './clientSessionCache'

type TopicInteractionCacheHit<T> = {
  hit: true
  data: T
}

type TopicInteractionCacheMiss = {
  hit: false
}

type TopicInteractionCacheResult<T> = TopicInteractionCacheHit<T> | TopicInteractionCacheMiss

export const TOPIC_INTERACTION_CACHE_TTL_MS = 2 * 60_000
export const TOPIC_INTERACTION_CACHE_MAX_ENTRIES = 96
export const TOPIC_INTERACTION_SESSION_CACHE_MAX_ENTRY_BYTES = 160_000

type PersistedTopicInteractionEntry = {
  cachedAt: number
  data: unknown
}

type PendingTopicInteractionSessionCacheWrite = {
  key: string
  data: unknown
  delete?: boolean
}

type PruneTopicInteractionSessionCacheOptions = {
  force?: boolean
}

const topicInteractionCache = new Map<string, { data: unknown; cachedAt: number }>()
const topicInteractionRequests = new Map<string, Promise<unknown>>()
const pendingTopicInteractionSessionCacheWrites = new Map<string, PendingTopicInteractionSessionCacheWrite>()
const hydratedTopicInteractionSessionKeys = new Set<string>()
let topicInteractionSessionStorageKeyIndex: Set<string> | null = null
let topicInteractionSessionCacheFlushHandle: number | null = null
let topicInteractionSessionCacheFlushMode: 'idle' | 'timeout' | null = null
let topicInteractionSessionCachePagehideListenerAttached = false

export function topicInteractionSessionStorageKey(key: string) {
  return `${TOPIC_INTERACTION_SESSION_CACHE_KEY_PREFIX}${encodeURIComponent(key)}`
}

export function readTopicInteractionCache<T>(key: string, maxAgeMs = TOPIC_INTERACTION_CACHE_TTL_MS): TopicInteractionCacheResult<T> {
  hydrateTopicInteractionSessionCacheEntry(key)
  const entry = topicInteractionCache.get(key)
  if (!entry) return { hit: false }
  if (Date.now() - entry.cachedAt > maxAgeMs) {
    deleteTopicInteractionCache(key)
    return { hit: false }
  }
  return { hit: true, data: entry.data as T }
}

export function writeTopicInteractionCache<T>(key: string, data: T) {
  hydratedTopicInteractionSessionKeys.add(key)
  topicInteractionCache.delete(key)
  topicInteractionCache.set(key, { data, cachedAt: Date.now() })
  scheduleTopicInteractionSessionCacheWrite(key, data)
  pruneTopicInteractionCache()
}

export function updateTopicInteractionCache<T>(
  key: string,
  update: (current: TopicInteractionCacheResult<T>) => T,
) {
  writeTopicInteractionCache(key, update(readTopicInteractionCache<T>(key)))
}

export function deleteTopicInteractionCache(key: string) {
  hydratedTopicInteractionSessionKeys.add(key)
  topicInteractionCache.delete(key)
  topicInteractionRequests.delete(key)
  scheduleTopicInteractionSessionCacheDelete(key)
}

export function clearTopicInteractionCache() {
  topicInteractionCache.clear()
  topicInteractionRequests.clear()
  cancelPendingTopicInteractionSessionCacheWrites()
  clearTopicInteractionSessionCache()
  hydratedTopicInteractionSessionKeys.clear()
}

export function flushPendingTopicInteractionSessionCacheWrites() {
  if (topicInteractionSessionCacheFlushHandle !== null) {
    if (topicInteractionSessionCacheFlushMode === 'idle') {
      window.cancelIdleCallback?.(topicInteractionSessionCacheFlushHandle)
    } else {
      window.clearTimeout(topicInteractionSessionCacheFlushHandle)
    }
    topicInteractionSessionCacheFlushHandle = null
    topicInteractionSessionCacheFlushMode = null
  }

  if (pendingTopicInteractionSessionCacheWrites.size === 0) return
  const writes = Array.from(pendingTopicInteractionSessionCacheWrites.values())
  pendingTopicInteractionSessionCacheWrites.clear()

  const storage = getTopicInteractionCacheStorage()
  if (!storage) return

  let wroteEntry = false
  for (const write of writes) {
    if (write.delete) {
      deleteTopicInteractionSessionCacheEntryNow(write.key, storage)
    } else {
      wroteEntry = writeTopicInteractionSessionCacheEntry(write.key, write.data, storage) || wroteEntry
    }
  }

  if (wroteEntry) pruneTopicInteractionSessionCache(storage)
}

export async function getTopicInteractionData<T>(
  key: string,
  load: () => Promise<T>,
  maxAgeMs = TOPIC_INTERACTION_CACHE_TTL_MS,
): Promise<T> {
  const cached = readTopicInteractionCache<T>(key, maxAgeMs)
  if (cached.hit) return cached.data

  const activeRequest = topicInteractionRequests.get(key) as Promise<T> | undefined
  if (activeRequest) return activeRequest

  const request = load()
    .then((data) => {
      writeTopicInteractionCache(key, data)
      return data
    })
    .finally(() => {
      topicInteractionRequests.delete(key)
    })

  topicInteractionRequests.set(key, request)
  return request
}

function pruneTopicInteractionCache() {
  const overflow = topicInteractionCache.size - TOPIC_INTERACTION_CACHE_MAX_ENTRIES
  if (overflow > 0) {
    for (const key of topicInteractionCache.keys()) {
      deleteTopicInteractionCache(key)
      if (topicInteractionCache.size <= TOPIC_INTERACTION_CACHE_MAX_ENTRIES) break
    }
  }
}

function hydrateTopicInteractionSessionCacheEntry(key: string) {
  if (hydratedTopicInteractionSessionKeys.has(key)) return
  hydratedTopicInteractionSessionKeys.add(key)
  const storage = getTopicInteractionCacheStorage()
  if (!storage) return

  const storageKey = topicInteractionSessionStorageKey(key)
  const entry = readTopicInteractionSessionCacheEntry(storage, storageKey)
  if (!entry) return

  topicInteractionCache.set(key, {
    data: entry.data,
    cachedAt: entry.cachedAt,
  })
}

function scheduleTopicInteractionSessionCacheWrite(key: string, data: unknown) {
  pendingTopicInteractionSessionCacheWrites.set(key, { key, data })
  attachTopicInteractionSessionCachePagehideListener()
  scheduleTopicInteractionSessionCacheFlush()
}

function scheduleTopicInteractionSessionCacheDelete(key: string) {
  pendingTopicInteractionSessionCacheWrites.set(key, { key, data: null, delete: true })
  attachTopicInteractionSessionCachePagehideListener()
  scheduleTopicInteractionSessionCacheFlush()
}

function scheduleTopicInteractionSessionCacheFlush() {
  if (topicInteractionSessionCacheFlushHandle !== null || typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    topicInteractionSessionCacheFlushMode = 'idle'
    topicInteractionSessionCacheFlushHandle = window.requestIdleCallback(() => {
      topicInteractionSessionCacheFlushHandle = null
      topicInteractionSessionCacheFlushMode = null
      flushPendingTopicInteractionSessionCacheWrites()
    }, { timeout: 1200 })
    return
  }

  topicInteractionSessionCacheFlushMode = 'timeout'
  topicInteractionSessionCacheFlushHandle = window.setTimeout(() => {
    topicInteractionSessionCacheFlushHandle = null
    topicInteractionSessionCacheFlushMode = null
    flushPendingTopicInteractionSessionCacheWrites()
  }, 0)
}

function attachTopicInteractionSessionCachePagehideListener() {
  if (topicInteractionSessionCachePagehideListenerAttached || typeof window === 'undefined') return
  topicInteractionSessionCachePagehideListenerAttached = true
  window.addEventListener('pagehide', flushPendingTopicInteractionSessionCacheWrites)
}

function cancelPendingTopicInteractionSessionCacheWrites() {
  if (topicInteractionSessionCacheFlushHandle !== null && typeof window !== 'undefined') {
    if (topicInteractionSessionCacheFlushMode === 'idle') {
      window.cancelIdleCallback?.(topicInteractionSessionCacheFlushHandle)
    } else {
      window.clearTimeout(topicInteractionSessionCacheFlushHandle)
    }
  }
  topicInteractionSessionCacheFlushHandle = null
  topicInteractionSessionCacheFlushMode = null
  pendingTopicInteractionSessionCacheWrites.clear()
}

function writeTopicInteractionSessionCacheEntry(key: string, data: unknown, storage: Storage) {
  const storageKey = topicInteractionSessionStorageKey(key)
  const entry: PersistedTopicInteractionEntry = {
    cachedAt: Date.now(),
    data,
  }

  try {
    const serialized = JSON.stringify(entry)
    if (serialized.length > TOPIC_INTERACTION_SESSION_CACHE_MAX_ENTRY_BYTES) {
      storage.removeItem(storageKey)
      forgetTopicInteractionSessionStorageKey(storageKey)
      return false
    }

    storage.setItem(storageKey, serialized)
    rememberTopicInteractionSessionStorageKey(storage, storageKey)
    return true
  } catch {
    storage.removeItem(storageKey)
    forgetTopicInteractionSessionStorageKey(storageKey)
    return false
  }
}

function deleteTopicInteractionSessionCacheEntryNow(key: string, storage: Storage) {
  const storageKey = topicInteractionSessionStorageKey(key)
  storage.removeItem(storageKey)
  forgetTopicInteractionSessionStorageKey(storageKey)
}

function clearTopicInteractionSessionCache() {
  const storage = getTopicInteractionCacheStorage()
  if (!storage) return

  for (const storageKey of topicInteractionSessionStorageKeys(storage)) {
    storage.removeItem(storageKey)
  }
  topicInteractionSessionStorageKeyIndex = null
}

function pruneTopicInteractionSessionCache(storage: Storage, options: PruneTopicInteractionSessionCacheOptions = {}) {
  const storageKeys = Array.from(getTopicInteractionSessionStorageKeyIndex(storage))
  if (!options.force && storageKeys.length <= TOPIC_INTERACTION_CACHE_MAX_ENTRIES) return

  const entries = storageKeys
    .map((storageKey) => {
      const entry = readTopicInteractionSessionCacheEntry(storage, storageKey)
      return entry ? { storageKey, cachedAt: entry.cachedAt } : null
    })
    .filter((entry): entry is { storageKey: string; cachedAt: number } => Boolean(entry))
    .sort((a, b) => b.cachedAt - a.cachedAt)

  for (const entry of entries.slice(TOPIC_INTERACTION_CACHE_MAX_ENTRIES)) {
    storage.removeItem(entry.storageKey)
    forgetTopicInteractionSessionStorageKey(entry.storageKey)
  }
}

function readTopicInteractionSessionCacheEntry(storage: Storage, storageKey: string): PersistedTopicInteractionEntry | null {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || 'null')
    if (!isPersistedTopicInteractionEntry(parsed)) {
      storage.removeItem(storageKey)
      forgetTopicInteractionSessionStorageKey(storageKey)
      return null
    }

    if (Date.now() - parsed.cachedAt > TOPIC_INTERACTION_CACHE_TTL_MS) {
      storage.removeItem(storageKey)
      forgetTopicInteractionSessionStorageKey(storageKey)
      return null
    }

    topicInteractionSessionStorageKeyIndex?.add(storageKey)
    return parsed
  } catch {
    storage.removeItem(storageKey)
    forgetTopicInteractionSessionStorageKey(storageKey)
    return null
  }
}

function isPersistedTopicInteractionEntry(value: unknown): value is PersistedTopicInteractionEntry {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as PersistedTopicInteractionEntry).cachedAt === 'number'
    && Number.isFinite((value as PersistedTopicInteractionEntry).cachedAt)
    && Object.prototype.hasOwnProperty.call(value, 'data')
  )
}

function topicInteractionSessionStorageKeys(storage: Storage) {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(TOPIC_INTERACTION_SESSION_CACHE_KEY_PREFIX)) keys.push(key)
  }
  return keys
}

function getTopicInteractionSessionStorageKeyIndex(storage: Storage) {
  if (!topicInteractionSessionStorageKeyIndex) {
    topicInteractionSessionStorageKeyIndex = new Set(topicInteractionSessionStorageKeys(storage))
  }
  return topicInteractionSessionStorageKeyIndex
}

function rememberTopicInteractionSessionStorageKey(storage: Storage, storageKey: string) {
  getTopicInteractionSessionStorageKeyIndex(storage).add(storageKey)
}

function forgetTopicInteractionSessionStorageKey(storageKey: string) {
  topicInteractionSessionStorageKeyIndex?.delete(storageKey)
}

function getTopicInteractionCacheStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
