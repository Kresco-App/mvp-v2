import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sourcePortRoot = join(process.cwd(), 'components', 'animated', 'source-ports')

const collectTsxFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectTsxFiles(fullPath)
    }

    return entry.isFile() && entry.name.endsWith('.tsx') ? [fullPath] : []
  })

const riskyInteractionPatterns = [
  'transition-all',
  'transition-colors',
  'transition-opacity',
  'transition-transform',
  'active:scale-95',
  'active:scale-90',
  'hover:scale-105',
  'focus:ring-2',
  'animate-bounce',
  'animate-pulse',
]

describe('source-port interaction hotspots', () => {
  it('keeps source-port TSX files free of broad transitions and generic motion shorthands', () => {
    const offenders = collectTsxFiles(sourcePortRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')

      return riskyInteractionPatterns
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${filePath}: ${pattern}`)
    })

    expect(offenders).toEqual([])
  })
})
