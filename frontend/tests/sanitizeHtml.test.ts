import { describe, expect, it } from 'vitest'

import { sanitizeHtml } from '@/lib/sanitizeHtml'

describe('sanitizeHtml', () => {
  it('removes script content and event handlers', () => {
    expect(sanitizeHtml('<p onclick="alert(1)">Safe</p><script>alert(2)</script>')).toBe('<p>Safe</p>')
  })

  it('keeps safe lesson markup and safe links', () => {
    expect(sanitizeHtml('<h2>Title</h2><p>Read <a href="/calendar" target="_blank">more</a>.</p>')).toBe(
      '<h2>Title</h2><p>Read <a href="/calendar" target="_blank" rel="noopener noreferrer">more</a>.</p>',
    )
  })

  it('drops unsafe link protocols and unsupported embeds', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">bad</a><iframe src="https://example.com"></iframe>')).toBe(
      '<a>bad</a>',
    )
    expect(sanitizeHtml('<a href="//evil.example/phish">bad</a>')).toBe('<a>bad</a>')
  })

  it('removes parser-confusing XSS payloads', () => {
    const nestedScript = sanitizeHtml('<img src=x onerror=alert(1)><scr<script>ipt>alert(2)</scr</script>ipt>')
    expect(nestedScript).not.toContain('onerror')
    expect(nestedScript).not.toContain('<script')

    const malformedSvg = sanitizeHtml('<svg><g/onload=alert(1)//<p>Safe</p>')
    expect(malformedSvg).not.toContain('onload')
    expect(malformedSvg).not.toContain('<svg')
  })
})
