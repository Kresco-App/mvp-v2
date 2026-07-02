'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/lib/store'
import {
  AUTH_ROUTES,
  getAccessDeniedDestination,
  getStudentOnboardingDestination,
  getStudentOnboardingStep,
  getUnauthorizedDestination,
  hasRequiredAuthAccess,
  isProfessorUser,
  isStudentOnboardingRoute,
} from '@/lib/authPolicy'
import { replaceBrowserLocation } from '@/lib/browserNavigation'
import { getMyProfile, type ProfileUser } from '@/lib/profile'
import { isStoredAuthSnapshot, type AuthUser } from '@/lib/authSession'

type AuthGuardProps = {
  children: ReactNode
  requireRole?: string | null
  requireStaff?: boolean
}

const PROFILE_VERIFICATION_CACHE_TTL_MS = 45_000
let cachedProfileVerification: { profile: ProfileUser; verifiedAt: number } | null = null

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-white px-6">
      <div className="kresco-enter grid w-full max-w-[420px] justify-items-center">
        <span className="kresco-skeleton kresco-skeleton-media block h-12 w-12 rounded-2xl" aria-hidden="true" />
        <span className="kresco-skeleton mt-5 block h-5 w-48 rounded-[8px]" aria-hidden="true" />
        <span className="kresco-skeleton mt-3 block h-4 w-72 max-w-full rounded-[6px]" aria-hidden="true" />
        <span className="sr-only" role="status" aria-live="polite">{message}</span>
        <span className="mt-4 text-sm font-semibold text-slate-500" aria-hidden="true">{message}</span>
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

function readCachedProfileVerification(user: AuthUser | null) {
  if (!user || (isStoredAuthSnapshot(user) && user.id == null && !user.email)) return null
  if (!cachedProfileVerification) return null
  if (Date.now() - cachedProfileVerification.verifiedAt > PROFILE_VERIFICATION_CACHE_TTL_MS) {
    cachedProfileVerification = null
    return null
  }
  if (!authUsersRepresentSameAccount(cachedProfileVerification.profile, user)) return null
  return cachedProfileVerification.profile
}

function writeCachedProfileVerification(profile: ProfileUser) {
  cachedProfileVerification = {
    profile,
    verifiedAt: Date.now(),
  }
}

export function clearAuthGuardProfileVerificationCache() {
  cachedProfileVerification = null
}

function authUsersRepresentSameAccount(cachedProfile: ProfileUser, currentUser: AuthUser) {
  if (cachedProfile.id != null && currentUser.id != null) {
    return String(cachedProfile.id) === String(currentUser.id)
  }
  if (cachedProfile.email && currentUser.email) {
    return cachedProfile.email === currentUser.email
  }
  return false
}

export default function AuthGuard({ children, requireRole = null, requireStaff = false }: AuthGuardProps) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const hydrate = useAuthStore((state) => state.hydrate)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const login = useAuthStore((state) => state.login)
  const updateUser = useAuthStore((state) => state.updateUser)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [accessState, setAccessState] = useState('pending')
  const [retryCount, setRetryCount] = useState(0)
  const verificationStateRef = useRef<'idle' | 'checking' | 'denied' | 'error' | 'verified'>('idle')

  function retryVerification() {
    verificationStateRef.current = 'idle'
    setAccessState('pending')
    setRetryCount((value) => value + 1)
  }

  useEffect(() => {
    if (!isHydrated) hydrate()
  }, [hydrate, isHydrated])

  useEffect(() => {
    if (!isHydrated) return
    if ((!token || !user) && verificationStateRef.current === 'verified') {
      clearAuthGuardProfileVerificationCache()
      verificationStateRef.current = 'idle'
      setAccessState('pending')
    }
    if (verificationStateRef.current === 'checking' || verificationStateRef.current === 'denied') return
    if (verificationStateRef.current === 'verified') {
      setAccessState('ready')
      return
    }

    let cancelled = false
    verificationStateRef.current = 'checking'
    setAccessState('checking')
    const cachedProfile = token ? readCachedProfileVerification(user) : null

    Promise.resolve()
      .then(() => cachedProfile ?? getMyProfile())
      .then((profile) => {
        if (cancelled) return
        if (!profile) throw new Error('Missing profile')
        if (!cachedProfile) writeCachedProfileVerification(profile)
        if (token) updateUser(profile)
        else login(profile)

        const requirement = { role: requireRole, staff: requireStaff }
        if (!hasRequiredAuthAccess(profile, requirement)) {
          verificationStateRef.current = 'denied'
          setAccessState('forbidden')
          return
        }

        const currentPathname = window.location.pathname
        const currentLocation = `${currentPathname}${window.location.search}`
        if (
          !requireStaff
          && !isProfessorUser(profile)
          && !isStudentOnboardingRoute(currentPathname)
          && getStudentOnboardingStep(profile)
        ) {
          verificationStateRef.current = 'denied'
          setAccessState('redirecting')
          replaceBrowserLocation(getStudentOnboardingDestination(currentLocation))
          return
        }
        if (
          !requireStaff
          && !isProfessorUser(profile)
          && isStudentOnboardingRoute(currentPathname)
          && !getStudentOnboardingStep(profile)
        ) {
          verificationStateRef.current = 'denied'
          setAccessState('redirecting')
          replaceBrowserLocation(AUTH_ROUTES.studentHome)
          return
        }

        verificationStateRef.current = 'verified'
        setAccessState('ready')
      })
      .catch((error) => {
        if (cancelled) return
        if (isUnauthorizedError(error)) {
          clearAuthGuardProfileVerificationCache()
          verificationStateRef.current = 'denied'
          setAccessState('denied')
          const destination = getUnauthorizedDestination(window.location.pathname)
          void clearSession()
          replaceBrowserLocation(destination)
          return
        }
        verificationStateRef.current = 'error'
        setAccessState('error')
      })

    return () => {
      cancelled = true
      if (verificationStateRef.current === 'checking') {
        verificationStateRef.current = 'idle'
      }
    }
  }, [isHydrated, token, user, requireRole, requireStaff, login, updateUser, clearSession, retryCount])

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
    const message = accessState === 'denied'
      ? 'Redirecting to login...'
      : accessState === 'redirecting'
        ? 'Completing setup...'
        : 'Checking access...'
    return <LoadingScreen message={message} />
  }

  return children
}
