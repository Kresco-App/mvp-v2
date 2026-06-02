import { describe, expect, it } from 'vitest'

import { isAllowedCsrfRequestTarget } from '@/lib/axios'

describe('axios CSRF target policy', () => {
  it('allows relative same-origin API requests', () => {
    expect(isAllowedCsrfRequestTarget({ baseURL: '/api/', url: '/courses/topics' }, '/api/')).toBe(true)
    expect(isAllowedCsrfRequestTarget({ baseURL: '/api/', url: 'courses/topics' }, '/api/')).toBe(true)
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
