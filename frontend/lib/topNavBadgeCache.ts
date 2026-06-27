import type { NotificationItem, NotificationList } from '@/lib/notifications'
import type { StudentProfessorChatStatus } from '@/lib/professor'

import { TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX } from './clientSessionCache'

export { TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX } from './clientSessionCache'

type NotificationsModule = typeof import('@/lib/notifications')
type ProfessorModule = typeof import('@/lib/professor')

type PersistedTopNavCacheEntry<T> = {
  updatedAt: number
  data: T
}

type PendingTopNavSessionCacheWrite = {
  storageKey: string
  entry: PersistedTopNavCacheEntry<unknown>
}

type PruneTopNavBadgeSessionCacheOptions = {
  force?: boolean
}

export const TOP_NAV_BADGE_CACHE_TTL_MS = 30_000
export const TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRIES = 16
export const TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRY_BYTES = 80_000

const topNavNotificationCache = new Map<string, { data: NotificationList; updatedAt: number }>()
const topNavNotificationRequests = new Map<string, Promise<NotificationList>>()
const topNavProfessorChatCache = new Map<string, { unreadCount: number; updatedAt: number }>()
const topNavProfessorChatRequests = new Map<string, Promise<number>>()
const pendingTopNavSessionCacheWrites = new Map<string, PendingTopNavSessionCacheWrite>()
let notificationsModulePromise: Promise<NotificationsModule> | null = null
let professorModulePromise: Promise<ProfessorModule> | null = null
let topNavBadgeSessionStorageKeyIndex: Set<string> | null = null
let topNavSessionCacheFlushHandle: number | null = null
let topNavSessionCacheFlushMode: 'idle' | 'timeout' | null = null
let topNavSessionCachePagehideListenerAttached = false

export function loadTopNavNotifications(userId: string, { force = false }: { force?: boolean } = {}) {
  const cached = readTopNavNotificationCache(userId)
  if (!force && cached) return Promise.resolve(cached)

  const existing = topNavNotificationRequests.get(userId)
  if (existing) return existing

  const request = loadNotificationsModule()
    .then(({ listNotifications }) => listNotifications())
    .then((data) => {
      writeTopNavNotificationCache(userId, data)
      return data
    })
    .finally(() => {
      topNavNotificationRequests.delete(userId)
    })

  topNavNotificationRequests.set(userId, request)
  return request
}

export function readTopNavNotificationCache(userId: string) {
  const cached = topNavNotificationCache.get(userId)
  if (cached && isFreshTopNavCacheEntry(cached.updatedAt)) return cached.data
  if (cached) topNavNotificationCache.delete(userId)

  const persisted = readTopNavBadgeSessionCacheEntry<NotificationList>(topNavNotificationSessionStorageKey(userId))
  if (!persisted) return null

  topNavNotificationCache.set(userId, persisted)
  return persisted.data
}

export function writeCurrentNotificationCache(userId: string | null, notifications: NotificationItem[], unreadCount: number) {
  if (!userId) return
  writeTopNavNotificationCache(userId, {
    notifications,
    unread_count: unreadCount,
  })
}

export async function markTopNavNotificationRead(notificationId: number) {
  const { markNotificationRead } = await loadNotificationsModule()
  return markNotificationRead(notificationId)
}

export async function markAllTopNavNotificationsRead() {
  const { markAllNotificationsRead } = await loadNotificationsModule()
  return markAllNotificationsRead()
}

export async function deleteTopNavNotification(notificationId: number) {
  const { deleteNotification } = await loadNotificationsModule()
  return deleteNotification(notificationId)
}

export async function deleteAllTopNavNotifications() {
  const { deleteAllNotifications } = await loadNotificationsModule()
  return deleteAllNotifications()
}

export function loadTopNavProfessorChatUnread(userId: string, { force = false }: { force?: boolean } = {}) {
  const cached = readTopNavProfessorChatCache(userId)
  if (!force && cached !== null) return Promise.resolve(cached)

  const existing = topNavProfessorChatRequests.get(userId)
  if (existing) return existing

  const request = loadProfessorModule()
    .then(({ getStudentProfessorChat }) => getStudentProfessorChat())
    .then((data) => {
      const unreadCount = studentProfessorChatUnreadCount(data)
      writeTopNavProfessorChatCache(userId, unreadCount)
      return unreadCount
    })
    .finally(() => {
      topNavProfessorChatRequests.delete(userId)
    })

  topNavProfessorChatRequests.set(userId, request)
  return request
}

export function readTopNavProfessorChatCache(userId: string) {
  const cached = topNavProfessorChatCache.get(userId)
  if (cached && isFreshTopNavCacheEntry(cached.updatedAt)) return cached.unreadCount
  if (cached) topNavProfessorChatCache.delete(userId)

  const persisted = readTopNavBadgeSessionCacheEntry<number>(topNavProfessorChatSessionStorageKey(userId))
  if (!persisted) return null

  topNavProfessorChatCache.set(userId, { unreadCount: persisted.data, updatedAt: persisted.updatedAt })
  return persisted.data
}

