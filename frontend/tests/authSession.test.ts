// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  AUTH_ROUTES,
  canUseStudentProfessorChat,
  getAccessDeniedDestination,
  getAuthenticatedDestination,
  getStudentOnboardingStep,
  getUnauthorizedDestination,
  hasRequiredAuthAccess,
  isProfessorUser,
  isStaffUser,
  resolveAuthSuccess,
} from '@/lib/authPolicy'
import { getAuthRedirect, isProtectedRoute } from '@/lib/authRedirect'
import {
  KRESCO_COOKIE_SESSION,
  KRESCO_CSRF_COOKIE,
  KRESCO_CSRF_KEY,
  KRESCO_TOKEN_KEY,
  KRESCO_TOKEN_COOKIE,
  KRESCO_USER_KEY,
  KRESCO_USER_ROLE_COOKIE,
  clearStoredAuthSession,
  getTokenCookieMaxAgeSeconds,
  isJwtExpired,
  readCsrfToken,
  readStoredAuthSession,
  writeCsrfToken,
  writeStoredAuthSession,
} from '@/lib/authSession'
import { useAuthStore } from '@/lib/store'

function makeToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.test`
}

describe('auth redirect decisions', () => {
  it('classifies dashboard and protected feature routes', () => {
    expect(isProtectedRoute('/home')).toBe(true)
    expect(isProtectedRoute('/topics/42')).toBe(true)
    expect(isProtectedRoute('/auth/reset-password')).toBe(false)
  })

  it('redirects protected routes without a valid cookie token', () => {
    expect(getAuthRedirect('/home', undefined, () => false)).toEqual({ action: 'redirect', destination: '/' })
    expect(getAuthRedirect('/home', 'expired', () => true)).toEqual({
      action: 'redirect',
      destination: '/',
      clearCookie: true,
    })
    expect(getAuthRedirect('/professor', undefined, () => false)).toEqual({
      action: 'redirect',
      destination: '/professor/login',
    })
    expect(getAuthRedirect('/professor/chat', 'expired', () => true)).toEqual({
      action: 'redirect',
      destination: '/professor/login',
      clearCookie: true,
    })
  })

  it('allows protected routes with a valid token and redirects signed-in students off landing', () => {
    expect(getAuthRedirect('/home', 'valid', () => false)).toEqual({ action: 'allow' })
    expect(getAuthRedirect('/', 'valid', () => false)).toEqual({ action: 'redirect', destination: '/home' })
  })

  it('redirects signed-in professors off landing to the professor workspace', () => {
    expect(getAuthRedirect('/', 'valid', () => false, 'professor')).toEqual({
      action: 'redirect',
      destination: '/professor',
    })
  })
})

describe('auth policy decisions', () => {
  it('centralizes student onboarding and signed-in destinations', () => {
    expect(getStudentOnboardingStep({})).toBe('niveau')
    expect(getStudentOnboardingStep({ niveau: '2bac' })).toBe('filiere')
    expect(getStudentOnboardingStep({ niveau: '2bac', filiere: 'Bac Sciences Physiques' })).toBeNull()

    expect(resolveAuthSuccess({ niveau: '2bac' })).toEqual({ action: 'onboarding', step: 'filiere' })
    expect(resolveAuthSuccess({ niveau: '2bac', filiere: 'Bac Sciences Physiques' })).toEqual({
      action: 'redirect',
      destination: AUTH_ROUTES.studentHome,
    })
  })

  it('centralizes professor route and user decisions', () => {
    const professor = { role: 'professor' }

    expect(isProfessorUser(professor)).toBe(true)
    expect(getAuthenticatedDestination(professor)).toBe(AUTH_ROUTES.professorHome)
    expect(resolveAuthSuccess(professor)).toEqual({
      action: 'redirect',
      destination: AUTH_ROUTES.professorHome,
    })
    expect(getUnauthorizedDestination('/professor/chat')).toBe(AUTH_ROUTES.professorLogin)
    expect(getUnauthorizedDestination('/home')).toBe(AUTH_ROUTES.landing)
  })

  it('centralizes server-verified role and staff access decisions', () => {
    const staffStudent = { role: 'student', is_staff: true }
    const professor = { role: 'professor', is_staff: false }
    const regularStudent = { role: 'student', is_staff: false }

    expect(isStaffUser(staffStudent)).toBe(true)
    expect(isStaffUser(professor)).toBe(false)
    expect(hasRequiredAuthAccess(staffStudent, { staff: true })).toBe(true)
    expect(hasRequiredAuthAccess(regularStudent, { staff: true })).toBe(false)
    expect(hasRequiredAuthAccess(professor, { role: 'professor' })).toBe(true)
    expect(hasRequiredAuthAccess(regularStudent, { role: 'professor' })).toBe(false)
    expect(getAccessDeniedDestination({ staff: true }, '/admin')).toBe(AUTH_ROUTES.studentHome)
  })

  it('centralizes student professor-chat eligibility', () => {
    expect(canUseStudentProfessorChat({ role: 'student', tier: 'vip' })).toBe(true)
    expect(canUseStudentProfessorChat({ role: 'student', tier: ' platinum ' })).toBe(true)
    expect(canUseStudentProfessorChat({ role: 'student', tier: 'pro' })).toBe(false)
    expect(canUseStudentProfessorChat({ role: 'professor', tier: 'vip' })).toBe(false)
    expect(AUTH_ROUTES.studentProfessorChat).toBe('/professor-chat')
  })
})

describe('auth session JWT helpers', () => {
  it('detects expired and valid JWT exp values', () => {
    const now = 1_700_000_000_000

    expect(isJwtExpired(makeToken({ exp: 1_699_999_999 }), now)).toBe(true)
    expect(isJwtExpired(makeToken({ exp: 1_700_000_001 }), now)).toBe(false)
  })

  it('uses the remaining JWT lifetime as cookie max-age', () => {
    const now = 1_700_000_000_000

    expect(getTokenCookieMaxAgeSeconds(makeToken({ exp: 1_700_000_900 }), now)).toBe(900)
  })

  it('stores user context without persisting the JWT in localStorage', () => {
    const user = { id: 1, email: 'student@example.com', role: 'student' }
    localStorage.setItem(KRESCO_TOKEN_KEY, 'legacy-token')

    writeStoredAuthSession(user)

    expect(localStorage.getItem(KRESCO_TOKEN_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(KRESCO_USER_KEY) || '{}')).toMatchObject(user)
    expect(readStoredAuthSession()).toEqual({ token: KRESCO_COOKIE_SESSION, user })
  })

  it('clears the CSRF token with browser auth session state', () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify({ id: 1, role: 'student' }))
    document.cookie = `${KRESCO_TOKEN_COOKIE}=session; Path=/`
    document.cookie = `${KRESCO_USER_ROLE_COOKIE}=student; Path=/`
    document.cookie = `${KRESCO_CSRF_COOKIE}=csrf-token; Path=/`
    writeCsrfToken('csrf-token')

    expect(readCsrfToken()).toBe('csrf-token')

    clearStoredAuthSession()

    expect(localStorage.getItem(KRESCO_USER_KEY)).toBeNull()
    expect(sessionStorage.getItem(KRESCO_CSRF_KEY)).toBeNull()
    expect(readCsrfToken()).toBeNull()
    expect(document.cookie).not.toContain(KRESCO_TOKEN_COOKIE)
    expect(document.cookie).not.toContain(KRESCO_USER_ROLE_COOKIE)
    expect(document.cookie).not.toContain(KRESCO_CSRF_COOKIE)
  })
})

describe('auth store session writes', () => {
  it('stores the user object when login is called with the current user/csrf signature', () => {
    const user = { id: 1, email: 'student@kresco.local', role: 'student' }

    clearStoredAuthSession()
    useAuthStore.setState({ token: null, user: null, isHydrated: false })
    useAuthStore.getState().login(user, 'csrf-token')

    expect(useAuthStore.getState().token).toBe(KRESCO_COOKIE_SESSION)
    expect(useAuthStore.getState().user).toEqual(user)
    expect(JSON.parse(localStorage.getItem(KRESCO_USER_KEY) || '{}')).toEqual(user)
    expect(sessionStorage.getItem(KRESCO_CSRF_KEY)).toBe('csrf-token')
  })

  it('continues to support the legacy token/user/csrf signature', () => {
    const user = { id: 2, email: 'vip@kresco.local', role: 'student', tier: 'vip' }

    clearStoredAuthSession()
    useAuthStore.setState({ token: null, user: null, isHydrated: false })
    useAuthStore.getState().login('legacy-token', user, 'legacy-csrf-token')

    expect(useAuthStore.getState().token).toBe(KRESCO_COOKIE_SESSION)
    expect(useAuthStore.getState().user).toEqual(user)
    expect(JSON.parse(localStorage.getItem(KRESCO_USER_KEY) || '{}')).toEqual(user)
    expect(sessionStorage.getItem(KRESCO_CSRF_KEY)).toBe('legacy-csrf-token')
  })
})
