import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const chemistryPath = (fileName: string) =>
  join(
    process.cwd(),
    'components',
    'animated',
    'source-ports',
    'chemistry',
    'components',
    'interactive',
    fileName,
  )

describe('chemistry simulator interaction polish', () => {
  it('InteractiveWater keeps playback controls tactile, named, and reduced-motion aware', () => {
    const source = readFileSync(chemistryPath('InteractiveWater.tsx'), 'utf8')

    expect(source).toContain('useReducedMotion')
    expect(source).toContain('isPlaying && !shouldReduceMotion')
    expect(source).toContain('aria-label="Rejouer le transfert de proton"')
    expect(source).toContain('aria-pressed={isPlaying}')
    expect(source).toContain('active:scale-[0.96]')
    expect(source).toContain('focus-visible:ring-4')
    expect(source).toContain('motion-reduce:transition-none')
    expect(source).not.toContain('transition-all')
    expect(source).not.toContain('active:scale-95')
  })

  it('PHScale keeps pH changes stable and reduced-motion safe', () => {
    const source = readFileSync(chemistryPath('PhScale.tsx'), 'utf8')

    expect(source).toContain('useReducedMotion')
    expect(source).toContain('transition={barTransition}')
    expect(source).toContain('aria-label="pH"')
    expect(source).toContain('focus-within:ring-4')
    expect(source).toContain('tabular-nums')
    expect(source).toContain('motion-reduce:transition-none')
    expect(source).not.toContain('transition-colors')
    expect(source).not.toContain('transition-all')
    expect(source).not.toContain('hover:scale-105')
  })

  it('IndicatorSimulator labels controls and avoids broad motion shorthands', () => {
    const source = readFileSync(chemistryPath('IndicatorSimulator.tsx'), 'utf8')

    expect(source).toContain('useReducedMotion')
    expect(source).toContain('transition={quickTransition}')
    expect(source).toContain('htmlFor="indicator-ph"')
    expect(source).toContain('id="indicator-ph"')
    expect(source).toContain('focus-visible:ring-4')
    expect(source).toContain('tabular-nums')
    expect(source).toContain('motion-reduce:transition-none')
    expect(source).not.toContain('transition-colors')
    expect(source).not.toContain('transition-all')
    expect(source).not.toContain('focus:ring-2')
  })
})
