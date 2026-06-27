import type { Cache, State } from 'swr'

import { API_DATA_SESSION_CACHE_KEY_PREFIX } from './clientSessionCache'

export { API_DATA_SESSION_CACHE_KEY_PREFIX } from './clientSessionCache'

export const API_DATA_SESSION_CACHE_TTL_MS = 10 * 60_000
export const API_DATA_SESSION_CACHE_MAX_ENTRIES = 64
export const API_DATA_SESSION_CACHE_MAX_ENTRY_BYTES = 320_000

type PersistedApiDataEntry = {
  cachedAt: number
  data: unknown
}

type PendingApiDataSessionCacheWrite = {
  key: string
  value: State<unknown> | null
}

type PruneApiDataSessionCacheOptions = {
  force?: boolean
}

const pendingApiDataSessionCacheWrites = new Map<string, PendingApiDataSessionCacheWrite>()
let apiDataSessionStorageKeyIndex: Set<string> | null = null
let apiDataSessionCacheFlushHandle: number | null = null
let apiDataSessionCacheFlushMode: 'idle' | 'timeout' | null = null
let apiDataSessionCachePagehideListenerAttached = false

export function apiDataSessionStorageKey(key: string) {
  return `${API_DATA_SESSION_CACHE_KEY_PREFIX}${encodeURIComponent(key)}`
}

export function isApiDataSessionCacheKey(key: string) {
  if (key === '/courses/topics' || key === '/courses/subjects') return true
  if (/^\/courses\/subjects\/[^/]+(?:\/topics)?(?:\?|$)/.test(key)) return true
  if (key === '/profile/me') return true
  if (key === '/progress/xp' || key === '/progress/stats' || key === '/progress/badges') return true
  if (key === '/progress/sidebar-summary') return true
  if (isDefaultLeaderboardCacheKey(key)) return true
  if (key === '/interactions/notes' || key.startsWith('/interactions/notes?')) return true
  if (key === '/interactions/saves' || key.startsWith('/interactions/saves?')) return true
  if (key === '/calendar/events' || key.startsWith('/calendar/events?')) return true
  if (/^\/calendar\/events\/\d+(?:\?|$)/.test(key)) return true
  if (key === '/exam-bank' || key.startsWith('/exam-bank?')) return true
  if (/^\/exam-bank\/problems\/\d+(?:\?|$)/.test(key)) return true
  if (key === '/professor/student-chat') return true
  if (isChatMessageEnvelopeCacheKey(key)) return true
  if (key === '/professor/student-live-sessions') return true
  if (isLiveRoomEnvelopeCacheKey(key)) return true
  if (key === '/professor/dashboard') return true
  if (key === '/professor/offerings') return true
  if (key === '/professor/live-sessions') return true
  if (key === '/professor/live-provider-config') return true
  if (key.startsWith('/exercises/subjects/')) return true
  if (/^\/exercises\/\d+(?:\?|$)/.test(key)) return true
  if (/^\/quizzes\/subjects\/[^/]+\/discovery(?:\?|$)/.test(key)) return true
  if (/^\/courses\/topics\/[^/]+\/workspace(?:\?|$)/.test(key)) return true
  return false
}

function isChatMessageEnvelopeCacheKey(key: string) {
  return (
    /^@"\/professor\/student-chat\/conversations\/messages",\d+,$/.test(key)
    || /^@"\/professor\/chat\/conversations\/messages",\d+,$/.test(key)
  )
}

function isLiveRoomEnvelopeCacheKey(key: string) {
  return (
    /^@"\/professor\/student-live-sessions\/embed",\d+,$/.test(key)
    || /^@"\/professor\/student-live-sessions\/interactions",\d+,$/.test(key)
    || /^@"\/professor\/live-sessions\/embed",\d+,$/.test(key)
    || /^@"\/professor\/live-sessions\/interactions",\d+,$/.test(key)
  )
}

function isDefaultLeaderboardCacheKey(key: string) {
  if (
    key !== '/progress/leaderboard'
    && !key.startsWith('/progress/leaderboard?')
    && key !== '/progress/leaderboard/seasons'
    && !key.startsWith('/progress/leaderboard/seasons?')
  ) {
    return false
  }

  return !key.includes('search=')
}

