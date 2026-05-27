'use client'
import { create } from 'zustand'
import {
  KRESCO_COOKIE_SESSION,
  clearStoredAuthSession,
  readStoredAuthSession,
  updateStoredAuthUser,
  writeStoredAuthSession,
} from './authSession'
import { getBackendUrl } from './apiConfig'

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isHydrated: false,

  hydrate() {
    const { token, user } = readStoredAuthSession()
    set({ token, user, isHydrated: true })
  },

  login(tokenOrUser, maybeUser) {
    const user = maybeUser ?? tokenOrUser
    writeStoredAuthSession(user)
    set({ token: KRESCO_COOKIE_SESSION, user })
  },

  logout() {
    if (typeof window !== 'undefined') {
      void fetch(getBackendUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {})
    }
    clearStoredAuthSession()
    set({ token: null, user: null })
  },

  updateUser(patch) {
    const updated = { ...(get().user ?? {}), ...patch }
    updateStoredAuthUser(updated)
    set({ token: KRESCO_COOKIE_SESSION, user: updated })
  },

  get isAuthenticated() {
    return !!get().token
  },
}))
