import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'

const frontendPort = Number(process.env.KRESCO_E2E_FRONTEND_PORT ?? 3101)
const backendPort = Number(process.env.KRESCO_E2E_BACKEND_PORT ?? 8010)
const frontendOrigin = `http://127.0.0.1:${frontendPort}`
const backendOrigin = `http://127.0.0.1:${backendPort}`
const jwtSecretKey = requiredJwtSecretKey()

function requiredJwtSecretKey() {
  const value = process.env.JWT_SECRET_KEY
  if (!value) {
    throw new Error('JWT_SECRET_KEY must be provided by the Playwright config before E2E auth helpers load.')
  }
  return value
}
const authManifestPath = process.env.KRESCO_E2E_AUTH_MANIFEST
  ?? resolve(process.cwd(), '../backend/e2e_auth_manifest.json')

type SeededAuthUser = {
  id: number
  email: string
  full_name: string
  role: string
  tier: string
  is_staff: boolean
  is_superuser: boolean
  is_pro: boolean
  niveau: string
  filiere: string
  is_email_verified: boolean
  auth_token_version: number
}

type AuthManifest = {
  users: Record<string, SeededAuthUser>
}

let authManifest: AuthManifest | null = null

function apiUrl(path: string) {
  return `${backendOrigin}${path}`
}

function loadAuthManifest() {
  if (authManifest) return authManifest

  try {
    authManifest = JSON.parse(readFileSync(authManifestPath, 'utf8')) as AuthManifest
    return authManifest
  } catch (error) {
    throw new Error(
      `E2E auth manifest is missing or invalid at ${authManifestPath}. Run the integration setup before tests.\n${String(error)}`,
    )
  }
}

function seededUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const user = loadAuthManifest().users[normalizedEmail]
  if (!user) {
    throw new Error(`Seeded E2E user is not in auth manifest: ${normalizedEmail}`)
  }
  return user
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function createSessionToken(user: SeededAuthUser) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' })
  const payload = base64UrlJson({
    user_id: user.id,
    token_version: user.auth_token_version,
    role: user.role,
    is_staff: user.is_staff,
    iat: now,
    exp: now + 60 * 60 * 24,
  })
  const signature = createHmac('sha256', jwtSecretKey)
    .update(`${header}.${payload}`)
    .digest('base64url')

  return `${header}.${payload}.${signature}`
}

function authSnapshot(user: SeededAuthUser) {
  return {
    __kresco_minimal_auth_snapshot: true,
    role: user.role,
    is_staff: user.is_staff,
  }
}

function authenticatedDestination(user: SeededAuthUser) {
  if (user.role === 'professor') return '/professor'
  if (user.is_staff) return '/admin'
  return '/home'
}

export async function authenticateSeededUser(page: Page, email: string) {
  const user = seededUser(email)
  const token = createSessionToken(user)
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24

  await page.context().clearCookies()
  await page.context().addCookies([
    {
      name: '__session',
      value: token,
      url: frontendOrigin,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires,
    },
    {
      name: 'kresco_user_role',
      value: user.role,
      url: frontendOrigin,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires,
    },
  ])

  const csrfResponse = await page.request.get(apiUrl('/api/auth/csrf'))
  expect(csrfResponse.status()).toBe(200)
  const csrfBody = await csrfResponse.json() as { csrf_token: string }

  const profileResponse = await page.request.get(apiUrl('/api/profile/me'))
  expect(profileResponse.status()).toBe(200)
  const profile = await profileResponse.json()
  const snapshot = authSnapshot(user)

  await page.addInitScript(({ csrfToken, storedUser }) => {
    window.localStorage.setItem('kresco_user', JSON.stringify(storedUser))
    window.localStorage.removeItem('kresco_token')
    window.sessionStorage.setItem('kresco_csrf', csrfToken)
  }, { csrfToken: csrfBody.csrf_token, storedUser: snapshot })

  await page.evaluate(({ csrfToken, storedUser }) => {
    window.localStorage.setItem('kresco_user', JSON.stringify(storedUser))
    window.localStorage.removeItem('kresco_token')
    window.sessionStorage.setItem('kresco_csrf', csrfToken)
  }, { csrfToken: csrfBody.csrf_token, storedUser: snapshot }).catch(() => undefined)

  return { user: profile, csrf_token: csrfBody.csrf_token }
}

export async function loginAsSeededUser(page: Page, email: string) {
  const session = await authenticateSeededUser(page, email)
  await page.goto(authenticatedDestination(seededUser(email)))
  return session
}
