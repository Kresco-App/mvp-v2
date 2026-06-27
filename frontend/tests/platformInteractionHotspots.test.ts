import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const roots = [join(process.cwd(), 'app'), join(process.cwd(), 'components')]
const skippedSegments = new Set(['node_modules', '.next'])
const skippedPaths = [join('components', 'animated', 'source-ports')]

const collectTsxFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    const relativePath = relative(process.cwd(), fullPath)

    if (entry.isDirectory()) {
      if (skippedSegments.has(entry.name)) {
        return []
      }
      if (skippedPaths.some((path) => relativePath.startsWith(path))) {
        return []
      }
      return collectTsxFiles(fullPath)
    }

    return entry.isFile() && entry.name.endsWith('.tsx') ? [fullPath] : []
  })

const riskyNonSkeletonPatterns = [
  'transition-all',
  'transition-colors',
  'transition-opacity',
  'transition-transform',
  'active:scale-95',
  'active:scale-90',
  'hover:scale-105',
  'focus:ring-2',
  'focus-visible:ring-2',
  'animate-bounce',
  'animate-pulse',
]

describe('platform interaction hotspots', () => {
  it('keeps non-skeleton app and component surfaces free of broad interaction shorthands', () => {
    const offenders = roots.flatMap((root) =>
      collectTsxFiles(root).flatMap((filePath) => {
        const source = readFileSync(filePath, 'utf8')

        return riskyNonSkeletonPatterns
          .filter((pattern) => source.includes(pattern))
          .map((pattern) => `${relative(process.cwd(), filePath)}: ${pattern}`)
      }),
    )

    expect(offenders).toEqual([])
  })
})