export function createApiDataCacheProvider(): Cache<unknown> {
  const cache = new Map<string, State<unknown>>()
  const hydratedSessionKeys = new Set<string>()

  return {
    keys() {
      return cache.keys()
    },
    get(key) {
      if (cache.has(key)) return cache.get(key)
      if (!hydratedSessionKeys.has(key)) {
        hydratedSessionKeys.add(key)
        const hydrated = hydrateApiDataSessionCacheEntry(key)
        if (hydrated) {
          cache.set(key, hydrated)
          return hydrated
        }
      }
      return undefined
    },
    set(key, value) {
      hydratedSessionKeys.add(key)
      cache.set(key, value)
      scheduleApiDataSessionCacheWrite(key, value)
    },
    delete(key) {
      hydratedSessionKeys.add(key)
      cache.delete(key)
      deleteApiDataSessionCacheEntry(key)
    },
  }
}

export function clearApiDataSessionCache() {
  cancelPendingApiDataSessionCacheWrites()
  const storage = getApiDataCacheStorage()
  if (!storage) return

  for (const key of apiDataSessionStorageKeys(storage)) {
    storage.removeItem(key)
  }
  apiDataSessionStorageKeyIndex = null
}

export function flushPendingApiDataSessionCacheWrites() {
  if (apiDataSessionCacheFlushHandle !== null) {
    if (apiDataSessionCacheFlushMode === 'idle') {
      window.cancelIdleCallback?.(apiDataSessionCacheFlushHandle)
    } else {
      window.clearTimeout(apiDataSessionCacheFlushHandle)
    }
    apiDataSessionCacheFlushHandle = null
    apiDataSessionCacheFlushMode = null
  }

  if (pendingApiDataSessionCacheWrites.size === 0) return
  const writes = Array.from(pendingApiDataSessionCacheWrites.values())
  pendingApiDataSessionCacheWrites.clear()

  const storage = getApiDataCacheStorage()
  if (!storage) return

  let wroteEntry = false
  for (const write of writes) {
    if (write.value) {
      wroteEntry = writeApiDataSessionCacheEntry(write.key, write.value, storage) || wroteEntry
    } else {
      deleteApiDataSessionCacheEntryNow(write.key, storage)
    }
  }

  if (wroteEntry) pruneApiDataSessionCache(storage)
}

function hydrateApiDataSessionCacheEntry(key: string): State<unknown> | null {
  if (!isApiDataSessionCacheKey(key)) return null
  const storage = getApiDataCacheStorage()
  if (!storage) return null

  const storageKey = apiDataSessionStorageKey(key)
  const entry = readApiDataSessionCacheEntry(storage, storageKey)
  if (!entry) return null

  return {
    data: entry.data,
    error: undefined,
    isLoading: false,
    isValidating: false,
  }
}

function scheduleApiDataSessionCacheWrite(key: string, value: State<unknown>) {
  if (!isApiDataSessionCacheKey(key)) return
  if (value.data === undefined && !value.error) return
  pendingApiDataSessionCacheWrites.set(key, { key, value })
  attachApiDataSessionCachePagehideListener()
  scheduleApiDataSessionCacheFlush()
}

function scheduleApiDataSessionCacheDelete(key: string) {
  if (!isApiDataSessionCacheKey(key)) return
  pendingApiDataSessionCacheWrites.set(key, { key, value: null })
  attachApiDataSessionCachePagehideListener()
  scheduleApiDataSessionCacheFlush()
}

function scheduleApiDataSessionCacheFlush() {
  if (apiDataSessionCacheFlushHandle !== null || typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    apiDataSessionCacheFlushMode = 'idle'
    apiDataSessionCacheFlushHandle = window.requestIdleCallback(() => {
      apiDataSessionCacheFlushHandle = null
      apiDataSessionCacheFlushMode = null
      flushPendingApiDataSessionCacheWrites()
    }, { timeout: 1200 })
    return
  }

  apiDataSessionCacheFlushMode = 'timeout'
  apiDataSessionCacheFlushHandle = window.setTimeout(() => {
    apiDataSessionCacheFlushHandle = null
    apiDataSessionCacheFlushMode = null
    flushPendingApiDataSessionCacheWrites()
  }, 0)
}

function attachApiDataSessionCachePagehideListener() {
  if (apiDataSessionCachePagehideListenerAttached || typeof window === 'undefined') return
  apiDataSessionCachePagehideListenerAttached = true
  window.addEventListener('pagehide', flushPendingApiDataSessionCacheWrites)
}

function cancelPendingApiDataSessionCacheWrites() {
  if (apiDataSessionCacheFlushHandle !== null && typeof window !== 'undefined') {
    if (apiDataSessionCacheFlushMode === 'idle') {
      window.cancelIdleCallback?.(apiDataSessionCacheFlushHandle)
    } else {
      window.clearTimeout(apiDataSessionCacheFlushHandle)
    }
  }
  apiDataSessionCacheFlushHandle = null
  apiDataSessionCacheFlushMode = null
  pendingApiDataSessionCacheWrites.clear()
}

