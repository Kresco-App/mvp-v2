import { afterEach, describe, expect, it, vi } from 'vitest'

import { isAllowedCsrfRequestTarget } from '@/lib/axios'

describe('axios CSRF target policy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('allows relative same-origin API requests', () => {
    expect(isAllowedCsrfRequestTarget({ baseURL: '/api/', url: '/courses/topics' }, '/api/')).toBe(true)
    expect(isAllowedCsrfRequestTarget({ baseURL: '/api/', url: 'courses/topics' }, '/api/')).toBe(true)
  })

  it('keeps local subdomain requests same-origin through the frontend /api rewrite', () => {
    vi.stubGlobal('window', { location: { origin: 'http://admin.kresco.lvh.me:3000' } })

    expect(isAllowedCsrfRequestTarget({ baseURL: '/api/', url: '/admin/founder-dashboard' }, '/api/')).toBe(true)
    expect(isAllowedCsrfRequestTarget(
      { baseURL: '/api/', url: 'http://api.kresco.lvh.me:8000/admin/founder-dashboard' },
      '/api/',
    )).toBe(false)

    vi.stubGlobal('window', { location: { origin: 'http://admin.kresco.test:3000' } })

    expect(isAllowedCsrfRequestTarget({ baseURL: '/api/', url: '/admin/founder-dashboard' }, '/api/')).toBe(true)
    expect(isAllowedCsrfRequestTarget(
      { baseURL: '/api/', url: 'http://api.kresco.test:8000/admin/founder-dashboard' },
      '/api/',
    )).toBe(false)
  })

  it('allows the configured backend API origin', () => {
    expect(isAllowedCsrfRequestTarget(
      { baseURL: 'https://api.kresco.ma/api/', url: '/profile/me' },
      'https://api.kresco.ma/api/',
    )).toBe(true)
  })

  it('rejects absolute third-party unsafe request targets', () => {
    expect(isAllowedCsrfRequestTarget(
      { baseURL: '/api/', url: 'https://third-party.example/upload' },
      '/api/',
    )).toBe(false)
    expect(isAllowedCsrfRequestTarget(
      { baseURL: 'https://api.kresco.ma/api/', url: 'https://third-party.example/upload' },
      'https://api.kresco.ma/api/',
    )).toBe(false)
  })
})
