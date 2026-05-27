import { getAuthenticatedDestination, getUnauthorizedDestination } from './authPolicy'

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

export function getAuthRedirect(
  pathname: string,
  token: string | undefined,
  isExpired: (token: string) => boolean,
  userRole?: string,
): AuthRedirectDecision {
  if (isProtectedRoute(pathname)) {
    const destination = getUnauthorizedDestination(pathname)
    if (!token) return { action: 'redirect', destination }
    if (isExpired(token)) return { action: 'redirect', destination, clearCookie: true }
    return { action: 'allow' }
  }

  if (pathname === '/' && token && !isExpired(token)) {
    return { action: 'redirect', destination: getAuthenticatedDestination({ role: userRole }) }
  }

  return { action: 'allow' }
}
