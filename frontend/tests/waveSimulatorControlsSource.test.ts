import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const interactivePath = (...segments: string[]) =>
  join(
    process.cwd(),
    'components',
    'animated',
    'source-ports',
    'waves',
    'course',
    'components',
    'interactive',
    ...segments,
  )

const simulatorFiles = [
  { name: 'RopeWaveSimulator', path: interactivePath('RopeWaveSimulator.tsx') },
  { name: 'SoundWaveSimulator', path: interactivePath('SoundWaveSimulator.tsx') },
  { name: 'SuperpositionSimulator', path: interactivePath('SuperpositionSimulator.tsx') },
  { name: 'TimeDelaySimulator', path: interactivePath('TimeDelaySimulator.tsx') },
]

describe('wave simulator control polish', () => {
  for (const simulator of simulatorFiles) {
    it(`${simulator.name} uses explicit tactile control transitions`, () => {
      const source = readFileSync(simulator.path, 'utf8')

      expect(source).toContain('active:scale-[0.96]')
      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('motion-reduce:transition-none')
      expect(source).toContain('aria-pressed={isPlaying}')
      expect(source).toContain('aria-label="Reinitialiser')
      expect(source).not.toContain('transition-all')
      expect(source).not.toContain('transition-colors')
      expect(source).not.toContain('transition-opacity')
      expect(source).not.toContain('transition-transform')
    })
  }

  it('keeps wave range inputs labelled and numeric readouts stable', () => {
    const labelledControlIds = [
      ['RopeWaveSimulator.tsx', ['rope-amplitude', 'rope-frequency', 'rope-tension', 'rope-damping']],
      ['SoundWaveSimulator.tsx', ['sound-frequency', 'sound-amplitude']],
      ['TimeDelaySimulator.tsx', ['time-delay-distance', 'time-delay-speed']],
    ] as const

    for (const [fileName, ids] of labelledControlIds) {
      const source = readFileSync(interactivePath(fileName), 'utf8')

      for (const id of ids) {
        expect(source).toContain(`htmlFor="${id}"`)
        expect(source).toContain(`id="${id}"`)
      }

      expect(source).toContain('tabular-nums')
    }
  })

  it('keeps superposition mode choices announced as pressed toggles', () => {
    const source = readFileSync(interactivePath('SuperpositionSimulator.tsx'), 'utf8')

    expect(source).toContain("aria-pressed={mode === 'constructive'}")
    expect(source).toContain("aria-pressed={mode === 'destructive'}")
    expect(source).toContain('transition-[background-color,border-color,box-shadow,color,transform]')
  })

  it('keeps periodic wave play and view controls accessible and tactile', () => {
    const source = readFileSync(interactivePath('PeriodicWaveSimulator.tsx'), 'utf8')

    expect(source).toContain("aria-label={isPlaying ? \"Mettre en pause\" : \"Lancer l'onde\"}")
    expect(source).toContain('aria-pressed={isPlaying}')
    expect(source).toContain("aria-pressed={viewMode === 'spatial'}")
    expect(source).toContain("aria-pressed={viewMode === 'temporal'}")
    expect(source).toContain('aria-label="Frequence"')
    expect(source).toContain('aria-label="Longueur d\'onde"')
    expect(source).toContain('tabular-nums')
    expect(source).toContain('active:scale-[0.96]')
    expect(source).toContain('focus-visible:ring-4')
    expect(source).toContain('motion-reduce:transition-none')
    expect(source).not.toContain('transition-all')
  })

  it('keeps stroboscope presets and sliders labelled without broad transitions', () => {
    const source = readFileSync(interactivePath('StroboscopeSimulator.tsx'), 'utf8')

    for (const id of ['strobe-speed', 'strobe-real-frequency', 'strobe-flash-frequency']) {
      expect(source).toContain(`htmlFor="${id}"`)
      expect(source).toContain(`id="${id}"`)
    }

    expect(source).toContain('const presetButtonClass')
    expect(source).toContain('active:scale-[0.96]')
    expect(source).toContain('focus-visible:ring-4')
    expect(source).toContain('motion-reduce:transition-none')
    expect(source).toContain('tabular-nums')
    expect(source).not.toContain('transition-colors')
    expect(source).not.toContain('transition-all')
  })
})