export function clearTopNavBadgeCache() {
  topNavNotificationCache.clear()
  topNavNotificationRequests.clear()
  topNavProfessorChatCache.clear()
  topNavProfessorChatRequests.clear()
  cancelPendingTopNavSessionCacheWrites()
  clearTopNavBadgeSessionCache()
}

export function flushPendingTopNavBadgeSessionCacheWrites() {
  if (topNavSessionCacheFlushHandle !== null) {
    if (topNavSessionCacheFlushMode === 'idle') {
      window.cancelIdleCallback?.(topNavSessionCacheFlushHandle)
    } else {
      window.clearTimeout(topNavSessionCacheFlushHandle)
    }
    topNavSessionCacheFlushHandle = null
    topNavSessionCacheFlushMode = null
  }

  if (pendingTopNavSessionCacheWrites.size === 0) return
  const writes = Array.from(pendingTopNavSessionCacheWrites.values())
  pendingTopNavSessionCacheWrites.clear()

  const storage = getTopNavBadgeCacheStorage()
  if (!storage) return

  let wroteEntry = false
  for (const write of writes) {
    wroteEntry = writeTopNavBadgeSessionCacheEntryNow(write.storageKey, write.entry, storage) || wroteEntry
  }

  if (wroteEntry) pruneTopNavBadgeSessionCache(storage)
}

export function topNavNotificationSessionStorageKey(userId: string) {
  return topNavBadgeSessionStorageKey(`notifications:${userId}`)
}

export function topNavProfessorChatSessionStorageKey(userId: string) {
  return topNavBadgeSessionStorageKey(`professor-chat:${userId}`)
}

function writeTopNavNotificationCache(userId: string, data: NotificationList) {
  const updatedAt = Date.now()
  topNavNotificationCache.set(userId, { data, updatedAt })
  scheduleTopNavBadgeSessionCacheWrite(topNavNotificationSessionStorageKey(userId), { updatedAt, data })
}

function writeTopNavProfessorChatCache(userId: string, unreadCount: number) {
  const updatedAt = Date.now()
  topNavProfessorChatCache.set(userId, { unreadCount, updatedAt })
  scheduleTopNavBadgeSessionCacheWrite(topNavProfessorChatSessionStorageKey(userId), { updatedAt, data: unreadCount })
}

function studentProfessorChatUnreadCount(status: StudentProfessorChatStatus) {
  if (!status.eligible) return 0
  if (status.teacher_threads?.length) {
    return status.teacher_threads.reduce((total, thread) => total + Math.max(0, thread.unread_count), 0)
  }
  return status.conversations.reduce((total, conversation) => total + Math.max(0, conversation.unread_for_student), 0)
}

function isFreshTopNavCacheEntry(updatedAt: number) {
  return Date.now() - updatedAt < TOP_NAV_BADGE_CACHE_TTL_MS
}

function topNavBadgeSessionStorageKey(key: string) {
  return `${TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX}${encodeURIComponent(key)}`
}

function scheduleTopNavBadgeSessionCacheWrite<T>(storageKey: string, entry: PersistedTopNavCacheEntry<T>) {
  pendingTopNavSessionCacheWrites.set(storageKey, {
    storageKey,
    entry: entry as PersistedTopNavCacheEntry<unknown>,
  })
  attachTopNavBadgeSessionCachePagehideListener()
  scheduleTopNavBadgeSessionCacheFlush()
}

function scheduleTopNavBadgeSessionCacheFlush() {
  if (topNavSessionCacheFlushHandle !== null || typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    topNavSessionCacheFlushMode = 'idle'
    topNavSessionCacheFlushHandle = window.requestIdleCallback(() => {
      topNavSessionCacheFlushHandle = null
      topNavSessionCacheFlushMode = null
      flushPendingTopNavBadgeSessionCacheWrites()
    }, { timeout: 1200 })
    return
  }

  topNavSessionCacheFlushMode = 'timeout'
  topNavSessionCacheFlushHandle = window.setTimeout(() => {
    topNavSessionCacheFlushHandle = null
    topNavSessionCacheFlushMode = null
    flushPendingTopNavBadgeSessionCacheWrites()
  }, 0)
}

function attachTopNavBadgeSessionCachePagehideListener() {
  if (topNavSessionCachePagehideListenerAttached || typeof window === 'undefined') return
  topNavSessionCachePagehideListenerAttached = true
  window.addEventListener('pagehide', flushPendingTopNavBadgeSessionCacheWrites)
}

