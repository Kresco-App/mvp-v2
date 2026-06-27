export const ZED_ACTIVE_DOCUMENT_STORAGE_KEY = 'kresco:zed:active-document:v1'

export const ZED_LEGACY_ACTIVE_DOCUMENT_STORAGE_KEY = 'kresco_zed_active_document'

export function zedUserScopedStorageKey(base: string, userId: string | number | null) {
  return userId !== null ? `${base}:${userId}` : base
}

export function zedLegacyUserScopedStorageKey(base: string, userId: string | number | null) {
  return userId !== null ? `${base}_${userId}` : base
}

type ZedStorageCacheState = {
  cache: Map<string, string | null>
  eventsAttached: boolean
  knownLength: number | null
  mutatorsPatched: boolean
}

type PendingZedStorageWrite = {
  legacyStorageKey?: string
  storageKey: string
  type: 'set' | 'remove'
  value?: string
}

const zedStorageState = (() => {
  const scope = globalThis as typeof globalThis & { __krescoZedStorageState?: ZedStorageCacheState }
  scope.__krescoZedStorageState ??= {
    cache: new Map<string, string | null>(),
    eventsAttached: false,
    knownLength: null,
    mutatorsPatched: false,
  }
  return scope.__krescoZedStorageState
})()
const pendingZedStorageWrites = new Map<string, PendingZedStorageWrite>()
let zedStorageFlushHandle: number | null = null
let zedStorageFlushMode: 'idle' | 'timeout' | null = null
let zedStoragePagehideListenerAttached = false

function isZedStorageKey(storageKey: string) {
  return storageKey.startsWith('kresco:zed') || storageKey.startsWith('kresco_zed')
}

function isLocalStorage(storage: Storage) {
  return typeof window !== 'undefined' && storage === window.localStorage
}

function patchZedStorageMutators() {
  if (zedStorageState.mutatorsPatched || typeof window === 'undefined') return

  const storagePrototype = window.Storage?.prototype
  if (!storagePrototype) return

  zedStorageState.mutatorsPatched = true

  const originalSetItem = storagePrototype.setItem
  const originalRemoveItem = storagePrototype.removeItem
  const originalClear = storagePrototype.clear

  storagePrototype.setItem = function setItem(this: Storage, key: string, value: string) {
    const result = originalSetItem.call(this, key, value)
    if (isLocalStorage(this)) {
      const storageKey = String(key)
      if (isZedStorageKey(storageKey)) {
        zedStorageState.cache.set(storageKey, String(value))
      }
      updateZedStorageLength()
    }
    return result
  }

  storagePrototype.removeItem = function removeItem(this: Storage, key: string) {
    const result = originalRemoveItem.call(this, key)
    if (isLocalStorage(this)) {
      const storageKey = String(key)
      if (isZedStorageKey(storageKey)) {
        zedStorageState.cache.set(storageKey, null)
      }
      updateZedStorageLength()
    }
    return result
  }

  storagePrototype.clear = function clear(this: Storage) {
    const result = originalClear.call(this)
    if (isLocalStorage(this)) {
      zedStorageState.cache.clear()
      updateZedStorageLength()
    }
    return result
  }
}

function attachZedStorageInvalidation() {
  if (zedStorageState.eventsAttached || typeof window === 'undefined') return

  patchZedStorageMutators()
  zedStorageState.eventsAttached = true
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return

    if (event.key === null) {
      zedStorageState.cache.clear()
    } else {
      zedStorageState.cache.delete(event.key)
    }
    zedStorageState.knownLength = null
  })
}

function syncZedStorageLength() {
  const currentLength = localStorage.length
  if (zedStorageState.knownLength !== null && zedStorageState.knownLength !== currentLength) {
    zedStorageState.cache.clear()
  }
  zedStorageState.knownLength = currentLength
}

function updateZedStorageLength() {
  zedStorageState.knownLength = localStorage.length
}

function readZedStorageValue(storageKey: string) {
  if (zedStorageState.cache.has(storageKey)) {
    return zedStorageState.cache.get(storageKey) ?? null
  }

  const value = localStorage.getItem(storageKey)
  zedStorageState.cache.set(storageKey, value)
  return value
}

