// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mutate } from 'swr'

vi.mock('swr', () => ({
  mutate: vi.fn(() => Promise.resolve()),
}))

import {
  AUTH_ROUTES,
  canUseStudentProfessorChat,
  getAccessDeniedDestination,
  getAuthenticatedDestination,
  getSafePostLoginDestination,
  getStudentOnboardingStep,
  getUnauthorizedDestination,
  hasRequiredAuthAccess,
  isProfessorUser,
  isStudentOnboardingRoute,
  isStaffUser,
  resolveAuthSuccess,
} from '@/lib/authPolicy'
import { getAuthRedirect, isProtectedRoute } from '@/lib/authRedirect'
import {
  KRESCO_COOKIE_SESSION,
  KRESCO_CSRF_COOKIE,
  KRESCO_CSRF_HEADER,
  KRESCO_CSRF_KEY,
  KRESCO_TOKEN_KEY,
  KRESCO_TOKEN_COOKIE,
  KRESCO_USER_KEY,
  KRESCO_USER_ROLE_COOKIE,
  clearStoredAuthSession,
  getAuthUserFromJwt,
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(mutate).mockClear()
})

describe('auth redirect decisions', () => {
  it('classifies dashboard and protected feature routes', () => {
    expect(isProtectedRoute('/home')).toBe(true)
    expect(isProtectedRoute('/topics/42')).toBe(true)
    expect(isProtectedRoute('/onboarding')).toBe(true)
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
    expect(getAuthRedirect('/', makeToken({ exp: 1_700_000_001, role: 'professor' }), () => false)).toEqual({
      action: 'redirect',
      destination: '/professor',
    })
  })

  it('uses JWT claims, not writable role cookies, for sensitive route redirects', () => {
    const studentToken = makeToken({ exp: 1_700_000_001, role: 'student', is_staff: false })
    const professorToken = makeToken({ exp: 1_700_000_001, role: 'professor', is_staff: false })
    const staffToken = makeToken({ exp: 1_700_000_001, role: 'student', is_staff: true })

    expect(getAuthRedirect('/professor', studentToken, () => false)).toEqual({
      action: 'redirect',
      destination: '/home',
    })
    expect(getAuthRedirect('/professor', professorToken, () => false)).toEqual({ action: 'allow' })
    expect(getAuthRedirect('/admin', professorToken, () => false)).toEqual({
      action: 'redirect',
      destination: '/home',
    })
    expect(getAuthRedirect('/admin', staffToken, () => false)).toEqual({ action: 'allow' })
  })
})

