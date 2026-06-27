import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const rcSimulatorPath = join(
  process.cwd(),
  'components',
  'animated',
  'source-ports',
  'rc',
  'RCSimulator.tsx',
)

describe('RCSimulator source polish', () => {
  it('keeps playback, toggles, and sliders accessible and tactile', () => {
    const source = readFileSync(rcSimulatorPath, 'utf8')

    expect(source).toContain('useReducedMotion')
    expect(source).toContain('<AnimatePresence initial={false} mode="popLayout">')
    expect(source).toContain("scale: 0.25")
    expect(source).toContain("filter: 'blur(4px)'")
    expect(source).toContain("bounce: 0")
    expect(source).toContain("aria-label={isPlaying ? 'Mettre en pause' : 'Lancer la simulation'}")
    expect(source).toContain('aria-label="Reinitialiser la simulation"')
    expect(source).toContain('aria-pressed={isCharging}')
    expect(source).toContain('aria-pressed={showEnergy}')
    expect(source).toContain('active:scale-[0.96]')
    expect(source).toContain('focus-visible:ring-4')
    expect(source).toContain('motion-reduce:transition-none')
  })

  it('keeps range controls formally labelled with stable numeric readouts', () => {
    const source = readFileSync(rcSimulatorPath, 'utf8')

    for (const id of ['rc-resistance', 'rc-capacitance', 'rc-voltage', 'rc-time-range']) {
      expect(source).toContain(`htmlFor="${id}"`)
      expect(source).toContain(`id="${id}"`)
    }

    expect(source).toContain('tabular-nums')
  })

  it('avoids broad transitions and guards looping SVG animation', () => {
    const source = readFileSync(rcSimulatorPath, 'utf8')
    const animateLines = source
      .split(/\r?\n/)
      .filter((line) => line.includes('<animate'))

    expect(source).toContain('transition-[opacity]')
    expect(source).toContain('transition-[background-color,box-shadow,color,transform]')
    expect(source).not.toContain('transition-all')
    expect(source).not.toContain('transition-colors')
    expect(source).not.toContain('transition-opacity')
    expect(source).not.toContain('transition-transform')
    expect(source).not.toContain('hover:scale-105')
    expect(animateLines).toHaveLength(2)
    expect(source.match(/!shouldReduceMotion/g)).toHaveLength(2)
  })
})