function cancelPendingTopNavSessionCacheWrites() {
  if (topNavSessionCacheFlushHandle !== null && typeof window !== 'undefined') {
    if (topNavSessionCacheFlushMode === 'idle') {
      window.cancelIdleCallback?.(topNavSessionCacheFlushHandle)
    } else {
      window.clearTimeout(topNavSessionCacheFlushHandle)
    }
  }
  topNavSessionCacheFlushHandle = null
  topNavSessionCacheFlushMode = null
  pendingTopNavSessionCacheWrites.clear()
}

function writeTopNavBadgeSessionCacheEntryNow<T>(storageKey: string, entry: PersistedTopNavCacheEntry<T>, storage: Storage) {
  try {
    const serialized = JSON.stringify(entry)
    if (serialized.length > TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRY_BYTES) {
      storage.removeItem(storageKey)
      forgetTopNavBadgeSessionStorageKey(storageKey)
      return false
    }

    try {
      storage.setItem(storageKey, serialized)
      rememberTopNavBadgeSessionStorageKey(storage, storageKey)
      return true
    } catch {
      pruneTopNavBadgeSessionCache(storage, { force: true })
      storage.setItem(storageKey, serialized)
      rememberTopNavBadgeSessionStorageKey(storage, storageKey)
      return true
    }
  } catch {
    storage.removeItem(storageKey)
    forgetTopNavBadgeSessionStorageKey(storageKey)
    return false
  }
}

function readTopNavBadgeSessionCacheEntry<T>(storageKey: string): { data: T; updatedAt: number } | null {
  const storage = getTopNavBadgeCacheStorage()
  if (!storage) return null

  return readTopNavBadgeSessionCacheEntryNow<T>(storage, storageKey)
}

function readTopNavBadgeSessionCacheEntryNow<T>(storage: Storage, storageKey: string): { data: T; updatedAt: number } | null {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || 'null')
    if (!isPersistedTopNavCacheEntry(parsed) || !isFreshTopNavCacheEntry(parsed.updatedAt)) {
      storage.removeItem(storageKey)
      forgetTopNavBadgeSessionStorageKey(storageKey)
      return null
    }
    topNavBadgeSessionStorageKeyIndex?.add(storageKey)
    return { data: parsed.data as T, updatedAt: parsed.updatedAt }
  } catch {
    storage.removeItem(storageKey)
    forgetTopNavBadgeSessionStorageKey(storageKey)
    return null
  }
}

function clearTopNavBadgeSessionCache() {
  const storage = getTopNavBadgeCacheStorage()
  if (!storage) return

  for (const storageKey of topNavBadgeSessionStorageKeys(storage)) {
    storage.removeItem(storageKey)
  }
  topNavBadgeSessionStorageKeyIndex = null
}

function pruneTopNavBadgeSessionCache(storage: Storage, options: PruneTopNavBadgeSessionCacheOptions = {}) {
  const storageKeys = Array.from(getTopNavBadgeSessionStorageKeyIndex(storage))
  if (!options.force && storageKeys.length <= TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRIES) return

  const entries = storageKeys
    .map((storageKey) => {
      const entry = readTopNavBadgeSessionCacheEntryNow(storage, storageKey)
      return entry ? { storageKey, updatedAt: entry.updatedAt } : null
    })
    .filter((entry): entry is { storageKey: string; updatedAt: number } => Boolean(entry))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  for (const entry of entries.slice(TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRIES)) {
    storage.removeItem(entry.storageKey)
    forgetTopNavBadgeSessionStorageKey(entry.storageKey)
  }
}

function isPersistedTopNavCacheEntry(value: unknown): value is PersistedTopNavCacheEntry<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as PersistedTopNavCacheEntry<unknown>).updatedAt === 'number'
    && Number.isFinite((value as PersistedTopNavCacheEntry<unknown>).updatedAt)
    && Object.prototype.hasOwnProperty.call(value, 'data')
  )
}

function topNavBadgeSessionStorageKeys(storage: Storage) {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX)) keys.push(key)
  }
  return keys
}

function getTopNavBadgeSessionStorageKeyIndex(storage: Storage) {
  if (!topNavBadgeSessionStorageKeyIndex) {
    topNavBadgeSessionStorageKeyIndex = new Set(topNavBadgeSessionStorageKeys(storage))
  }
  return topNavBadgeSessionStorageKeyIndex
}

function rememberTopNavBadgeSessionStorageKey(storage: Storage, storageKey: string) {
  getTopNavBadgeSessionStorageKeyIndex(storage).add(storageKey)
}

function forgetTopNavBadgeSessionStorageKey(storageKey: string) {
  topNavBadgeSessionStorageKeyIndex?.delete(storageKey)
}

function getTopNavBadgeCacheStorage() {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function loadNotificationsModule() {
  notificationsModulePromise ??= import('@/lib/notifications')
  return notificationsModulePromise
}

function loadProfessorModule() {
  professorModulePromise ??= import('@/lib/professor')
  return professorModulePromise
}
