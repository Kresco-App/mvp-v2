import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Root layout rendering mode', () => {
  it('does not force every route into dynamic rendering', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8')

    expect(source).not.toContain("from 'next/server'")
    expect(source).not.toContain('connection()')
  })

  it('defines production-shareable metadata instead of a bare title', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8')

    expect(source).toContain('metadataBase: siteUrl')
    expect(source).toContain("template: '%s - Kresco'")
    expect(source).toContain('openGraph: {')
    expect(source).toContain("locale: 'fr_MA'")
    expect(source).toContain('twitter: {')
    expect(source).toContain("card: 'summary_large_image'")
    expect(source).toContain('alternates: {')
    expect(source).toContain("canonical: '/'")
    expect(source).toContain("'kresco:release': releaseSha")
    expect(source).toContain('data-release={releaseSha}')
    expect(source).toContain('ClientErrorReporter')
  })
})
