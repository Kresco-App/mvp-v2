import { randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getAuthRedirect } from '@/lib/authRedirect'
import { getApiOrigin } from '@/lib/apiConfig'
import { AUTH_ROUTES, getAuthenticatedDestination } from '@/lib/authPolicy'
import {
  getAuthUserFromJwt,
  isJwtExpired,
  KRESCO_CSRF_COOKIE,
  KRESCO_TOKEN_COOKIE,
  KRESCO_USER_ROLE_COOKIE,
} from '@/lib/authSession'

const CSP_HEADER = 'Content-Security-Policy'
let cachedCspTemplate: { key: string; value: string } | null = null

type ProxyAuthUser = {
  role: string | null
  is_staff: boolean
}

type WorkspaceHost = 'landing' | 'www' | 'student' | 'admin' | 'professor' | 'staff'

const ROUTED_HOST_LABELS = new Set(['www', 'app', 'admin', 'prof', 'professor', 'staff'])

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

function workspaceForHostname(hostname: string): WorkspaceHost {
  const firstLabel = hostname.split('.')[0] ?? ''
  if (firstLabel === 'www') return 'www'
  if (firstLabel === 'app') return 'student'
  if (firstLabel === 'admin') return 'admin'
  if (firstLabel === 'prof' || firstLabel === 'professor') return 'professor'
  if (firstLabel === 'staff') return 'staff'
  return 'landing'
}

