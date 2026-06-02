import { describe, expect, it } from 'vitest'

import {
  defaultApiBaseUrl,
  getAdminRootUrl,
  getApiBaseUrl,
  getApiOrigin,
  getBackendUrl,
  normalizeApiBaseUrl,
} from '@/lib/apiConfig'

describe('frontend API runtime config', () => {
  it('defaults to same-origin API routing instead of localhost', () => {
    expect(getApiBaseUrl('')).toBe('/api/')
    expect(getApiBaseUrl(undefined)).toBe('/api/')
  })

  it('defaults to same-origin /api/ even for production builds (cross-site backends must be explicit)', () => {
    expect(defaultApiBaseUrl()).toBe('/api/')
  })

  it('normalizes configured API base URLs', () => {
    expect(normalizeApiBaseUrl('https://api.kresco.ma/api')).toBe('https://api.kresco.ma/api/')
    expect(normalizeApiBaseUrl('https://api.kresco.ma/api/')).toBe('https://api.kresco.ma/api/')
  })

  it('derives backend origins from API URLs', () => {
    expect(getApiOrigin('https://api.kresco.ma/api/')).toBe('https://api.kresco.ma')
    expect(getApiOrigin('/api/')).toBe('')
  })

  it('builds backend asset and admin URLs from one source of truth', () => {
    expect(getBackendUrl('/media/avatar.png', 'https://api.kresco.ma/api/')).toBe('https://api.kresco.ma/media/avatar.png')
    expect(getBackendUrl('/media/avatar.png', '/api/')).toBe('/media/avatar.png')
    expect(getBackendUrl('https://cdn.kresco.ma/avatar.png', '/api/')).toBe('https://cdn.kresco.ma/avatar.png')
    expect(getAdminRootUrl('https://api.kresco.ma/api/')).toBe('https://api.kresco.ma/admin')
  })
})
