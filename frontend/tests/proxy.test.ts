import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { buildContentSecurityPolicy, config, proxy } from '@/proxy'
import { KRESCO_CSRF_COOKIE, KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

function makeToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.test`
}

function makeRequest(pathname: string, cookies: Record<string, string> = {}) {
  const headers = new Headers()
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('; ')
  if (cookieHeader) headers.set('cookie', cookieHeader)

  return new NextRequest(new Request(`https://app.kresco.example${pathname}`, { headers }))
}

function validToken() {
  return makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 })
}

function expiredToken() {
  return makeToken({ exp: Math.floor(Date.now() / 1000) - 60 })
}

function cspDirective(csp: string, name: string) {
  return csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `)) ?? ''
}

function expectSecurityHeaders(response: ReturnType<typeof proxy>) {
  expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
  expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  expect(response.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=(), payment=()')
}

describe('Next proxy auth boundary', () => {
  it('redirects unauthenticated student routes to landing', () => {
    const response = proxy(makeRequest('/courses'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.kresco.example/')
  })

  it('redirects unauthenticated professor routes to professor login', () => {
    const response = proxy(makeRequest('/professor/chat'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.kresco.example/professor/login')
  })

  it('clears auth cookies when a protected route receives an expired token', () => {
    const response = proxy(makeRequest('/home', {
      [KRESCO_TOKEN_COOKIE]: expiredToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
      [KRESCO_CSRF_COOKIE]: 'csrf-token',
    }))
    const setCookie = response.headers.get('set-cookie') ?? response.headers.get('x-middleware-set-cookie') ?? ''

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.kresco.example/')
    expect(setCookie).toContain(`${KRESCO_TOKEN_COOKIE}=`)
    expect(setCookie).toContain(`${KRESCO_USER_ROLE_COOKIE}=`)
    expect(setCookie).toContain(`${KRESCO_CSRF_COOKIE}=`)
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('redirects authenticated professors away from landing to professor workspace', () => {
    const response = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.kresco.example/professor')
  })

  it('allows protected routes with a valid auth cookie', () => {
    const response = proxy(makeRequest('/topics/42', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('emits a blocking CSP on allowed page responses', () => {
    const response = proxy(makeRequest('/topics/42', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(csp).toContain("default-src 'self'")
    expect(cspDirective(csp, 'script-src')).toContain("'self'")
    expect(cspDirective(csp, 'script-src')).not.toContain("'strict-dynamic'")
    expect(cspDirective(csp, 'script-src')).toMatch(/'nonce-[^']+'/)
    expect(cspDirective(csp, 'script-src')).toContain('https://accounts.google.com')
    expect(cspDirective(csp, 'script-src')).toContain('https://player.vdocipher.com')
    expect(cspDirective(csp, 'script-src')).not.toContain("'unsafe-inline'")
    expect(cspDirective(csp, 'style-src')).toContain('https://accounts.google.com')
    expect(cspDirective(csp, 'style-src')).not.toContain("'unsafe-inline'")
    expect(cspDirective(csp, 'style-src-elem')).toContain("'unsafe-inline'")
    expect(cspDirective(csp, 'style-src-elem')).toContain('https://accounts.google.com')
    expect(cspDirective(csp, 'style-src-attr')).toBe("style-src-attr 'unsafe-inline'")
    expect(cspDirective(csp, 'connect-src')).toContain('wss://*.ably.io')
    expect(cspDirective(csp, 'frame-src')).toContain('https://www.youtube-nocookie.com')
    expect(cspDirective(csp, 'frame-src')).toContain('https://player.vdocipher.com')
    expect(cspDirective(csp, 'frame-src')).toContain('blob:')
    expect(cspDirective(csp, 'img-src')).toContain('https://images.unsplash.com')
    expect(cspDirective(csp, 'img-src')).toContain('https://*.googleusercontent.com')
    expect(cspDirective(csp, 'img-src')).toContain('https://i.ytimg.com')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('emits security headers on representative app surfaces', () => {
    const studentCookies = {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }
    const professorCookies = {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }

    for (const [pathname, cookies] of [
      ['/', {}],
      ['/home', studentCookies],
      ['/calendar', studentCookies],
      ['/watch/lesson-1', studentCookies],
      ['/admin', professorCookies],
      ['/professor', professorCookies],
      ['/professor/live/session-1', professorCookies],
      ['/professor/login', {}],
    ] as const) {
      expectSecurityHeaders(proxy(makeRequest(pathname, cookies)))
    }
  })

  it('emits CSP on redirects without breaking the destination', () => {
    const response = proxy(makeRequest('/professor/chat'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.kresco.example/professor/login')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
  })

  it('includes the configured backend origin in network and media directives', () => {
    const original = process.env.NEXT_PUBLIC_API_BASE_URL
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.kresco.example/api'
    try {
      const csp = buildContentSecurityPolicy('test-nonce')

      expect(cspDirective(csp, 'connect-src')).toContain('https://api.kresco.example')
      expect(cspDirective(csp, 'img-src')).toContain('https://api.kresco.example')
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL
      else process.env.NEXT_PUBLIC_API_BASE_URL = original
    }
  })

  it('keeps API, media, and static assets outside the page CSP matcher', () => {
    const source = config.matcher[0].source

    expect(source).toContain('api|media|_next/static|_next/image')
    expect(source).toContain('favicon.ico')
    expect(source).toContain('robots.txt')
    expect(source).toContain('sitemap.xml')
    expect(source).toContain('.*\\..*')
  })
})