describe('auth policy decisions', () => {
  it('centralizes student onboarding and signed-in destinations', () => {
    expect(getStudentOnboardingStep({})).toBe('niveau')
    expect(getStudentOnboardingStep({ niveau: '2bac' })).toBe('filiere')
    expect(getStudentOnboardingStep({ niveau: '2bac', filiere: 'Bac Sciences Physiques' })).toBeNull()
    expect(isStudentOnboardingRoute('/onboarding')).toBe(true)

    expect(resolveAuthSuccess({ niveau: '2bac' })).toEqual({ action: 'onboarding', step: 'filiere' })
    expect(resolveAuthSuccess({ niveau: '2bac', filiere: 'Bac Sciences Physiques' })).toEqual({
      action: 'redirect',
      destination: AUTH_ROUTES.studentHome,
    })
    expect(resolveAuthSuccess({ niveau: '2bac', filiere: 'Bac Sciences Physiques' }, '/topics/42')).toEqual({
      action: 'redirect',
      destination: '/topics/42',
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
    expect(resolveAuthSuccess(professor, '/professor/chat')).toEqual({
      action: 'redirect',
      destination: '/professor/chat',
    })
    expect(getUnauthorizedDestination('/professor/chat')).toBe(AUTH_ROUTES.professorLogin)
    expect(getUnauthorizedDestination('/home')).toBe(AUTH_ROUTES.landing)
  })

  it('sanitizes post-login next destinations', () => {
    const student = { role: 'student', niveau: '2bac', filiere: 'Bac Sciences Physiques' }
    const professor = { role: 'professor' }
    const staff = { role: 'student', is_staff: true, niveau: '2bac', filiere: 'Bac Sciences Physiques' }

    expect(getSafePostLoginDestination('https://evil.example/home', student)).toBeNull()
    expect(getSafePostLoginDestination('//evil.example/home', student)).toBeNull()
    expect(getSafePostLoginDestination('/auth/reset-password', student)).toBeNull()
    expect(getSafePostLoginDestination('/onboarding?next=%2Ftopics%2F42', student)).toBeNull()
    expect(getSafePostLoginDestination('/professor', student)).toBeNull()
    expect(getSafePostLoginDestination('/admin', student)).toBeNull()
    expect(getSafePostLoginDestination('/admin', staff)).toBe('/admin')
    expect(getSafePostLoginDestination('/topics/42?tab=notes', student)).toBe('/topics/42?tab=notes')
    expect(getSafePostLoginDestination('/topics/42', professor)).toBeNull()
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

  it('stores user context without treating localStorage alone as an authenticated session', () => {
    const user = { id: 1, email: 'student@example.com', role: 'student' }
    localStorage.setItem(KRESCO_TOKEN_KEY, 'legacy-token')

    writeStoredAuthSession(user)

    expect(localStorage.getItem(KRESCO_TOKEN_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(KRESCO_USER_KEY) || '{}')).toMatchObject(user)
    expect(readStoredAuthSession()).toEqual({ token: null, user })

    document.cookie = `${KRESCO_USER_ROLE_COOKIE}=student; Path=/`
    expect(readStoredAuthSession()).toEqual({ token: KRESCO_COOKIE_SESSION, user })
  })

  it('extracts immutable route authorization claims from the JWT payload', () => {
    expect(getAuthUserFromJwt(makeToken({ role: 'professor', is_staff: true }))).toEqual({
      role: 'professor',
      is_staff: true,
    })
    expect(getAuthUserFromJwt(makeToken({ role: 123, is_staff: 'true' }))).toEqual({
      role: null,
      is_staff: false,
    })
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

  it('syncs the in-memory auth session when another tab clears shared storage', () => {
    const user = { id: 11, email: 'shared@kresco.local', role: 'student' }

    useAuthStore.setState({
      token: KRESCO_COOKIE_SESSION,
      user,
      isHydrated: true,
      logoutError: 'stale',
      isLoggingOut: true,
    })
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(user))
    document.cookie = `${KRESCO_USER_ROLE_COOKIE}=student; Path=/`

    document.cookie = `${KRESCO_USER_ROLE_COOKIE}=; Path=/; Max-Age=0`
    localStorage.removeItem(KRESCO_USER_KEY)
    window.dispatchEvent(new StorageEvent('storage', {
      key: KRESCO_USER_KEY,
      oldValue: JSON.stringify(user),
      newValue: null,
      storageArea: localStorage,
      url: window.location.href,
    }))

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isHydrated: true,
      logoutError: null,
      isLoggingOut: false,
    })
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

  it('clears the SWR cache and local session after backend logout revocation succeeds', async () => {
    const user = { id: 3, email: 'logout@kresco.local', role: 'student' }
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    writeStoredAuthSession(user, 'logout-csrf')
    useAuthStore.setState({
      token: KRESCO_COOKIE_SESSION,
      user,
      isHydrated: true,
      logoutError: 'stale error',
      isLoggingOut: false,
    })

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().token).toBe(KRESCO_COOKIE_SESSION)
    expect(useAuthStore.getState().user).toEqual(user)
    expect(useAuthStore.getState().logoutError).toBeNull()
    expect(useAuthStore.getState().isLoggingOut).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          [KRESCO_CSRF_HEADER]: 'logout-csrf',
        }),
      }),
    )

    await vi.waitFor(() => {
      expect(useAuthStore.getState().token).toBeNull()
    })

    expect(mutate).toHaveBeenCalledWith(expect.any(Function), undefined, { revalidate: false })
    const predicate = vi.mocked(mutate).mock.calls[0][0] as (key: unknown) => boolean
    expect(predicate('/progress/xp')).toBe(true)
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().logoutError).toBeNull()
    expect(useAuthStore.getState().isLoggingOut).toBe(false)
    expect(localStorage.getItem(KRESCO_USER_KEY)).toBeNull()
    expect(readCsrfToken()).toBeNull()
  })

  it('keeps the local session when backend logout revocation fails', async () => {
    const user = { id: 4, email: 'failure@kresco.local', role: 'student' }
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    vi.stubGlobal('fetch', fetchMock)
    writeStoredAuthSession(user, 'logout-csrf')
    useAuthStore.setState({
      token: KRESCO_COOKIE_SESSION,
      user,
      isHydrated: true,
      logoutError: null,
      isLoggingOut: false,
    })

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().token).toBe(KRESCO_COOKIE_SESSION)
    expect(useAuthStore.getState().user).toEqual(user)
    expect(useAuthStore.getState().logoutError).toBeNull()
    expect(useAuthStore.getState().isLoggingOut).toBe(true)
    expect(mutate).not.toHaveBeenCalled()

    await vi.waitFor(() => {
      expect(useAuthStore.getState().logoutError).toBe(
        'We could not revoke your server session. Please sign in again to finish logging out.',
      )
    })
    expect(useAuthStore.getState().isLoggingOut).toBe(false)
    expect(useAuthStore.getState().token).toBe(KRESCO_COOKIE_SESSION)
    expect(useAuthStore.getState().user).toEqual(user)
    expect(JSON.parse(localStorage.getItem(KRESCO_USER_KEY) || '{}')).toEqual(user)
    expect(readCsrfToken()).toBe('logout-csrf')
    expect(mutate).not.toHaveBeenCalled()
  })
})
