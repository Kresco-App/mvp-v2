import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

import { buildContentSecurityPolicy, config, proxy } from '@/proxy'
import { KRESCO_CSRF_COOKIE, KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

function encodeSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function makeToken(payload: Record<string, unknown>) {
  return `${encodeSegment({ alg: 'none', typ: 'JWT' })}.${encodeSegment(payload)}.proxy-only`
}

function makeRequest(pathname: string, cookies: Record<string, string> = {}, host = 'app.kresco.example') {
  const headers = new Headers()
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('; ')
  if (cookieHeader) headers.set('cookie', cookieHeader)

  return new NextRequest(new Request(`https://${host}${pathname}`, { headers }))
}

function makeHttpRequest(pathname: string, cookies: Record<string, string> = {}, host = 'app.kresco.lvh.me:3000') {
  const headers = new Headers()
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('; ')
  if (cookieHeader) headers.set('cookie', cookieHeader)

  return new NextRequest(new Request(`http://${host}${pathname}`, { headers }))
}

function makeRequestWithHostHeader(
  pathname: string,
  cookies: Record<string, string> = {},
  host = 'app.kresco.lvh.me:3000',
  urlHost = 'localhost:3000',
) {
  const headers = new Headers()
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('; ')
  if (cookieHeader) headers.set('cookie', cookieHeader)
  headers.set('host', host)

  return new NextRequest(new Request(`http://${urlHost}${pathname}`, { headers }))
}

function makeForwardedHostRequest(
  pathname: string,
  forwardedHost: string,
  host = 'kresco-frontend-staging-760338563763.europe-southwest1.run.app:8080',
) {
  const headers = new Headers()
  headers.set('host', host)
  headers.set('x-forwarded-host', forwardedHost)
  return new NextRequest(new Request(`https://${host}${pathname}`, { headers }))
}

function validToken(payload: Record<string, unknown> = {}) {
  return makeToken({
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: 'student',
    is_staff: false,
    ...payload,
  })
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
  expect(response.headers.get('x-frame-options')).toBe('DENY')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('x-dns-prefetch-control')).toBe('on')
  expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
  expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  expect(response.headers.get('origin-agent-cluster')).toBe('?1')
  expect(response.headers.get('x-download-options')).toBe('noopen')
  expect(response.headers.get('x-permitted-cross-domain-policies')).toBe('none')
  expect(response.headers.get('x-xss-protection')).toBe('0')
}

