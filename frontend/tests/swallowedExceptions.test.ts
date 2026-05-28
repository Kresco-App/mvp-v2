import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'


const AUDITED_FILES = [
  'app/admin/courses/page.tsx',
  'components/Leaderboard.tsx',
  'components/VideoQuizOverlay.tsx',
  'app/page.tsx',
  'app/(dashboard)/home/[subjectId]/page.tsx',
]


function readFrontendFile(pathname: string) {
  return readFileSync(resolve(process.cwd(), pathname), 'utf8')
}


describe('frontend error handling regressions', () => {
  it('does not silently swallow API failures in audited production surfaces', () => {
    for (const pathname of AUDITED_FILES) {
      const source = readFrontendFile(pathname)

      expect(source, pathname).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/)
      expect(source, pathname).not.toMatch(/catch\s*\{\s*\}/)
      expect(source, pathname).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*null\s*\)/)
      expect(source, pathname).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*\(\{[^)]*\}\)\s*\)/)
    }
  })
})
