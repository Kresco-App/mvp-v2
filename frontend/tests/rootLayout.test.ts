import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Root layout rendering mode', () => {
  it('reads request headers for CSP nonce support without using connection()', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8')

    expect(source).not.toContain("from 'next/server'")
    expect(source).toContain("from 'next/headers'")
    expect(source).not.toContain('connection()')
    expect(source).toContain('await headers()')
  })

  it('keeps SWR API cache provider out of the public root shell', () => {
    const rootSource = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8')

    expect(rootSource).not.toContain('ApiDataProvider')

    for (const pathname of [
      ['app', '(dashboard)', 'layout.tsx'],
      ['app', 'admin', 'layout.tsx'],
      ['app', 'professor', 'layout.tsx'],
      ['app', 'staff', 'layout.tsx'],
      ['app', 'studio-review', 'layout.tsx'],
    ]) {
      const source = readFileSync(join(process.cwd(), ...pathname), 'utf8')
      expect(source, pathname.join('/')).toContain('ApiDataProvider')
    }
  })

  it('defines production-shareable metadata instead of a bare title', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8')

    expect(source).toContain('metadataBase: siteUrl')
    expect(source).toContain("process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://kresco.ma'")
    expect(source).toContain("manifest: '/manifest.webmanifest'")
    expect(source).toContain("category: 'education'")
    expect(source).toContain("template: '%s - Kresco'")
    expect(source).toContain('openGraph: {')
    expect(source).toContain("locale: 'fr_MA'")
    expect(source).toContain('twitter: {')
    expect(source).toContain("card: 'summary_large_image'")
    expect(source).toContain('alternates: {')
    expect(source).toContain("canonical: '/'")
    expect(source).toContain("'kresco:release': releaseSha")
    expect(source).toContain('data-release={releaseSha}')
    expect(source).toContain('application/ld+json')
    expect(source).toContain("requestHeaders.get('x-nonce')")
    expect(source).toContain('nonce={nonce}')
    expect(source).toContain('suppressHydrationWarning')
    expect(source).toContain(".replace(/</g, '\\\\u003c')")
    expect(source).toContain('{siteStructuredData}')
    expect(source).not.toContain('dangerouslySetInnerHTML')
    expect(source).not.toContain("from 'next/script'")
    expect(source).not.toContain('unsafe-inline')
    expect(source).toContain('ClientErrorReporter')
  })

  it('publishes root social image dimensions and structured-data graph entities', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8')

    expect(source).toContain("url: new URL('/mascot/mascot.jpeg', siteOrigin).href")
    expect(source).toContain('width: 1124')
    expect(source).toContain('height: 1600')
    expect(source).toContain("type: 'image/jpeg'")
    expect(source).toContain("images: [siteImage]")
    expect(source).toContain("images: [{ url: siteImage.url, alt: siteImage.alt }]")
    expect(source).toContain("'@type': 'ImageObject'")
    expect(source).toContain("'@type': 'BreadcrumbList'")
    expect(source).toContain('primaryImageOfPage')
    expect(source).toContain('featureList')
    expect(source).toContain("audienceType: 'Moroccan Bac students'")
    expect(source).toContain(".replace(/</g, '\\\\u003c')")
  })
})