describe('Next proxy auth boundary', () => {
  it('redirects unauthenticated student routes to landing', () => {
    const response = proxy(makeRequest('/courses'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://kresco.example/')
  })

  it('protects the onboarding route with the same cookie boundary as student routes', () => {
    const unauthenticated = proxy(makeRequest('/onboarding'))
    const authenticated = proxy(makeRequest('/onboarding', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))

    expect(unauthenticated.status).toBe(307)
    expect(unauthenticated.headers.get('location')).toBe('https://kresco.example/')
    expect(authenticated.status).toBe(200)
    expect(authenticated.headers.get('x-middleware-next')).toBe('1')
  })

  it('redirects unauthenticated professor routes to professor login', () => {
    const response = proxy(makeRequest('/professor/chat'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://prof.kresco.example/professor/login')
  })

  it('clears auth cookies when a protected route receives an expired token', () => {
    const response = proxy(makeRequest('/home', {
      [KRESCO_TOKEN_COOKIE]: expiredToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
      [KRESCO_CSRF_COOKIE]: 'csrf-token',
    }))
    const setCookie = response.headers.get('set-cookie') ?? response.headers.get('x-middleware-set-cookie') ?? ''

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://kresco.example/')
    expect(setCookie).toContain(`${KRESCO_TOKEN_COOKIE}=`)
    expect(setCookie).toContain(`${KRESCO_USER_ROLE_COOKIE}=`)
    expect(setCookie).toContain(`${KRESCO_CSRF_COOKIE}=`)
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('redirects authenticated professors away from landing to professor workspace', () => {
    const response = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ role: 'professor' }),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }, 'kresco.example'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://prof.kresco.example/professor')
  })

  it('defers professor role authorization to AuthGuard server verification', () => {
    const response = proxy(makeRequest('/professor', {
      [KRESCO_TOKEN_COOKIE]: validToken({ role: 'student' }),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not require the backend JWT signing secret in the frontend proxy', () => {
    delete process.env.JWT_SECRET_KEY

    const response = proxy(makeRequest('/admin', {
      [KRESCO_TOKEN_COOKIE]: makeToken({
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'professor',
        is_staff: true,
      }),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('defers staff authorization to AuthGuard while requiring a nonexpired cookie', () => {
    const accepted = proxy(makeRequest('/admin', {
      [KRESCO_TOKEN_COOKIE]: validToken({ role: 'professor', is_staff: false }),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }))
    const expired = proxy(makeRequest('/admin', {
      [KRESCO_TOKEN_COOKIE]: expiredToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }))

    expect(accepted.status).toBe(200)
    expect(accepted.headers.get('x-middleware-next')).toBe('1')
    expect(expired.status).toBe(307)
    expect(expired.headers.get('location')).toBe('https://kresco.example/')
  })

  it('allows protected routes with a valid auth cookie', () => {
    const response = proxy(makeRequest('/topics/42', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('protects CMI return routes at the proxy boundary', () => {
    const unauthenticated = proxy(makeRequest('/payment/cmi/ok'))
    const authenticated = proxy(makeRequest('/payment/cmi/fail', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))

    expect(unauthenticated.status).toBe(307)
    expect(unauthenticated.headers.get('location')).toBe('https://kresco.example/')
    expect(authenticated.status).toBe(200)
    expect(authenticated.headers.get('x-middleware-next')).toBe('1')
  })

  it('routes workspace subdomain roots to their owned app paths', () => {
    const student = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'app.kresco.example'))
    const admin = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'admin.kresco.example'))
    const professor = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ role: 'professor' }),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }, 'prof.kresco.example'))
    const staff = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'staff.kresco.example'))

    expect(student.headers.get('x-middleware-rewrite')).toBe('https://app.kresco.example/home')
    expect(admin.headers.get('x-middleware-rewrite')).toBe('https://admin.kresco.example/admin')
    expect(professor.headers.get('x-middleware-rewrite')).toBe('https://prof.kresco.example/professor')
    expect(staff.headers.get('x-middleware-rewrite')).toBe('https://staff.kresco.example/staff/payments')
  })

  it('routes staging subdomain roots without special-case deployment code', () => {
    const response = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'admin.staging.kresco.ma'))

    expect(response.headers.get('x-middleware-rewrite')).toBe('https://admin.staging.kresco.ma/admin')
  })

  it('keeps unauthenticated workspace roots out of redirect loops', () => {
    const student = proxy(makeRequest('/', {}, 'app.kresco.example'))
    const admin = proxy(makeRequest('/', {}, 'admin.kresco.example'))
    const staff = proxy(makeRequest('/', {}, 'staff.kresco.example'))
    const professor = proxy(makeRequest('/', {}, 'prof.kresco.example'))

    expect(student.headers.get('location')).toBe('https://kresco.example/')
    expect(admin.headers.get('location')).toBe('https://kresco.example/')
    expect(staff.headers.get('location')).toBe('https://kresco.example/')
    expect(professor.headers.get('location')).toBe('https://prof.kresco.example/professor/login')
  })

  it('redirects authenticated landing visitors to the right subdomain workspace', () => {
    const student = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'kresco.example'))
    const professor = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ role: 'professor' }),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }, 'kresco.example'))
    const staff = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'kresco.example'))

    expect(student.headers.get('location')).toBe('https://app.kresco.example/home')
    expect(professor.headers.get('location')).toBe('https://prof.kresco.example/professor')
    expect(staff.headers.get('location')).toBe('https://admin.kresco.example/admin')
  })

  it('supports lvh.me local subdomains with the same host routing model', () => {
    const admin = proxy(makeHttpRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'admin.kresco.lvh.me:3000'))
    const staff = proxy(makeHttpRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'staff.kresco.lvh.me:3000'))
    const unauthenticatedApp = proxy(makeHttpRequest('/', {}, 'app.kresco.lvh.me:3000'))

    expect(admin.headers.get('x-middleware-rewrite')).toBe('http://admin.kresco.lvh.me:3000/admin')
    expect(staff.headers.get('x-middleware-rewrite')).toBe('http://staff.kresco.lvh.me:3000/staff/payments')
    expect(unauthenticatedApp.headers.get('location')).toBe('http://kresco.lvh.me:3000/')
  })

  it('keeps staff subdomains out of the admin workspace even when the path is /admin', () => {
    const response = proxy(makeHttpRequest('/admin', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'staff.kresco.lvh.me:3000'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://staff.kresco.lvh.me:3000/staff/payments')
  })

  it('supports kresco.test local subdomains with the same host routing model', () => {
    const admin = proxy(makeHttpRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'admin.kresco.test:3000'))
    const unauthenticatedApp = proxy(makeHttpRequest('/', {}, 'app.kresco.test:3000'))

    expect(admin.headers.get('x-middleware-rewrite')).toBe('http://admin.kresco.test:3000/admin')
    expect(unauthenticatedApp.headers.get('location')).toBe('http://kresco.test:3000/')
  })

  it('keeps plain localhost auth redirects path-based for development', () => {
    const httpsLocalhost = proxy(makeRequest('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'localhost:3000'))
    const httpLocalhost = proxy(makeRequestWithHostHeader('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'localhost:3000'))

    expect(httpsLocalhost.headers.get('location')).toBe('https://localhost:3000/admin')
    expect(httpLocalhost.headers.get('location')).toBe('http://localhost:3000/admin')
  })

  it('uses the Host header for local subdomain routing when nextUrl is localhost', () => {
    const admin = proxy(makeRequestWithHostHeader('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'admin.kresco.lvh.me:3000'))
    const unauthenticatedApp = proxy(makeRequestWithHostHeader('/', {}, 'app.kresco.lvh.me:3000'))
    const professorAlias = proxy(makeRequestWithHostHeader(
      '/professor/login?next=chat',
      {},
      'professor.kresco.lvh.me:3000',
    ))
    const krescoTestAdmin = proxy(makeRequestWithHostHeader('/', {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }, 'admin.kresco.test:3000'))

    expect(admin.headers.get('x-middleware-rewrite')).toBe('http://admin.kresco.lvh.me:3000/admin')
    expect(unauthenticatedApp.headers.get('location')).toBe('http://kresco.lvh.me:3000/')
    expect(professorAlias.headers.get('location')).toBe('http://prof.kresco.lvh.me:3000/professor/login?next=chat')
    expect(krescoTestAdmin.headers.get('x-middleware-rewrite')).toBe('http://admin.kresco.test:3000/admin')
  })

  it('redirects www to the apex host while preserving the path and query', () => {
    const response = proxy(makeRequest('/pricing?coupon=bac', {}, 'www.kresco.example'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://kresco.example/pricing?coupon=bac')
  })

  it('uses the forwarded host before the Cloud Run host behind Firebase Hosting', () => {
    const response = proxy(makeForwardedHostRequest('/pricing?coupon=bac', 'www.kresco.example'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://kresco.example/pricing?coupon=bac')
  })

  it('keeps raw Cloud Run professor redirects on the service host for deploy scans', () => {
    const response = proxy(makeRequest(
      '/professor',
      {},
      'kresco-frontend-staging-mlrqm5mqgq-no.a.run.app',
    ))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://kresco-frontend-staging-mlrqm5mqgq-no.a.run.app/professor/login',
    )
  })

  it('still routes Firebase-forwarded professor requests to the public professor host', () => {
    const response = proxy(makeForwardedHostRequest('/professor', 'staging.kresco.ma'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://prof.staging.kresco.ma/professor/login')
  })

  it('canonicalizes professor host aliases to the configured professor origin', () => {
    const response = proxy(makeRequest('/professor/login?next=chat', {}, 'professor.kresco.example'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://prof.kresco.example/professor/login?next=chat')
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
    expect(cspDirective(csp, 'script-src')).toContain('https://apis.google.com')
    expect(cspDirective(csp, 'script-src')).toContain('https://player.vdocipher.com')
    expect(cspDirective(csp, 'script-src')).toContain('https://www.youtube.com')
    expect(cspDirective(csp, 'script-src')).not.toContain("'unsafe-inline'")
    expect(cspDirective(csp, 'style-src')).toContain('https://accounts.google.com')
    expect(cspDirective(csp, 'style-src')).not.toContain("'unsafe-inline'")
    expect(cspDirective(csp, 'style-src-elem')).toContain('https://accounts.google.com')
    expect(cspDirective(csp, 'style-src-elem')).toContain("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='")
    expect(cspDirective(csp, 'style-src-elem')).toContain("'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='")
    expect(cspDirective(csp, 'style-src-elem')).not.toContain("'unsafe-inline'")
    expect(cspDirective(csp, 'style-src-attr')).toBe("style-src-attr 'none'")
    expect(cspDirective(csp, 'connect-src')).toContain('https://identitytoolkit.googleapis.com')
    expect(cspDirective(csp, 'connect-src')).toContain('https://securetoken.googleapis.com')
    expect(cspDirective(csp, 'connect-src')).toContain('https://firestore.googleapis.com')
    expect(cspDirective(csp, 'font-src')).toBe("font-src 'self' data: https://esm.sh")
    expect(cspDirective(csp, 'frame-src')).toContain('https://*.firebaseapp.com')
    expect(cspDirective(csp, 'frame-src')).toContain('https://*.web.app')
    expect(cspDirective(csp, 'frame-src')).toContain('https://www.youtube-nocookie.com')
    expect(cspDirective(csp, 'frame-src')).toContain('https://player.vdocipher.com')
    expect(cspDirective(csp, 'frame-src')).toContain('blob:')
    expect(cspDirective(csp, 'frame-src')).toContain('about:')
    expect(cspDirective(csp, 'form-action')).toBe("form-action 'self' https://cmi.co.ma https://*.cmi.co.ma")
    expect(cspDirective(csp, 'img-src')).toContain('https://images.unsplash.com')
    expect(cspDirective(csp, 'img-src')).toContain('https://*.googleusercontent.com')
    expect(cspDirective(csp, 'img-src')).toContain('https://www.google.com')
    expect(cspDirective(csp, 'img-src')).toContain('https://i.ytimg.com')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('keeps page CSP nonces unique while reusing static policy sources', () => {
    const first = proxy(makeRequest('/topics/42', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))
    const second = proxy(makeRequest('/topics/42', {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))
    const firstCsp = first.headers.get('content-security-policy') ?? ''
    const secondCsp = second.headers.get('content-security-policy') ?? ''
    const noncePattern = /'nonce-([^']+)'/
    const firstNonce = firstCsp.match(noncePattern)?.[1]
    const secondNonce = secondCsp.match(noncePattern)?.[1]

    expect(firstNonce).toBeTruthy()
    expect(secondNonce).toBeTruthy()
    expect(firstNonce).not.toBe(secondNonce)
    expect(firstCsp.replace(noncePattern, "'nonce-<nonce>'")).toBe(
      secondCsp.replace(noncePattern, "'nonce-<nonce>'"),
    )
  })

  it('does not verify auth tokens for public routes that do not need token decisions', () => {
    const response = proxy(makeRequest('/professor/login', {
      [KRESCO_TOKEN_COOKIE]: 'malformed-token-that-would-fail-verification',
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('emits security headers on representative app surfaces', () => {
    const studentCookies = {
      [KRESCO_TOKEN_COOKIE]: validToken(),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }
    const professorCookies = {
      [KRESCO_TOKEN_COOKIE]: validToken({ role: 'professor' }),
      [KRESCO_USER_ROLE_COOKIE]: 'professor',
    }
    const staffCookies = {
      [KRESCO_TOKEN_COOKIE]: validToken({ is_staff: true }),
      [KRESCO_USER_ROLE_COOKIE]: 'student',
    }

    for (const [pathname, cookies] of [
      ['/', {}],
      ['/home', studentCookies],
      ['/calendar', studentCookies],
      ['/topics/42', studentCookies],
      ['/admin', staffCookies],
      ['/professor', professorCookies],
      ['/professor/live/session-1', professorCookies],
      ['/professor/login', {}],
    ] as const) {
      expectSecurityHeaders(proxy(makeRequest(pathname, cookies)))
    }
  })

  it('emits production HSTS without forcing subdomains before cutover', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const response = proxy(makeRequest('/professor/login'))

      expectSecurityHeaders(response)
      expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('can opt into HSTS includeSubDomains after every workspace domain is live', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('KRESCO_HSTS_INCLUDE_SUBDOMAINS', 'true')
    try {
      const response = proxy(makeRequest('/professor/login'))

      expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('emits CSP on redirects without breaking the destination', () => {
    const response = proxy(makeRequest('/professor/chat'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://prof.kresco.example/professor/login')
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

  it('keeps production CSP same-origin when API env is missing (no cross-site backend default)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '')
    try {
      const csp = buildContentSecurityPolicy('test-nonce')

      // Same-origin model: with no explicit API URL we must NOT silently whitelist
      // the cross-site staging backend (that path also breaks SameSite=Lax cookie auth).
      expect(cspDirective(csp, 'connect-src')).not.toContain('https://staging-api.invalid')
      expect(cspDirective(csp, 'connect-src')).toContain("'self'")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('allows Next development overlay styles only in development CSP', () => {
    vi.stubEnv('NODE_ENV', 'development')
    try {
      const csp = buildContentSecurityPolicy('test-nonce')

      expect(cspDirective(csp, 'style-src')).toContain("'unsafe-inline'")
      expect(cspDirective(csp, 'connect-src')).toContain('http://*.lvh.me:*')
      expect(cspDirective(csp, 'connect-src')).toContain('ws://*.lvh.me:*')
      expect(cspDirective(csp, 'connect-src')).toContain('http://*.kresco.test:*')
      expect(cspDirective(csp, 'connect-src')).toContain('ws://*.kresco.test:*')
      expect(cspDirective(csp, 'img-src')).toContain('http://*.kresco.test:*')
      expect(cspDirective(csp, 'style-src-elem')).toContain("'unsafe-inline'")
      expect(cspDirective(csp, 'style-src-elem')).not.toContain("'sha256-")
      expect(cspDirective(csp, 'style-src-attr')).toBe("style-src-attr 'unsafe-inline'")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps production CSP style directives strict', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const csp = buildContentSecurityPolicy('test-nonce')

      expect(cspDirective(csp, 'style-src')).not.toContain("'unsafe-inline'")
      expect(cspDirective(csp, 'style-src-elem')).not.toContain("'unsafe-inline'")
      expect(cspDirective(csp, 'style-src-attr')).toBe("style-src-attr 'none'")
    } finally {
      vi.unstubAllEnvs()
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
