import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})

function appSourceFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const absolute = join(root, entry.name)
    if (entry.isDirectory()) return appSourceFiles(absolute)
    if (!entry.isFile() || !absolute.endsWith('.tsx')) return []
    return [absolute]
  })
}
