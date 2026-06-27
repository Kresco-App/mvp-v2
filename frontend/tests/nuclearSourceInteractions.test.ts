import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sourcePath = (fileName: string) =>
  join(
    process.cwd(),
    'components',
    'animated',
    'source-ports',
    'nuclear',
    'components',
    'interactive',
    fileName,
  )

const sourceFiles = [
  { name: 'NucleusBuilder', path: sourcePath('NucleusBuilder.tsx') },
  { name: 'NucleusStabilityExplorer', path: sourcePath('NucleusStabilityExplorer.tsx') },
]

const compactControlSourceFiles = [
  { name: 'DecayLawGraph', path: sourcePath('DecayLawGraph.tsx') },
  { name: 'HalfLifeExplanation', path: sourcePath('HalfLifeExplanation.tsx') },
  { name: 'RadioactivityVisualizer', path: sourcePath('RadioactivityVisualizer.tsx') },
]

const motionHeavySourceFiles = [
  { name: 'DecaySimulator', path: sourcePath('DecaySimulator.tsx') },
  { name: 'SoddyLawDemonstrator', path: sourcePath('SoddyLawDemonstrator.tsx') },
  { name: 'IsotopeComparator', path: sourcePath('IsotopeComparator.tsx') },
]

describe('nuclear source interaction polish', () => {
  for (const sourceFile of sourceFiles) {
    it(`${sourceFile.name} keeps controls accessible and reduced-motion safe`, () => {
      const source = readFileSync(sourceFile.path, 'utf8')
      const spinLines = source
        .split(/\r?\n/)
        .filter((line) => line.includes('animate-[spin'))

      expect(source).toContain('useReducedMotion')
      expect(source).toContain('aria-label="Protons"')
      expect(source).toContain('aria-label="Neutrons"')
      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('tabular-nums')
      expect(source).toContain('motion-reduce:transition-none')
      expect(spinLines.length).toBeGreaterThan(0)
      expect(spinLines.every((line) => line.includes('motion-reduce:animate-none'))).toBe(true)
      expect(source).not.toContain('transition-colors')
    })
  }

  it('NucleusBuilder disables layout and particle motion for reduced-motion users', () => {
    const source = readFileSync(sourcePath('NucleusBuilder.tsx'), 'utf8')

    expect(source).toContain('layout={!shouldReduceMotion}')
    expect(source).toContain('<AnimatePresence initial={false} mode="popLayout">')
    expect(source).toContain('transition={particleTransition}')
  })

  it('NucleusStabilityExplorer glides the current graph point without forcing motion', () => {
    const source = readFileSync(sourcePath('NucleusStabilityExplorer.tsx'), 'utf8')

    expect(source).toContain('const graphTransition = shouldReduceMotion ? { duration: 0 }')
    expect(source).toContain('const currentPoint = { x: plotX(protons), y: plotY(neutrons) }')
    expect(source).toContain('<motion.circle')
    expect(source).toContain('transition={graphTransition}')
  })

  for (const sourceFile of compactControlSourceFiles) {
    it(`${sourceFile.name} keeps compact controls crisp and motion-safe`, () => {
      const source = readFileSync(sourceFile.path, 'utf8')

      expect(source).toContain('useReducedMotion')
      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('motion-reduce:transition-none')
      expect(source).toContain('active:scale-[0.96]')
      expect(source).not.toContain('transition-all')
      expect(source).not.toContain('transition-colors')
      expect(source).not.toContain('transition-opacity')
      expect(source).not.toContain('transition-transform')
      expect(source).not.toContain('active:scale-95')
      expect(source).not.toContain('active:scale-90')
    })
  }

  it('DecayLawGraph labels the half-life slider and reset control', () => {
    const source = readFileSync(sourcePath('DecayLawGraph.tsx'), 'utf8')

    expect(source).toContain('aria-pressed={isPlaying}')
    expect(source).toContain('aria-label="Reinitialiser la simulation de decroissance"')
    expect(source).toContain('htmlFor="decay-half-life"')
    expect(source).toContain('id="decay-half-life"')
    expect(source).toContain('const dotTransition = shouldReduceMotion ? { duration: 0 }')
    expect(source).toContain('transition={dotTransition}')
    expect(source).toContain('tabular-nums')
  })

  it('HalfLifeExplanation uses reduced-motion transitions for particles and the gauge', () => {
    const source = readFileSync(sourcePath('HalfLifeExplanation.tsx'), 'utf8')

    expect(source).toContain('const gaugeTransition = shouldReduceMotion')
    expect(source).toContain('transition={gaugeTransition}')
    expect(source).toContain("transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.35")
    expect(source).toContain('aria-label="Reinitialiser la demi-vie"')
    expect(source).toContain('disabled:active:scale-100')
    expect(source).toContain('tabular-nums')
  })

  it('RadioactivityVisualizer avoids replay motion for reduced-motion users', () => {
    const source = readFileSync(sourcePath('RadioactivityVisualizer.tsx'), 'utf8')

    expect(source).toContain('aria-pressed={activeType === t.id}')
    expect(source).toContain("aria-label=\"Rejouer l'emission radioactive\"")
    expect(source).toContain('const emissionTransition = shouldReduceMotion ? { duration: 0 }')
    expect(source).toContain('opacity: shouldReduceMotion ? 1 : [0, 1, 1, 0]')
    expect(source).toContain('transition={emissionTransition}')
  })

  for (const sourceFile of motionHeavySourceFiles) {
    it(`${sourceFile.name} keeps motion-heavy transitions controlled`, () => {
      const source = readFileSync(sourceFile.path, 'utf8')

      expect(source).toContain('useReducedMotion')
      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('motion-reduce:transition-none')
      expect(source).toContain('active:scale-[0.96]')
      expect(source).toContain('tabular-nums')
      expect(source).not.toContain('transition-all')
      expect(source).not.toContain('transition-colors')
      expect(source).not.toContain('transition-opacity')
      expect(source).not.toContain('transition-transform')
      expect(source).not.toContain('active:scale-95')
      expect(source).not.toContain('active:scale-90')
    })
  }

  it('DecaySimulator makes emission paths instant for reduced-motion users', () => {
    const source = readFileSync(sourcePath('DecaySimulator.tsx'), 'utf8')

    expect(source).toContain("aria-label={status === 'initial' ? 'Lancer la simulation de decroissance'")
    expect(source).toContain('layout={!shouldReduceMotion}')
    expect(source).toContain('const emissionTransition = shouldReduceMotion ? { duration: 0 }')
    expect(source).toContain("rotate: shouldReduceMotion ? 0 : 360")
    expect(source).toContain("x: shouldReduceMotion ? '75%' : '120%'")
  })

  it('SoddyLawDemonstrator keeps example navigation accessible and motion-safe', () => {
    const source = readFileSync(sourcePath('SoddyLawDemonstrator.tsx'), 'utf8')

    expect(source).toContain('aria-label="Exemple precedent"')
    expect(source).toContain('aria-label="Exemple suivant"')
    expect(source).toContain('aria-pressed={disintegrated}')
    expect(source).toContain('const daughterTransition = shouldReduceMotion ? { duration: 0 }')
    expect(source).toContain('if (shouldReduceMotion)')
  })

  it('IsotopeComparator disables layout motion while preserving selected state', () => {
    const source = readFileSync(sourcePath('IsotopeComparator.tsx'), 'utf8')

    expect(source).toContain('aria-pressed={activeIsotope === iso}')
    expect(source).toContain('layout={!shouldReduceMotion}')
    expect(source).toContain('const springTransition = shouldReduceMotion ? { duration: 0 }')
    expect(source).toContain('transition={particleTransition}')
  })
})
