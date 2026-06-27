import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const atomCompositionPath = join(
  process.cwd(),
  'components',
  'animated',
  'source-ports',
  'nuclear',
  'components',
  'interactive',
  'AtomComposition.tsx',
)

describe('AtomComposition source polish', () => {
  it('keeps simulator controls touchable, accessible, and reduced-motion safe', () => {
    const source = readFileSync(atomCompositionPath, 'utf8')

    expect(source).toContain('useReducedMotion')
    expect(source).toContain('layout={!shouldReduceMotion}')
    expect(source).toContain('motion-reduce:animate-none')
    expect(source).toContain('h-10 w-10')
    expect(source).toContain('active:scale-[0.96]')
    expect(source).toContain('aria-label="Diminuer les protons"')
    expect(source).toContain('aria-label="Augmenter les neutrons"')
    expect(source).not.toContain('w-8 h-8 flex items-center justify-center bg-purple-50')
    expect(source).not.toContain('transition-colors border border-purple-100 touch-manipulation')
  })
})
