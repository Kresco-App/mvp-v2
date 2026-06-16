import { randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getAuthRedirect } from '@/lib/authRedirect'
import { getApiOrigin } from '@/lib/apiConfig'
import { isJwtExpired, KRESCO_CSRF_COOKIE, KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

const CSP_HEADER = 'Content-Security-Policy'
const CSP_NONCE_PLACEHOLDER = '__KRESCO_CSP_NONCE__'

let cachedCspTemplate: { key: string; value: string } | null = null

type ProxyAuthUser = {
  role: string | null
  is_staff: boolean
}

function normalizeCsp(directives: string[]) {
  return directives
    .map((directive) => directive.trim())
    .filter(Boolean)
    .join('; ')
}

function absoluteOrigin(value?: string | null) {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

function firebaseAuthOrigin() {
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()
  if (!authDomain || /^https?:\/\//i.test(authDomain)) return null
  return absoluteOrigin(`https://${authDomain}`)
}

function uniqueSources(sources: string[]) {
  return Array.from(new Set(sources.filter(Boolean)))
}

export function buildContentSecurityPolicy(nonce: string) {
  return getContentSecurityPolicyTemplate().replace(CSP_NONCE_PLACEHOLDER, nonce)
}

function cspTemplateCacheKey() {
  return [
    process.env.NODE_ENV ?? '',
    process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
    getApiOrigin(),
  ].join('\0')
}

function getContentSecurityPolicyTemplate() {
  const key = cspTemplateCacheKey()
  if (cachedCspTemplate?.key === key) {
    return cachedCspTemplate.value
  }

  const isDevelopment = process.env.NODE_ENV !== 'production'
  const apiBase = getApiOrigin()
  const apiOrigin = absoluteOrigin(process.env.NEXT_PUBLIC_API_BASE_URL) ?? (apiBase || null)
  const apiNetworkOrigin = absoluteOrigin(apiBase)
  const firebaseOrigin = firebaseAuthOrigin()
  const devConnectSources = isDevelopment
    ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
    : []
  const devImageSources = isDevelopment ? ['http://localhost:*', 'http://127.0.0.1:*'] : []
  const devScriptSources = isDevelopment ? ["'unsafe-eval'"] : []

  const value = normalizeCsp([
    "default-src 'self'",
    `script-src 'self' 'nonce-${CSP_NONCE_PLACEHOLDER}' https://accounts.google.com https://player.vdocipher.com ${devScriptSources.join(' ')}`,
    "style-src 'self' https://accounts.google.com",
    "style-src-elem 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=' https://accounts.google.com",
    "style-src-attr 'none'",
    `connect-src ${uniqueSources([
      "'self'",
      apiOrigin ?? '',
      apiNetworkOrigin ?? '',
      firebaseOrigin ?? '',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://www.googleapis.com',
      'https://accounts.google.com',
      'https://player.vdocipher.com',
      'https://*.ably.io',
      'wss://*.ably.io',
      'https://*.ably.net',
      'wss://*.ably.net',
      'https://*.ably-realtime.com',
      'wss://*.ably-realtime.com',
      ...devConnectSources,
    ]).join(' ')}`,
    `img-src ${uniqueSources([
      "'self'",
      'data:',
      'blob:',
      apiOrigin ?? '',
      apiNetworkOrigin ?? '',
      'https://images.unsplash.com',
      'https://lh3.googleusercontent.com',
      'https://*.googleusercontent.com',
      'https://i.ytimg.com',
      'https://*.ytimg.com',
      ...devImageSources,
    ]).join(' ')}`,
    "font-src 'self' data:",
    `frame-src ${uniqueSources([
      "'self'",
      'blob:',
      'about:',
      firebaseOrigin ?? '',
      'https://*.firebaseapp.com',
      'https://*.web.app',
      'https://accounts.google.com',
      'https://player.vdocipher.com',
      'https://*.vdocipher.com',
      'https://www.youtube-nocookie.com',
    ]).join(' ')}`,
    "media-src 'self' blob: data: https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://cmi.co.ma https://*.cmi.co.ma",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ])
  cachedCspTemplate = { key, value }
  return value
}

function withSecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set(CSP_HEADER, csp)
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64')
  const csp = buildContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(CSP_HEADER, csp)

  const token = request.cookies.get(KRESCO_TOKEN_COOKIE)?.value
  const roleCookie = request.cookies.get(KRESCO_USER_ROLE_COOKIE)?.value?.trim() || null
  const getProxyUser = (): ProxyAuthUser => ({ role: roleCookie, is_staff: false })
  const decision = getAuthRedirect(
    request.nextUrl.pathname,
    token,
    isJwtExpired,
    getProxyUser,
    { enforceClaimAccess: false },
  )

  if (decision.action === 'allow') {
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp)
  }

  const response = NextResponse.redirect(new URL(decision.destination, request.url))
  if (decision.clearCookie) {
    response.cookies.delete(KRESCO_TOKEN_COOKIE)
    response.cookies.delete(KRESCO_USER_ROLE_COOKIE)
    response.cookies.delete(KRESCO_CSRF_COOKIE)
  }
  return withSecurityHeaders(response, csp)
}

export const config = {
  matcher: [
    {
      source: '/((?!api|media|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
