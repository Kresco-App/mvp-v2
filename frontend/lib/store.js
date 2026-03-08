'use client'
import { create } from 'zustand'

const TOKEN_KEY = 'kresco_token'
const USER_KEY = 'kresco_user'

function loadFromStorage(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isHydrated: false,

  hydrate() {
    let token = null
    let user = null
    try {
      token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
      user = loadFromStorage(USER_KEY)
    } catch {
      token = null
      user = null
    }
    // Check token expiry
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.exp * 1000 < Date.now()) {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          set({ token: null, user: null, isHydrated: true })
          return
        }
      } catch {}
    }
    set({ token, user, isHydrated: true })
  },

  login(token, user) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ token, user })
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null })
  },

  updateUser(patch) {
    const updated = { ...get().user, ...patch }
    localStorage.setItem(USER_KEY, JSON.stringify(updated))
    set({ user: updated })
  },

  get isAuthenticated() {
    return !!get().token
  },
}))
