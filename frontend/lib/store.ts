'use client'

import { create } from 'zustand'
import { mutate } from 'swr'
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
import type { AuthUser } from './authSession'
import { getBackendUrl } from './apiConfig'
import { signOutFirebaseAuth } from './firebaseAuth'

type AuthUserPatch = Partial<AuthUser> & Record<string, unknown>

const AUTH_STORAGE_KEYS = new Set([KRESCO_TOKEN_KEY, KRESCO_USER_KEY])
const LOGOUT_REVOCATION_ERROR = 'We could not revoke your server session. Please sign in again to finish logging out.'

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

async function requestServerLogout() {
  if (typeof window === 'undefined') return true

  try {
    const csrfToken = readCsrfToken() || ''
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

async function clearClientAuthState(set: (state: Partial<AuthStoreState>) => void) {
  await signOutFirebaseAuth().catch(() => undefined)
  clearStoredAuthSession()
  await mutate(() => true, undefined, { revalidate: false })
  set({ token: null, user: null, logoutError: null, isLoggingOut: false })
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
    await requestServerLogout()
    await clearClientAuthState(set)
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
