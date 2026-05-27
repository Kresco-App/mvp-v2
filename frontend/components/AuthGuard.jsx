'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import {
  getAccessDeniedDestination,
  getUnauthorizedDestination,
  hasRequiredAuthAccess,
} from '@/lib/authPolicy'
import { replaceBrowserLocation } from '@/lib/browserNavigation'
import { getMyProfile } from '@/lib/profile'

function LoadingScreen({ message }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">{message}</span>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   children: import('react').ReactNode,
 *   requireRole?: string | null,
 *   requireStaff?: boolean,
 * }} props
 */
export default function AuthGuard({ children, requireRole = null, requireStaff = false }) {
  const { token, user, hydrate, isHydrated, updateUser, logout } = useAuthStore()
  const [accessState, setAccessState] = useState('pending')
  const needsServerProfile = Boolean(requireRole || requireStaff || !user)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!isHydrated) return

    if (!token) {
      setAccessState('denied')
      replaceBrowserLocation(getUnauthorizedDestination(window.location.pathname))
      return
    }

    if (!needsServerProfile) {
      setAccessState('ready')
      return
    }

    let cancelled = false
    setAccessState('checking')

    getMyProfile()
      .then((profile) => {
        if (cancelled) return
        updateUser(profile)

        const requirement = { role: requireRole, staff: requireStaff }
        if (!hasRequiredAuthAccess(profile, requirement)) {
          setAccessState('denied')
          replaceBrowserLocation(getAccessDeniedDestination(requirement, window.location.pathname))
          return
        }

        setAccessState('ready')
      })
      .catch(() => {
      if (cancelled) return
      setAccessState('denied')
      logout()
      replaceBrowserLocation(getUnauthorizedDestination(window.location.pathname))
    })

    return () => { cancelled = true }
  }, [isHydrated, token, needsServerProfile, requireRole, requireStaff, updateUser, logout])

  if (!isHydrated) {
    return <LoadingScreen message="Loading Kresco..." />
  }

  if (!token) {
    return <LoadingScreen message="Redirecting to login..." />
  }

  if (accessState !== 'ready') {
    return <LoadingScreen message="Checking access..." />
  }

  return children
}
