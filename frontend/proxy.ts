import { randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getAuthRedirect } from '@/lib/authRedirect'
import { isJwtExpired, KRESCO_CSRF_COOKIE, KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

const CSP_HEADER = 'Content-Security-Policy'

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

function uniqueSources(sources: string[]) {
  return Array.from(new Set(sources.filter(Boolean)))
}

export function buildContentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV !== 'production'
  const apiOrigin = absoluteOrigin(process.env.NEXT_PUBLIC_API_BASE_URL)
  const devConnectSources = isDevelopment
    ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
    : []
  const devImageSources = isDevelopment ? ['http://localhost:*', 'http://127.0.0.1:*'] : []
  const devScriptSources = isDevelopment ? ["'unsafe-eval'"] : []

  return normalizeCsp([
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://accounts.google.com https://player.vdocipher.com ${devScriptSources.join(' ')}`,
    "style-src 'self' https://accounts.google.com",
    "style-src-elem 'self' 'unsafe-inline' https://accounts.google.com",
    "style-src-attr 'unsafe-inline'",
    `connect-src ${uniqueSources([
      "'self'",
      apiOrigin ?? '',
      'https://accounts.google.com',
      'https://player.vdocipher.com',
      'https://*.ably.io',
      'wss://*.ably.io',
      'https://*.ably-realtime.com',
      'wss://*.ably-realtime.com',
      ...devConnectSources,
    ]).join(' ')}`,
    `img-src ${uniqueSources([
      "'self'",
      'data:',
      'blob:',
      apiOrigin ?? '',
      'https://images.unsplash.com',
      'https://lh3.googleusercontent.com',
      'https://*.googleusercontent.com',
      'https://i.ytimg.com',
      'https://*.ytimg.com',
      ...devImageSources,
    ]).join(' ')}`,
    "font-src 'self' data:",
    "frame-src 'self' blob: https://accounts.google.com https://player.vdocipher.com https://*.vdocipher.com https://www.youtube-nocookie.com",
    "media-src 'self' blob: data: https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ])
}

function withSecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set(CSP_HEADER, csp)
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  return response
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64')
  const csp = buildContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(CSP_HEADER, csp)

  const token = request.cookies.get(KRESCO_TOKEN_COOKIE)?.value
  const userRole = request.cookies.get(KRESCO_USER_ROLE_COOKIE)?.value
  const decision = getAuthRedirect(request.nextUrl.pathname, token, isJwtExpired, userRole)

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
