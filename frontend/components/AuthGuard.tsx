'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/lib/store'
import {
  getAccessDeniedDestination,
  getUnauthorizedDestination,
  hasRequiredAuthAccess,
} from '@/lib/authPolicy'
import { replaceBrowserLocation } from '@/lib/browserNavigation'
import { getMyProfile } from '@/lib/profile'

type AuthGuardProps = {
  children: ReactNode
  requireRole?: string | null
  requireStaff?: boolean
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">{message}</span>
      </div>
    </div>
  )
}

function AccessDeniedScreen({ requireRole, requireStaff }: Pick<AuthGuardProps, 'requireRole' | 'requireStaff'>) {
  const [pathname, setPathname] = useState('')

  useEffect(() => {
    setPathname(window.location.pathname)
  }, [])

  const title = requireStaff
    ? 'Staff access required'
    : requireRole === 'professor'
      ? 'Professor access required'
      : 'Access denied'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Your account is signed in, but it does not have permission to open this area.
        </p>
        <a
          href={getAccessDeniedDestination({ role: requireRole, staff: requireStaff }, pathname)}
          className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Back to app
        </a>
      </section>
    </div>
  )
}

function VerificationErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <section className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-7">
        <h1 className="text-xl font-bold text-white">We could not verify your session</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          The backend did not confirm your account status. Your session was kept intact so you can retry.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Retry verification
        </button>
      </section>
    </div>
  )
}

function isUnauthorizedError(error: unknown) {
  const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status
  return status === 401 || status === 403
}

export default function AuthGuard({ children, requireRole = null, requireStaff = false }: AuthGuardProps) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const hydrate = useAuthStore((state) => state.hydrate)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const login = useAuthStore((state) => state.login)
  const updateUser = useAuthStore((state) => state.updateUser)
  const logout = useAuthStore((state) => state.logout)
  const [accessState, setAccessState] = useState('pending')
  const [retryCount, setRetryCount] = useState(0)
  const verificationStateRef = useRef<'idle' | 'checking' | 'denied' | 'error'>('idle')
  const needsServerProfile = Boolean(requireRole || requireStaff || !user || !token)

  function retryVerification() {
    verificationStateRef.current = 'idle'
    setAccessState('pending')
    setRetryCount((value) => value + 1)
  }

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
          setAccessState('forbidden')
          return
        }

        verificationStateRef.current = 'idle'
        setAccessState('ready')
      })
      .catch((error) => {
        if (cancelled) return
        if (isUnauthorizedError(error)) {
          verificationStateRef.current = 'denied'
          setAccessState('denied')
          logout()
          replaceBrowserLocation(getUnauthorizedDestination(window.location.pathname))
          return
        }
        verificationStateRef.current = 'error'
        setAccessState('error')
      })

    return () => { cancelled = true }
  }, [isHydrated, token, needsServerProfile, requireRole, requireStaff, login, updateUser, logout, retryCount])

  if (!isHydrated) {
    return <LoadingScreen message="Loading Kresco..." />
  }

  if (accessState === 'forbidden') {
    return <AccessDeniedScreen requireRole={requireRole} requireStaff={requireStaff} />
  }

  if (accessState === 'error') {
    return <VerificationErrorScreen onRetry={retryVerification} />
  }

  if (accessState !== 'ready') {
    return <LoadingScreen message={accessState === 'denied' ? 'Redirecting to login...' : 'Checking access...'} />
  }

  return children
}