function hostnameFromHeader(value: string | null) {
  const host = value?.split(',')[0]?.trim().toLowerCase()
  if (!host) return null

  try {
    return new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

function requestHostname(request: NextRequest) {
  return (
    hostnameFromHeader(request.headers.get('x-forwarded-host')) ??
    hostnameFromHeader(request.headers.get('host')) ??
    request.nextUrl.hostname.toLowerCase()
  )
}

function isProfessorAliasHostname(hostname: string) {
  const labels = hostname.split('.').filter(Boolean)
  return labels.length > 1 && labels[0] === 'professor'
}

function apexHostname(hostname: string) {
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length <= 1) return hostname
  return ROUTED_HOST_LABELS.has(labels[0] ?? '') ? labels.slice(1).join('.') : hostname
}

function isLocalhostHostname(hostname: string) {
  return hostname === 'localhost' || hostname.endsWith('.localhost')
}

function isCloudRunHostname(hostname: string) {
  return hostname === 'run.app' || hostname.endsWith('.run.app')
}

function hasRoutableSubdomain(hostname: string) {
  return Boolean(
    hostname
    && !isLocalhostHostname(hostname)
    && !isCloudRunHostname(hostname)
    && hostname !== '127.0.0.1'
    && hostname !== '::1'
    && !hostname.includes(':'),
  )
}

function workspaceHostname(currentHostname: string, workspace: Exclude<WorkspaceHost, 'landing' | 'www'>) {
  if (!hasRoutableSubdomain(currentHostname)) return currentHostname

  const apex = apexHostname(currentHostname)
  const label = workspace === 'student' ? 'app' : workspace === 'professor' ? 'prof' : workspace
  return `${label}.${apex}`
}

function workspaceRootPath(workspace: WorkspaceHost) {
  if (workspace === 'student') return AUTH_ROUTES.studentHome
  if (workspace === 'admin') return AUTH_ROUTES.adminHome
  if (workspace === 'professor') return AUTH_ROUTES.professorHome
  if (workspace === 'staff') return AUTH_ROUTES.staffHome
  return null
}

function destinationWorkspace(pathname: string): Exclude<WorkspaceHost, 'landing' | 'www'> {
  if (pathname === AUTH_ROUTES.adminHome || pathname.startsWith(`${AUTH_ROUTES.adminHome}/`)) return 'admin'
  if (pathname === AUTH_ROUTES.professorHome || pathname.startsWith(`${AUTH_ROUTES.professorHome}/`)) return 'professor'
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return 'staff'
  return 'student'
}

function urlForHostname(request: NextRequest, hostname: string, pathname: string, search = request.nextUrl.search) {
  const url = request.nextUrl.clone()
  url.hostname = hostname
  if (request.headers.get('x-forwarded-host') && request.nextUrl.port === '8080') {
    url.port = ''
  }
  url.pathname = pathname
  url.search = search
  return url
}

function authenticatedWorkspaceUrl(request: NextRequest, destination: string, hostname: string) {
  const workspace = destinationWorkspace(destination)
  return urlForHostname(request, workspaceHostname(hostname, workspace), destination, '')
}

function requestSearchForPath(request: NextRequest, pathname: string) {
  return pathname === request.nextUrl.pathname ? request.nextUrl.search : ''
}

function loginSearchParams(request: NextRequest, workspace: 'admin' | 'staff', effectivePathname: string, hostname: string) {
  const params = new URLSearchParams()
  if (!hasRoutableSubdomain(hostname)) params.set('workspace', workspace)
  if (effectivePathname && effectivePathname !== AUTH_ROUTES.landing) {
    params.set('next', `${effectivePathname}${requestSearchForPath(request, effectivePathname)}`)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

function authRedirectUrl(
  request: NextRequest,
  hostname: string,
  workspace: WorkspaceHost,
  destination: string,
  effectivePathname: string,
) {
  if (destination === AUTH_ROUTES.landing && workspace === 'student') {
    return urlForHostname(request, apexHostname(hostname), AUTH_ROUTES.landing, '')
  }

  if (destination === AUTH_ROUTES.workspaceLogin) {
    const loginWorkspace = workspace === 'staff' || effectivePathname === '/staff' || effectivePathname.startsWith('/staff/')
      ? 'staff'
      : 'admin'
    return urlForHostname(
      request,
      workspaceHostname(hostname, loginWorkspace),
      AUTH_ROUTES.workspaceLogin,
      loginSearchParams(request, loginWorkspace, effectivePathname, hostname),
    )
  }

  if (destination === AUTH_ROUTES.professorLogin) {
    return urlForHostname(request, workspaceHostname(hostname, 'professor'), destination, '')
  }

  return new URL(destination, request.url)
}

function isStaffWorkspacePath(pathname: string) {
  return pathname === '/staff' || pathname.startsWith('/staff/')
}

function isAuthPath(pathname: string) {
  return pathname === AUTH_ROUTES.workspaceLogin || pathname === '/auth' || pathname.startsWith('/auth/')
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
    ? [
      'http://localhost:*',
      'http://*.localhost:*',
      'http://127.0.0.1:*',
      'http://lvh.me:*',
      'http://*.lvh.me:*',
      'http://kresco.test:*',
      'http://*.kresco.test:*',
      'ws://localhost:*',
      'ws://*.localhost:*',
      'ws://127.0.0.1:*',
      'ws://lvh.me:*',
      'ws://*.lvh.me:*',
      'ws://kresco.test:*',
      'ws://*.kresco.test:*',
    ]
    : []
  const devImageSources = isDevelopment
    ? [
      'http://localhost:*',
      'http://*.localhost:*',
      'http://127.0.0.1:*',
      'http://lvh.me:*',
      'http://*.lvh.me:*',
      'http://kresco.test:*',
      'http://*.kresco.test:*',
    ]
    : []
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
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  response.headers.set('Origin-Agent-Cluster', '?1')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  response.headers.set('X-XSS-Protection', '0')
  if (process.env.NODE_ENV === 'production') {
    const includeSubdomains = process.env.KRESCO_HSTS_INCLUDE_SUBDOMAINS === 'true'
    response.headers.set('Strict-Transport-Security', includeSubdomains ? 'max-age=31536000; includeSubDomains' : 'max-age=31536000')
  }
  return response
}

export function proxy(request: NextRequest) {
  const nonce = process.env.KRESCO_CSP_NONCE === 'false' ? null : randomBytes(16).toString('base64')
  const csp = buildContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  if (nonce) requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(CSP_HEADER, csp)

  const hostname = requestHostname(request)

  if (isProfessorAliasHostname(hostname)) {
    return withSecurityHeaders(
      NextResponse.redirect(urlForHostname(request, workspaceHostname(hostname, 'professor'), request.nextUrl.pathname)),
      csp,
    )
  }

  const workspace = workspaceForHostname(hostname)

  if (workspace === 'www') {
    return withSecurityHeaders(
      NextResponse.redirect(urlForHostname(request, apexHostname(hostname), request.nextUrl.pathname)),
      csp,
    )
  }

  if (workspace === 'staff' && request.nextUrl.pathname !== '/' && !isStaffWorkspacePath(request.nextUrl.pathname) && !isAuthPath(request.nextUrl.pathname)) {
    return withSecurityHeaders(
      NextResponse.redirect(urlForHostname(request, hostname, '/staff/payments', '')),
      csp,
    )
  }

  const token = request.cookies.get(KRESCO_TOKEN_COOKIE)?.value
  if (workspace === 'landing' && request.nextUrl.pathname === '/' && token && !isJwtExpired(token)) {
    return withSecurityHeaders(
      NextResponse.redirect(authenticatedWorkspaceUrl(request, getAuthenticatedDestination(getAuthUserFromJwt(token)), hostname)),
      csp,
    )
  }

  const workspaceRoot = request.nextUrl.pathname === '/' ? workspaceRootPath(workspace) : null
  const effectivePathname = workspaceRoot ?? request.nextUrl.pathname
  const roleCookie = request.cookies.get(KRESCO_USER_ROLE_COOKIE)?.value?.trim() || null
  const getProxyUser = (): ProxyAuthUser => ({ role: roleCookie, is_staff: false })
  const decision = getAuthRedirect(
    effectivePathname,
    token,
    isJwtExpired,
    getProxyUser,
    { enforceClaimAccess: false },
  )

  if (decision.action === 'allow') {
    if (effectivePathname !== request.nextUrl.pathname) {
      const rewriteUrl = urlForHostname(request, hostname, effectivePathname)
      return withSecurityHeaders(NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } }), csp)
    }
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp)
  }

  const response = NextResponse.redirect(authRedirectUrl(request, hostname, workspace, decision.destination, effectivePathname))
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
