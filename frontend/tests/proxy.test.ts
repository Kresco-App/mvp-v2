import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { proxy } from '@/proxy'
import { KRESCO_TOKEN_COOKIE, KRESCO_USER_ROLE_COOKIE } from '@/lib/authSession'

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
    }))
    const setCookie = response.headers.get('set-cookie') ?? response.headers.get('x-middleware-set-cookie') ?? ''

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.kresco.example/')
    expect(setCookie).toContain(`${KRESCO_TOKEN_COOKIE}=`)
    expect(setCookie).toContain(`${KRESCO_USER_ROLE_COOKIE}=`)
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
})
