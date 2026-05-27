'use client'

import { useEffect, useRef, useState } from 'react'
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
  const { token, user, hydrate, isHydrated, login, updateUser, logout } = useAuthStore()
  const [accessState, setAccessState] = useState('pending')
  const verificationStateRef = useRef('idle')
  const needsServerProfile = Boolean(requireRole || requireStaff || !user || !token)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!isHydrated) return
    if (verificationStateRef.current === 'checking' || verificationStateRef.current === 'denied') return

    if (!needsServerProfile) {
      verificationStateRef.current = 'idle'
      setAccessState('ready')
      return
    }

    let cancelled = false
    verificationStateRef.current = 'checking'
    setAccessState('checking')

    Promise.resolve()
      .then(() => getMyProfile())
      .then((profile) => {
        if (cancelled) return
        if (!profile) throw new Error('Missing profile')
        if (token) updateUser(profile)
        else login(profile)

        const requirement = { role: requireRole, staff: requireStaff }
        if (!hasRequiredAuthAccess(profile, requirement)) {
          verificationStateRef.current = 'denied'
          setAccessState('denied')
          replaceBrowserLocation(getAccessDeniedDestination(requirement, window.location.pathname))
          return
        }

        verificationStateRef.current = 'idle'
        setAccessState('ready')
      })
      .catch(() => {
      if (cancelled) return
      verificationStateRef.current = 'denied'
      setAccessState('denied')
      logout()
      replaceBrowserLocation(getUnauthorizedDestination(window.location.pathname))
    })

    return () => { cancelled = true }
  }, [isHydrated, token, needsServerProfile, requireRole, requireStaff, login, updateUser, logout])

  if (!isHydrated) {
    return <LoadingScreen message="Loading Kresco..." />
  }

  if (accessState !== 'ready') {
    return <LoadingScreen message={accessState === 'denied' ? 'Redirecting to login...' : 'Checking access...'} />
  }

  return children
}