function writeApiDataSessionCacheEntry(key: string, value: State<unknown>, storage: Storage) {
  if (!isApiDataSessionCacheKey(key)) return false
  const storageKey = apiDataSessionStorageKey(key)

  const data = value.data
  if (data === undefined) {
    storage.removeItem(storageKey)
    forgetApiDataSessionStorageKey(storageKey)
    return false
  }

  const entry: PersistedApiDataEntry = {
    cachedAt: Date.now(),
    data,
  }

  try {
    const serialized = JSON.stringify(entry)
    if (serialized.length > API_DATA_SESSION_CACHE_MAX_ENTRY_BYTES) {
      storage.removeItem(storageKey)
      forgetApiDataSessionStorageKey(storageKey)
      return false
    }

    try {
      storage.setItem(storageKey, serialized)
      rememberApiDataSessionStorageKey(storage, storageKey)
      return true
    } catch {
      pruneApiDataSessionCache(storage, { force: true })
      storage.setItem(storageKey, serialized)
      rememberApiDataSessionStorageKey(storage, storageKey)
      return true
    }
  } catch {
    storage.removeItem(storageKey)
    forgetApiDataSessionStorageKey(storageKey)
    return false
  }
}

function deleteApiDataSessionCacheEntry(key: string) {
  if (!getApiDataCacheStorage() || !isApiDataSessionCacheKey(key)) return
  scheduleApiDataSessionCacheDelete(key)
}

function deleteApiDataSessionCacheEntryNow(key: string, storage: Storage) {
  if (!isApiDataSessionCacheKey(key)) return
  const storageKey = apiDataSessionStorageKey(key)
  storage.removeItem(storageKey)
  forgetApiDataSessionStorageKey(storageKey)
}

function pruneApiDataSessionCache(storage: Storage, options: PruneApiDataSessionCacheOptions = {}) {
  const storageKeys = Array.from(getApiDataSessionStorageKeyIndex(storage))
  if (!options.force && storageKeys.length <= API_DATA_SESSION_CACHE_MAX_ENTRIES) return

  const entries = storageKeys
    .map((storageKey) => {
      const entry = readApiDataSessionCacheEntry(storage, storageKey)
      return entry ? { storageKey, cachedAt: entry.cachedAt } : null
    })
    .filter((entry): entry is { storageKey: string; cachedAt: number } => Boolean(entry))
    .sort((a, b) => b.cachedAt - a.cachedAt)

  for (const entry of entries.slice(API_DATA_SESSION_CACHE_MAX_ENTRIES)) {
    storage.removeItem(entry.storageKey)
    forgetApiDataSessionStorageKey(entry.storageKey)
  }
}

function readApiDataSessionCacheEntry(storage: Storage, storageKey: string): PersistedApiDataEntry | null {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || 'null')
    if (!isPersistedApiDataEntry(parsed)) {
      storage.removeItem(storageKey)
      forgetApiDataSessionStorageKey(storageKey)
      return null
    }

    if (Date.now() - parsed.cachedAt > API_DATA_SESSION_CACHE_TTL_MS) {
      storage.removeItem(storageKey)
      forgetApiDataSessionStorageKey(storageKey)
      return null
    }

    apiDataSessionStorageKeyIndex?.add(storageKey)
    return parsed
  } catch {
    storage.removeItem(storageKey)
    forgetApiDataSessionStorageKey(storageKey)
    return null
  }
}

function isPersistedApiDataEntry(value: unknown): value is PersistedApiDataEntry {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as PersistedApiDataEntry).cachedAt === 'number'
    && Number.isFinite((value as PersistedApiDataEntry).cachedAt)
    && Object.prototype.hasOwnProperty.call(value, 'data')
  )
}

function apiDataSessionStorageKeys(storage: Storage) {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(API_DATA_SESSION_CACHE_KEY_PREFIX)) keys.push(key)
  }
  return keys
}

function getApiDataSessionStorageKeyIndex(storage: Storage) {
  if (!apiDataSessionStorageKeyIndex) {
    apiDataSessionStorageKeyIndex = new Set(apiDataSessionStorageKeys(storage))
  }
  return apiDataSessionStorageKeyIndex
}

function rememberApiDataSessionStorageKey(storage: Storage, storageKey: string) {
  getApiDataSessionStorageKeyIndex(storage).add(storageKey)
}

function forgetApiDataSessionStorageKey(storageKey: string) {
  apiDataSessionStorageKeyIndex?.delete(storageKey)
}

function getApiDataCacheStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