export function zedStorageGetItem(storageKey: string, legacyStorageKey?: string) {
  if (typeof window === 'undefined') return null

  try {
    attachZedStorageInvalidation()
    syncZedStorageLength()

    const current = readZedStorageValue(storageKey)
    if (current !== null) return current

    if (!legacyStorageKey) return null

    const legacy = readZedStorageValue(legacyStorageKey)
    if (legacy !== null) {
      localStorage.setItem(storageKey, legacy)
      localStorage.removeItem(legacyStorageKey)
      zedStorageState.cache.set(storageKey, legacy)
      zedStorageState.cache.set(legacyStorageKey, null)
      updateZedStorageLength()
    }
    return legacy
  } catch {
    zedStorageState.cache.delete(storageKey)
    if (legacyStorageKey) zedStorageState.cache.delete(legacyStorageKey)
    zedStorageState.knownLength = null
    return null
  }
}

export function zedStorageSetItem(storageKey: string, value: string, legacyStorageKey?: string) {
  if (typeof window === 'undefined') return

  try {
    attachZedStorageInvalidation()
    localStorage.setItem(storageKey, value)
    if (legacyStorageKey) localStorage.removeItem(legacyStorageKey)
    zedStorageState.cache.set(storageKey, value)
    if (legacyStorageKey) zedStorageState.cache.set(legacyStorageKey, null)
    updateZedStorageLength()
  } catch {
    zedStorageState.cache.delete(storageKey)
    if (legacyStorageKey) zedStorageState.cache.delete(legacyStorageKey)
    zedStorageState.knownLength = null
    // Local Zed persistence is best-effort.
  }
}

export function zedStorageRemoveItem(storageKey: string, legacyStorageKey?: string) {
  if (typeof window === 'undefined') return

  try {
    attachZedStorageInvalidation()
    localStorage.removeItem(storageKey)
    if (legacyStorageKey) localStorage.removeItem(legacyStorageKey)
    zedStorageState.cache.set(storageKey, null)
    if (legacyStorageKey) zedStorageState.cache.set(legacyStorageKey, null)
    updateZedStorageLength()
  } catch {
    zedStorageState.cache.delete(storageKey)
    if (legacyStorageKey) zedStorageState.cache.delete(legacyStorageKey)
    zedStorageState.knownLength = null
    // Local Zed persistence is best-effort.
  }
}

export function zedStorageSetItemDeferred(storageKey: string, value: string, legacyStorageKey?: string) {
  if (typeof window === 'undefined') return
  pendingZedStorageWrites.set(storageKey, { type: 'set', storageKey, value, legacyStorageKey })
  zedStorageState.cache.set(storageKey, value)
  if (legacyStorageKey) zedStorageState.cache.set(legacyStorageKey, null)
  attachZedStoragePagehideListener()
  scheduleZedStorageFlush()
}

export function zedStorageRemoveItemDeferred(storageKey: string, legacyStorageKey?: string) {
  if (typeof window === 'undefined') return
  pendingZedStorageWrites.set(storageKey, { type: 'remove', storageKey, legacyStorageKey })
  zedStorageState.cache.set(storageKey, null)
  if (legacyStorageKey) zedStorageState.cache.set(legacyStorageKey, null)
  attachZedStoragePagehideListener()
  scheduleZedStorageFlush()
}

export function flushPendingZedStorageWrites() {
  if (typeof window === 'undefined') return
  if (zedStorageFlushHandle !== null) {
    if (zedStorageFlushMode === 'idle') {
      window.cancelIdleCallback?.(zedStorageFlushHandle)
    } else {
      window.clearTimeout(zedStorageFlushHandle)
    }
    zedStorageFlushHandle = null
    zedStorageFlushMode = null
  }

  if (pendingZedStorageWrites.size === 0) return
  const writes = Array.from(pendingZedStorageWrites.values())
  pendingZedStorageWrites.clear()

  for (const write of writes) {
    if (write.type === 'set') {
      zedStorageSetItem(write.storageKey, write.value ?? '', write.legacyStorageKey)
    } else {
      zedStorageRemoveItem(write.storageKey, write.legacyStorageKey)
    }
  }
}

function scheduleZedStorageFlush() {
  if (zedStorageFlushHandle !== null || typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    zedStorageFlushMode = 'idle'
    zedStorageFlushHandle = window.requestIdleCallback(() => {
      zedStorageFlushHandle = null
      zedStorageFlushMode = null
      flushPendingZedStorageWrites()
    }, { timeout: 900 })
    return
  }

  zedStorageFlushMode = 'timeout'
  zedStorageFlushHandle = window.setTimeout(() => {
    zedStorageFlushHandle = null
    zedStorageFlushMode = null
    flushPendingZedStorageWrites()
  }, 300)
}

function attachZedStoragePagehideListener() {
  if (zedStoragePagehideListenerAttached || typeof window === 'undefined') return
  zedStoragePagehideListenerAttached = true
  window.addEventListener('pagehide', flushPendingZedStorageWrites)
}
