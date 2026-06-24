import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../app/manifest'
import robots from '../app/robots'
import sitemap from '../app/sitemap'

const APP_ROOT = join(process.cwd(), 'app')

const metadataLayouts = [
  ['(dashboard)', 'calendar', 'layout.tsx'],
  ['(dashboard)', 'courses', 'layout.tsx'],
  ['(dashboard)', 'exam', '[subjectId]', 'layout.tsx'],
  ['(dashboard)', 'exam-bank', 'layout.tsx'],
  ['(dashboard)', 'home', 'layout.tsx'],
  ['(dashboard)', 'live', 'layout.tsx'],
  ['(dashboard)', 'professor-chat', 'layout.tsx'],
  ['(dashboard)', 'profile', 'layout.tsx'],
  ['pricing', 'layout.tsx'],
  ['professor', 'layout.tsx'],
  ['professor', 'changes', 'layout.tsx'],
  ['professor', 'chat', 'layout.tsx'],
  ['professor', 'live', 'layout.tsx'],
  ['professor', 'login', 'layout.tsx'],
]

describe('route metadata ownership', () => {
  it('does not set browser titles from client effects in app routes', () => {
    for (const sourcePath of appSourceFiles(APP_ROOT)) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).not.toContain('document.title')
    }
  })

  it('defines metadata from route layouts for migrated client pages', () => {
    for (const segments of metadataLayouts) {
      const layoutPath = join(APP_ROOT, ...segments)
      const source = readFileSync(layoutPath, 'utf8')

      expect(existsSync(layoutPath), layoutPath).toBe(true)
      expect(source, layoutPath).toContain('export const metadata')
      expect(source, layoutPath).toContain('title:')
      expect(source, layoutPath).toContain('description:')
    }
  })

  it('publishes crawlability metadata routes for audit tools', () => {
    for (const filename of ['robots.ts', 'sitemap.ts', 'manifest.ts']) {
      expect(existsSync(join(APP_ROOT, filename)), filename).toBe(true)
    }
  })

  it('exports valid crawlability metadata without sitemap and robots conflicts', () => {
    const expectedOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kresco.ma').origin
    const robotsMetadata = robots()
    const sitemapMetadata = sitemap()
    const manifestMetadata = manifest()

    expect(robotsMetadata.host).toBe(expectedOrigin)
    expect(robotsMetadata.sitemap).toBe(`${expectedOrigin}/sitemap.xml`)
    expect(manifestMetadata.name).toBe('Kresco - Plateforme E-Learning')
    expect(manifestMetadata.start_url).toBe('/')
    expect(manifestMetadata.display).toBe('standalone')

    expect(sitemapMetadata.map((entry) => new URL(entry.url).pathname)).toEqual(['/', '/pricing'])
    for (const entry of sitemapMetadata) {
      expect(new URL(entry.url).origin).toBe(expectedOrigin)
      expect(entry.lastModified).toBeInstanceOf(Date)
      expect(entry.priority).toBeGreaterThan(0)
      expect(entry.priority).toBeLessThanOrEqual(1)
    }

    const disallowedPaths = robotsRules(robotsMetadata).flatMap((rule) => stringList(rule.disallow))
    for (const entry of sitemapMetadata) {
      const path = new URL(entry.url).pathname

      for (const disallowedPath of disallowedPaths) {
        expect(isPathDisallowed(path, disallowedPath), `${path} should not be blocked by ${disallowedPath}`).toBe(
          false,
        )
      }
    }
  })
})

function robotsRules(metadata: ReturnType<typeof robots>) {
  return Array.isArray(metadata.rules) ? metadata.rules : [metadata.rules]
}

function stringList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function isPathDisallowed(path: string, disallowedPath: string) {
  return path === disallowedPath || path.startsWith(`${disallowedPath}/`)
}

function appSourceFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const absolute = join(root, entry.name)
    if (entry.isDirectory()) return appSourceFiles(absolute)
    if (!entry.isFile() || !absolute.endsWith('.tsx')) return []
    return [absolute]
  })
}
