import { randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getAuthRedirect } from '@/lib/authRedirect'
import { getApiOrigin } from '@/lib/apiConfig'
import { isJwtExpired, KRESCO_CSRF_COOKIE, KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

const CSP_HEADER = 'Content-Security-Policy'
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

export function buildContentSecurityPolicy(nonce?: string | null) {
  const nonceSource = nonce ? `'nonce-${nonce}'` : ''
  return getContentSecurityPolicyTemplate(nonceSource)
}

function cspTemplateCacheKey() {
  return [
    process.env.NODE_ENV ?? '',
    process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
    getApiOrigin(),
  ].join('\0')
}

function getContentSecurityPolicyTemplate(nonceSource: string) {
  const key = `${cspTemplateCacheKey()}\0${nonceSource}`
  if (cachedCspTemplate?.key === key) {
    return cachedCspTemplate.value
  }

  const isDevelopment = process.env.NODE_ENV !== 'production'
  const apiBase = getApiOrigin()
  const apiOrigin = absoluteOrigin(process.env.NEXT_PUBLIC_API_BASE_URL) ?? (apiBase || null)
  const apiNetworkOrigin = absoluteOrigin(apiBase)
  const firebaseOrigin = firebaseAuthOrigin()
  const allowDevOverlayStyles = process.env.NODE_ENV === 'development'
  const devConnectSources = isDevelopment
    ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
    : []
  const devImageSources = isDevelopment ? ['http://localhost:*', 'http://127.0.0.1:*'] : []
  const devScriptSources = isDevelopment ? ["'unsafe-eval'"] : []
  const devStyleSources = allowDevOverlayStyles ? ["'unsafe-inline'"] : []
  const scriptSources = uniqueSources([
    "'self'",
    nonceSource,
    'https://accounts.google.com',
    'https://apis.google.com',
    'https://player.vdocipher.com',
    'https://www.youtube.com',
    ...devScriptSources,
  ])
  const styleElemIntegritySources = allowDevOverlayStyles
    ? []
    : [
      "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
      "'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='",
    ]
  const styleAttrSource = allowDevOverlayStyles ? "'unsafe-inline'" : "'none'"
  const styleSources = uniqueSources(["'self'", 'https://accounts.google.com', ...devStyleSources])
  const styleElemSources = uniqueSources([
    "'self'",
    ...styleElemIntegritySources,
    'https://accounts.google.com',
    ...devStyleSources,
  ])

  const value = normalizeCsp([
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    `style-src ${styleSources.join(' ')}`,
    `style-src-elem ${styleElemSources.join(' ')}`,
    `style-src-attr ${styleAttrSource}`,
    `connect-src ${uniqueSources([
      "'self'",
      apiOrigin ?? '',
      apiNetworkOrigin ?? '',
      firebaseOrigin ?? '',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firestore.googleapis.com',
      'https://www.googleapis.com',
      'https://accounts.google.com',
      'https://player.vdocipher.com',
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
      'https://www.google.com',
      'https://i.ytimg.com',
      'https://*.ytimg.com',
      ...devImageSources,
    ]).join(' ')}`,
    "font-src 'self' data: https://esm.sh",
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
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  response.headers.set('Origin-Agent-Cluster', '?1')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  return response
}

export function proxy(request: NextRequest) {
  const nonce = process.env.KRESCO_CSP_NONCE === 'false' ? null : randomBytes(16).toString('base64')
  const csp = buildContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  if (nonce) requestHeaders.set('x-nonce', nonce)
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
