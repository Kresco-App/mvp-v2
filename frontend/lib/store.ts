'use client'

import { create } from 'zustand'
import {
  KRESCO_COOKIE_SESSION,
  KRESCO_CSRF_HEADER,
  KRESCO_AUTH_SESSION_EVENT,
  KRESCO_TOKEN_KEY,
  KRESCO_USER_KEY,
  clearStoredAuthSession,
  readStoredAuthSession,
  readCsrfToken,
  updateStoredAuthUser,
  writeStoredAuthSession,
} from './authSession'
import { clearStoredClientSessionCaches } from './clientSessionCache'
import type { AuthUser } from './authSession'
import { getBackendUrl } from './apiConfig'

type AuthUserPatch = Partial<AuthUser> & Record<string, unknown>

const AUTH_STORAGE_KEYS = new Set([KRESCO_TOKEN_KEY, KRESCO_USER_KEY])
const LOGOUT_REVOCATION_ERROR = 'We could not revoke your server session. Please sign in again to finish logging out.'

type SwrModule = typeof import('swr')
type ApiDataCacheModule = typeof import('./apiDataCache')
type TopicInteractionCacheModule = typeof import('./topicInteractionCache')
type TopNavBadgeCacheModule = typeof import('./topNavBadgeCache')

type AuthStoreState = {
  user: AuthUser | null
  token: typeof KRESCO_COOKIE_SESSION | null
  isHydrated: boolean
  logoutError: string | null
  isLoggingOut: boolean
  hydrate: () => void
  login: (
    userOrToken: AuthUser | string,
    userOrCsrfToken?: AuthUser | string | null,
    csrfToken?: string | null,
  ) => void
  logout: () => Promise<boolean>
  clearSession: () => Promise<void>
  updateUser: (patch: AuthUserPatch) => void
  readonly isAuthenticated: boolean
}

function readAuthStoreSnapshot() {
  const { token, user } = readStoredAuthSession()
  return {
    token,
    user,
    logoutError: null,
    isLoggingOut: false,
    isHydrated: true,
  }
}

function syncAuthStoreFromStorage(event?: StorageEvent) {
  if (typeof window === 'undefined') return
  if (event && event.storageArea !== localStorage) return
  if (event?.key && !AUTH_STORAGE_KEYS.has(event.key)) {
    return
  }

  useAuthStore.setState(readAuthStoreSnapshot())
}

function syncAuthStoreFromAuthSessionEvent() {
  syncAuthStoreFromStorage()
}

async function requestServerLogout(csrfTokenOverride?: string) {
  if (typeof window === 'undefined') return true

  try {
    const csrfToken = csrfTokenOverride ?? readCsrfToken() ?? ''
    const response = await fetch(getBackendUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken
        ? {
          [KRESCO_CSRF_HEADER]: csrfToken,
        }
        : undefined,
    })
    return response.ok
  } catch {
    return false
  }
}

let swrModulePromise: Promise<SwrModule> | null = null
let apiDataCacheModulePromise: Promise<ApiDataCacheModule> | null = null
let topicInteractionCacheModulePromise: Promise<TopicInteractionCacheModule> | null = null
let topNavBadgeCacheModulePromise: Promise<TopNavBadgeCacheModule> | null = null

function loadSwrModule() {
  swrModulePromise ??= import('swr')
  return swrModulePromise
}

function loadApiDataCacheModule() {
  apiDataCacheModulePromise ??= import('./apiDataCache')
  return apiDataCacheModulePromise
}

function loadTopicInteractionCacheModule() {
  topicInteractionCacheModulePromise ??= import('./topicInteractionCache')
  return topicInteractionCacheModulePromise
}

function loadTopNavBadgeCacheModule() {
  topNavBadgeCacheModulePromise ??= import('./topNavBadgeCache')
  return topNavBadgeCacheModulePromise
}

async function clearRuntimeClientDataCaches() {
  const [apiDataCache, topicInteractionCache, topNavBadgeCache] = await Promise.all([
    loadApiDataCacheModule().catch(() => null),
    loadTopicInteractionCacheModule().catch(() => null),
    loadTopNavBadgeCacheModule().catch(() => null),
  ])

  apiDataCache?.clearApiDataSessionCache()
  topicInteractionCache?.clearTopicInteractionCache()
  topNavBadgeCache?.clearTopNavBadgeCache()
}

function clearClientDataCachesAfterLogin() {
  clearStoredClientSessionCaches()
  void clearRuntimeClientDataCaches().catch(() => undefined)
}

async function clearSwrCache() {
  const { mutate } = await loadSwrModule()
  await mutate(() => true, undefined, { revalidate: false })
}

function clearLocalAuthState(set: (state: Partial<AuthStoreState>) => void) {
  clearStoredAuthSession()
  clearStoredClientSessionCaches()
  set({ token: null, user: null, logoutError: null, isLoggingOut: false })
}

async function clearClientAuthState(set: (state: Partial<AuthStoreState>) => void) {
  const { signOutFirebaseAuth } = await import('./firebaseAuth')
  await signOutFirebaseAuth().catch(() => undefined)
  clearLocalAuthState(set)
  await Promise.all([
    clearRuntimeClientDataCaches(),
    clearSwrCache().catch(() => undefined),
  ])
}

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  user: null,
  token: null,
  isHydrated: false,
  logoutError: null,
  isLoggingOut: false,

  hydrate() {
    set(readAuthStoreSnapshot())
  },

  login(
    userOrToken: AuthUser | string,
    userOrCsrfToken?: AuthUser | string | null,
    csrfToken?: string | null,
  ) {
    const isLegacySignature = typeof userOrToken === 'string'
    const user = isLegacySignature ? userOrCsrfToken as AuthUser : userOrToken
    const nextCsrfToken = isLegacySignature ? csrfToken : userOrCsrfToken as string | null | undefined
    clearClientDataCachesAfterLogin()
    writeStoredAuthSession(user, nextCsrfToken)
    set({ token: KRESCO_COOKIE_SESSION, user, logoutError: null, isLoggingOut: false })
  },

  async logout() {
    set({ isLoggingOut: true, logoutError: null })
    const serverLogoutSucceeded = await requestServerLogout()

    if (!serverLogoutSucceeded) {
      set({
        logoutError: LOGOUT_REVOCATION_ERROR,
        isLoggingOut: false,
      })
      return false
    }

    await clearClientAuthState(set)
    return true
  },

  async clearSession() {
    const csrfToken = readCsrfToken() || ''
    clearLocalAuthState(set)
    await requestServerLogout(csrfToken)
    const { signOutFirebaseAuth } = await import('./firebaseAuth')
    await signOutFirebaseAuth().catch(() => undefined)
    await Promise.all([
      clearRuntimeClientDataCaches(),
      clearSwrCache().catch(() => undefined),
    ])
  },

  updateUser(patch) {
    const updated = { ...(get().user ?? {}), ...patch }
    updateStoredAuthUser(updated)
    set({ token: KRESCO_COOKIE_SESSION, user: updated, logoutError: null, isLoggingOut: false })
  },

  get isAuthenticated() {
    return !!get().token
  },
}))

if (typeof window !== 'undefined') {
  const globalWindow = window as typeof window & { __krescoAuthStorageListenerInstalled?: boolean }
  if (!globalWindow.__krescoAuthStorageListenerInstalled) {
    globalWindow.addEventListener('storage', syncAuthStoreFromStorage)
    globalWindow.addEventListener(KRESCO_AUTH_SESSION_EVENT, syncAuthStoreFromAuthSessionEvent)
    globalWindow.__krescoAuthStorageListenerInstalled = true
  }
}
