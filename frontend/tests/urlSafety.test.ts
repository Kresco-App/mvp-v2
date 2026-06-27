import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { isSafeLinkHref, isSafeRelativeUrl, sanitizeNavigationUrl } from '@/lib/urlSafety'

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n?/g, '\n')
}

describe('url safety', () => {
  it('keeps safe navigation URLs and drops unsafe protocols', () => {
    expect(isSafeRelativeUrl('/topics/42')).toBe(true)
    expect(isSafeRelativeUrl('//evil.example')).toBe(false)
    expect(sanitizeNavigationUrl(' /topics/42 ')).toBe('/topics/42')
    expect(sanitizeNavigationUrl('https://kresco.example/path')).toBe('https://kresco.example/path')
    expect(sanitizeNavigationUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeNavigationUrl('/topics/42', { allowRelative: false })).toBe('')
  })

  it('allows mail links only for link href safety', () => {
    expect(sanitizeNavigationUrl('mailto:support@kresco.local')).toBe('')
    expect(sanitizeNavigationUrl('mailto:support@kresco.local', { allowMailto: true })).toBe('mailto:support@kresco.local')
    expect(isSafeLinkHref('#section')).toBe(true)
    expect(isSafeLinkHref('mailto:support@kresco.local')).toBe(true)
  })

  it('caches repeated sanitized URL decisions by option set', () => {
    const urlSafetySource = source('lib', 'urlSafety.ts')

    expect(urlSafetySource).toContain('const URL_SAFETY_CACHE_MAX = 512')
    expect(urlSafetySource).toContain('const sanitizedNavigationUrlCache = new Map<string, string>()')
    expect(urlSafetySource).toContain('const cacheKey = urlSafetyCacheKey(trimmed, options)')
    expect(urlSafetySource).toContain('const cached = sanitizedNavigationUrlCache.get(cacheKey)')
    expect(urlSafetySource).toContain('rememberSanitizedNavigationUrl(cacheKey')
    expect(urlSafetySource).toContain('function urlSafetyCacheKey(value: string, options: UrlSafetyOptions)')
  })
})
