'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  getAuthenticatedDestination,
  getStudentOnboardingDestination,
  isProfessorUser,
  resolveAuthSuccess,
} from '@/lib/authPolicy'
import { isStoredAuthSnapshot } from '@/lib/authSession'
import { useAuthStore } from '@/lib/store'

type GuestGuardProps = {
  children?: ReactNode
  authenticatedRedirectMode?: 'all' | 'professor-only' | 'none'
}

export default function GuestGuard({ children, authenticatedRedirectMode = 'all' }: GuestGuardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextDestination = searchParams.get('next')
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const hydrate = useAuthStore((state) => state.hydrate)
  const isHydrated = useAuthStore((state) => state.isHydrated)

  useEffect(() => {
    if (!isHydrated) hydrate()
  }, [hydrate, isHydrated])

  useEffect(() => {
    if (!isHydrated || !token || !user) return
    if (authenticatedRedirectMode === 'none') return
    if (authenticatedRedirectMode === 'professor-only' && !isProfessorUser(user)) return

    if (isStoredAuthSnapshot(user)) {
      router.replace(getAuthenticatedDestination(user))
      return
    }

    const resolution = resolveAuthSuccess(user, nextDestination)
    if (resolution.action === 'onboarding') {
      router.replace(getStudentOnboardingDestination(nextDestination ?? ''))
      return
    }

    router.replace(resolution.destination)
  }, [authenticatedRedirectMode, isHydrated, nextDestination, router, token, user])

  if (!isHydrated) return null
  if (
    token
    && user
    && authenticatedRedirectMode !== 'none'
    && (authenticatedRedirectMode === 'all' || isProfessorUser(user))
  ) return null

  return children
}
