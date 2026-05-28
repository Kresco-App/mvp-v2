import {
  getAccessDeniedDestination,
  getAuthenticatedDestination,
  getUnauthorizedDestination,
  isProfessorRoute,
} from './authPolicy'
import { getAuthUserFromJwt } from './authSession'

const protectedRoutePrefixes = [
  '/admin',
  '/calendar',
  '/classement',
  '/courses',
  '/exam',
  '/exam-bank',
  '/home',
  '/live',
  '/payment-success',
  '/pricing',
  '/profile',
  '/professor',
  '/professor-chat',
  '/topics',
  '/watch',
  '/zed',
]

export type AuthRedirectDecision =
  | { action: 'allow' }
  | { action: 'redirect'; destination: string; clearCookie?: boolean }

export function isProtectedRoute(pathname: string) {
  if (pathname === '/professor/login') return false
  return protectedRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function isAdminRoute(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export function getAuthRedirect(
  pathname: string,
  token: string | undefined,
  isExpired: (token: string) => boolean,
  getUser: (token: string | undefined | null) => ReturnType<typeof getAuthUserFromJwt> = getAuthUserFromJwt,
): AuthRedirectDecision {
  if (isProtectedRoute(pathname)) {
    const destination = getUnauthorizedDestination(pathname)
    if (!token) return { action: 'redirect', destination }
    if (isExpired(token)) return { action: 'redirect', destination, clearCookie: true }
    const user = getUser(token)
    if (isAdminRoute(pathname) && user?.is_staff !== true) {
      return { action: 'redirect', destination: getAccessDeniedDestination({ staff: true }, pathname) }
    }
    if (isProfessorRoute(pathname) && user?.role !== 'professor') {
      return { action: 'redirect', destination: getAccessDeniedDestination({ role: 'professor' }, pathname) }
    }
    return { action: 'allow' }
  }

  if (pathname === '/' && token && !isExpired(token)) {
    return { action: 'redirect', destination: getAuthenticatedDestination(getUser(token)) }
  }

  return { action: 'allow' }
}
