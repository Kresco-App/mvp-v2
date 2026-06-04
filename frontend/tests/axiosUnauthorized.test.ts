import { describe, expect, it } from 'vitest'

import { shouldRedirectOnUnauthorized } from '@/lib/axios'

describe('axios unauthorized routing policy', () => {
  it('leaves protected and auth routes to AuthGuard or local form handling', () => {
    expect(shouldRedirectOnUnauthorized('/home')).toBe(false)
    expect(shouldRedirectOnUnauthorized('/admin/courses')).toBe(false)
    expect(shouldRedirectOnUnauthorized('/professor/chat')).toBe(false)
    expect(shouldRedirectOnUnauthorized('/auth/login')).toBe(false)
    expect(shouldRedirectOnUnauthorized('/professor/login')).toBe(false)
  })

  it('still falls back to a client redirect on public pages', () => {
    expect(shouldRedirectOnUnauthorized('/')).toBe(true)
    expect(shouldRedirectOnUnauthorized('/about')).toBe(true)
  })
})
