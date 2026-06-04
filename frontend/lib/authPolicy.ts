export type AuthUserLike = {
  role?: string | null
  tier?: string | null
  is_staff?: boolean | null
  niveau?: string | null
  filiere?: string | null
}

export type AuthAccessRequirement = {
  role?: string | null
  staff?: boolean
}

export type StudentOnboardingStep = 'niveau' | 'filiere'

export const AUTH_ROUTES = {
  landing: '/',
  studentOnboarding: '/onboarding',
  studentHome: '/home',
  studentProfessorChat: '/professor-chat',
  professorHome: '/professor',
  professorChat: '/professor/chat',
  professorLogin: '/professor/login',
} as const

const STUDENT_PROFESSOR_CHAT_TIERS = new Set(['vip', 'platinum'])

function normalizeTier(tier: string | null | undefined) {
  return String(tier ?? '').trim().toLowerCase()
}

export function isProfessorRoute(pathname: string) {
  return pathname === AUTH_ROUTES.professorHome || pathname.startsWith(`${AUTH_ROUTES.professorHome}/`)
}

export function isStudentOnboardingRoute(pathname: string) {
  return pathname === AUTH_ROUTES.studentOnboarding || pathname.startsWith(`${AUTH_ROUTES.studentOnboarding}/`)
}

export function isProfessorUser(user: AuthUserLike | null | undefined) {
  return user?.role === 'professor'
}

export function isStaffUser(user: AuthUserLike | null | undefined) {
  return user?.is_staff === true
}

export function canUseStudentProfessorChat(user: AuthUserLike | null | undefined) {
  return !isProfessorUser(user) && STUDENT_PROFESSOR_CHAT_TIERS.has(normalizeTier(user?.tier))
}

export function hasRequiredAuthAccess(
  user: AuthUserLike | null | undefined,
  requirement: AuthAccessRequirement = {},
) {
  if (requirement.role && user?.role !== requirement.role) return false
  if (requirement.staff && !isStaffUser(user)) return false
  return true
}

export function getAccessDeniedDestination(requirement: AuthAccessRequirement = {}, pathname = '') {
  void requirement
  void pathname
  return AUTH_ROUTES.studentHome
}

export function getStudentOnboardingStep(user: AuthUserLike | null | undefined): StudentOnboardingStep | null {
  if (!user?.niveau) return 'niveau'
  if (!user.filiere) return 'filiere'
  return null
}

export function getAuthenticatedDestination(user: AuthUserLike | null | undefined) {
  return isProfessorUser(user) ? AUTH_ROUTES.professorHome : AUTH_ROUTES.studentHome
}

export function getSafePostLoginDestination(
  nextDestination: string | null | undefined,
  user: AuthUserLike | null | undefined,
) {
  const value = String(nextDestination ?? '').trim()
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  if (
    value === AUTH_ROUTES.landing
    || value === AUTH_ROUTES.studentOnboarding
    || value.startsWith(`${AUTH_ROUTES.studentOnboarding}?`)
    || value.startsWith(`${AUTH_ROUTES.studentOnboarding}/`)
    || value.startsWith('/auth/')
    || value === AUTH_ROUTES.professorLogin
  ) return null
  if (isProfessorRoute(value)) return isProfessorUser(user) ? value : null
  if (value === '/admin' || value.startsWith('/admin/')) return isStaffUser(user) ? value : null
  return isProfessorUser(user) ? null : value
}

export function getUnauthorizedDestination(pathname = '') {
  return isProfessorRoute(pathname) ? AUTH_ROUTES.professorLogin : AUTH_ROUTES.landing
}

export function getStudentOnboardingDestination(pathname = '') {
  const safeNextDestination = getSafePostLoginDestination(pathname, {
    role: 'student',
    niveau: '__pending__',
    filiere: '__pending__',
  })
  if (!safeNextDestination) return AUTH_ROUTES.studentOnboarding
  return `${AUTH_ROUTES.studentOnboarding}?next=${encodeURIComponent(safeNextDestination)}`
}

export function resolveAuthSuccess(user: AuthUserLike | null | undefined, nextDestination?: string | null) {
  const safeNextDestination = getSafePostLoginDestination(nextDestination, user)

  if (isProfessorUser(user)) {
    return { action: 'redirect' as const, destination: safeNextDestination ?? AUTH_ROUTES.professorHome }
  }

  const onboardingStep = getStudentOnboardingStep(user)
  if (onboardingStep) return { action: 'onboarding' as const, step: onboardingStep }

  return { action: 'redirect' as const, destination: safeNextDestination ?? AUTH_ROUTES.studentHome }
}
