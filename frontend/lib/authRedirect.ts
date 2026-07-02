import {
  AUTH_ROUTES,
  getAccessDeniedDestination,
  getAuthenticatedDestination,
  getUnauthorizedDestination,
  isAdminRoute,
  isProfessorRoute,
  isStaffRoute,
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
  '/onboarding',
  '/payment/cmi',
  '/pricing',
  '/profile',
  '/professor',
  '/professor-chat',
  '/staff',
  '/topics',
  '/zed',
]

export type AuthRedirectDecision =
  | { action: 'allow' }
  | { action: 'redirect'; destination: string; clearCookie?: boolean }

type AuthRedirectOptions = {
  enforceClaimAccess?: boolean
}

export function isProtectedRoute(pathname: string) {
  if (pathname === AUTH_ROUTES.workspaceLogin || pathname === AUTH_ROUTES.professorLogin) return false
  if (pathname === '/admin/login' || pathname === '/staff/login') return false
  return protectedRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function getAuthRedirect(
  pathname: string,
  token: string | undefined,
  isExpired: (token: string) => boolean,
  getUser: (token: string | undefined | null) => ReturnType<typeof getAuthUserFromJwt> = getAuthUserFromJwt,
  options: AuthRedirectOptions = {},
): AuthRedirectDecision {
  const enforceClaimAccess = options.enforceClaimAccess ?? true

  if (isProtectedRoute(pathname)) {
    const destination = getUnauthorizedDestination(pathname)
    if (!token) return { action: 'redirect', destination }
    if (isExpired(token)) return { action: 'redirect', destination, clearCookie: true }
    const user = getUser(token)
    if (enforceClaimAccess && isAdminRoute(pathname) && user?.is_staff !== true) {
      return { action: 'redirect', destination: getAccessDeniedDestination({ staff: true }, pathname) }
    }
    if (enforceClaimAccess && isProfessorRoute(pathname) && user?.role !== 'professor') {
      return { action: 'redirect', destination: getAccessDeniedDestination({ role: 'professor' }, pathname) }
    }
    if (enforceClaimAccess && isStaffRoute(pathname) && user?.is_staff !== true) {
      return { action: 'redirect', destination: getAccessDeniedDestination({ staff: true }, pathname) }
    }
    return { action: 'allow' }
  }

  if (pathname === '/' && token && !isExpired(token)) {
    return { action: 'redirect', destination: getAuthenticatedDestination(getUser(token)) }
  }

  return { action: 'allow' }
}
