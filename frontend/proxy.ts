import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getAuthRedirect } from '@/lib/authRedirect'
import { isJwtExpired, KRESCO_CSRF_COOKIE, KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

const CSP_HEADER = 'Content-Security-Policy'
const CSP_NONCE_PLACEHOLDER = '__KRESCO_CSP_NONCE__'
const JWT_SECRET_MIN_LENGTH = 32

let cachedCspTemplate: { key: string; value: string } | null = null

type ProxyAuthUser = {
  role: string | null
  is_staff: boolean
}

type ProxyTokenVerification = {
  expired: boolean
  user: ProxyAuthUser | null
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

function uniqueSources(sources: string[]) {
  return Array.from(new Set(sources.filter(Boolean)))
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function signatureMatches(signedValue: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(signedValue).digest('base64url')
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function verifyProxyAuthToken(token: string | undefined | null, nowMs = Date.now()): ProxyTokenVerification {
  if (!token) return { expired: true, user: null }

  const secret = (process.env.JWT_SECRET_KEY || '').trim()
  if (secret.length < JWT_SECRET_MIN_LENGTH) return { expired: true, user: null }

  const parts = token.split('.')
  if (parts.length !== 3) return { expired: true, user: null }

  const [encodedHeader, encodedPayload, signature] = parts
  const header = decodeJsonSegment(encodedHeader)
  if (header?.alg !== 'HS256') return { expired: true, user: null }
  if (!signatureMatches(`${encodedHeader}.${encodedPayload}`, signature, secret)) {
    return { expired: true, user: null }
  }

  const payload = decodeJsonSegment(encodedPayload)
  if (typeof payload?.exp !== 'number' || payload.exp * 1000 <= nowMs) {
    return { expired: true, user: null }
  }

  return {
    expired: false,
    user: {
      role: typeof payload.role === 'string' ? payload.role : null,
      is_staff: payload.is_staff === true,
    },
  }
}

export function buildContentSecurityPolicy(nonce: string) {
  return getContentSecurityPolicyTemplate().replace(CSP_NONCE_PLACEHOLDER, nonce)
}

function cspTemplateCacheKey() {
  return [
    process.env.NODE_ENV ?? '',
    process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
  ].join('\0')
}

function getContentSecurityPolicyTemplate() {
  const key = cspTemplateCacheKey()
  if (cachedCspTemplate?.key === key) {
    return cachedCspTemplate.value
  }

  const isDevelopment = process.env.NODE_ENV !== 'production'
  const apiOrigin = absoluteOrigin(process.env.NEXT_PUBLIC_API_BASE_URL)
  const devConnectSources = isDevelopment
    ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
    : []
  const devImageSources = isDevelopment ? ['http://localhost:*', 'http://127.0.0.1:*'] : []
  const devScriptSources = isDevelopment ? ["'unsafe-eval'"] : []

  const value = normalizeCsp([
    "default-src 'self'",
    `script-src 'self' 'nonce-${CSP_NONCE_PLACEHOLDER}' https://accounts.google.com https://player.vdocipher.com ${devScriptSources.join(' ')}`,
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
  let verifiedToken: ProxyTokenVerification | null = null
  const getVerifiedToken = () => {
    verifiedToken ??= verifyProxyAuthToken(token)
    return verifiedToken
  }
  const decision = getAuthRedirect(
    request.nextUrl.pathname,
    token,
    token ? () => getVerifiedToken().expired : isJwtExpired,
    () => getVerifiedToken().user,
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
