'use client'

import { create } from 'zustand'
import { mutate } from 'swr'
import {
  KRESCO_COOKIE_SESSION,
  KRESCO_CSRF_HEADER,
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
  login: {
    (tokenOrUser: string, maybeUser: AuthUser, maybeCsrfToken?: string | null): void
    (user: AuthUser, csrfToken?: string | null): void
  }
  logout: () => Promise<boolean>
  clearSession: () => void
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

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  user: null,
  token: null,
  isHydrated: false,
  logoutError: null,
  isLoggingOut: false,

  hydrate() {
    set(readAuthStoreSnapshot())
  },

  login(tokenOrUser: string | AuthUser, maybeUser?: AuthUser | string | null, maybeCsrfToken?: string | null) {
    const isLegacyTokenSignature = (
      typeof tokenOrUser === 'string'
      && maybeUser
      && typeof maybeUser === 'object'
    )
    const user = isLegacyTokenSignature ? maybeUser : tokenOrUser
    const csrfToken = isLegacyTokenSignature ? maybeCsrfToken : maybeUser
    writeStoredAuthSession(user as AuthUser, csrfToken as string | null | undefined)
    set({ token: KRESCO_COOKIE_SESSION, user: user as AuthUser, logoutError: null, isLoggingOut: false })
  },

  async logout() {
    set({ isLoggingOut: true, logoutError: null })
    const csrfToken = readCsrfToken() || ''

    if (typeof window !== 'undefined') {
      try {
        const response = await fetch(getBackendUrl('/api/auth/logout'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            [KRESCO_CSRF_HEADER]: csrfToken,
          },
        })
        if (!response.ok) {
          throw new Error('Logout revocation failed')
        }
      } catch {
        set({
          logoutError: LOGOUT_REVOCATION_ERROR,
          isLoggingOut: false,
        })
        return false
      }
    }

    clearStoredAuthSession()
    await mutate(() => true, undefined, { revalidate: false })
    set({ token: null, user: null, logoutError: null, isLoggingOut: false })
    return true
  },

  clearSession() {
    clearStoredAuthSession()
    void mutate(() => true, undefined, { revalidate: false })
    set({ token: null, user: null, logoutError: null, isLoggingOut: false })
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
    globalWindow.__krescoAuthStorageListenerInstalled = true
  }
}
