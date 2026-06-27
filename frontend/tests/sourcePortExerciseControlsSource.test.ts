import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sourcePath = (...segments: string[]) =>
  join(process.cwd(), 'components', 'animated', 'source-ports', ...segments)

const exerciseControlFiles = [
  sourcePath('rc', 'RCExercises.tsx'),
  sourcePath('chemistry', 'components', 'interactive', 'ChimieExercises.tsx'),
  sourcePath('waves', 'course', 'components', 'interactive', 'WaveExercises.tsx'),
  sourcePath('waves', 'course', 'components', 'interactive', 'WavePeriodicExercises.tsx'),
  sourcePath('optics', 'course', 'components', 'interactive', 'LightExercises.tsx'),
  sourcePath('optics', 'course', 'components', 'interactive', 'advanced', 'LightAdvancedExercises.tsx'),
  sourcePath('nuclear', 'components', 'interactive', 'RadioactivityExercises.tsx'),
  sourcePath('nuclear', 'components', 'interactive', 'ComprehensiveExercises.tsx'),
  sourcePath('nuclear', 'components', 'interactive', 'NuclearExercises.tsx'),
]

const exerciseInputFiles = [
  sourcePath('rc', 'RCExercises.tsx'),
  sourcePath('chemistry', 'components', 'interactive', 'ChimieExercises.tsx'),
  sourcePath('waves', 'course', 'components', 'interactive', 'WaveExercises.tsx'),
  sourcePath('optics', 'course', 'components', 'interactive', 'advanced', 'LightAdvancedExercises.tsx'),
  sourcePath('nuclear', 'components', 'interactive', 'RadioactivityExercises.tsx'),
  sourcePath('nuclear', 'components', 'interactive', 'ComprehensiveExercises.tsx'),
  sourcePath('nuclear', 'components', 'interactive', 'NuclearExercises.tsx'),
]

const riskyTransitionPatterns = [
  'transition-all',
  'transition-colors',
  'transition-opacity',
  'transition-transform',
  'active:scale-95',
  'active:scale-90',
  'focus:ring-2',
]

describe('source-port exercise controls', () => {
  for (const filePath of exerciseControlFiles) {
    it(`${filePath.split(/[\\/]/).slice(-2).join('/')} uses explicit micro-interactions`, () => {
      const source = readFileSync(filePath, 'utf8')

      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('active:scale-[0.96]')
      expect(source).toContain('motion-reduce:transition-none')
      for (const pattern of riskyTransitionPatterns) {
        expect(source).not.toContain(pattern)
      }
    })
  }

  for (const filePath of exerciseInputFiles) {
    it(`${filePath.split(/[\\/]/).slice(-2).join('/')} keeps numeric inputs stable`, () => {
      const source = readFileSync(filePath, 'utf8')

      expect(source).toContain('tabular-nums')
      expect(source).toContain('border-color')
      expect(source).toContain('box-shadow')
      expect(source).toContain('focus-visible:ring-4')
    })
  }

  it('ChimieExercises disables the incorrect-answer shake for reduced-motion users', () => {
    const source = readFileSync(
      sourcePath('chemistry', 'components', 'interactive', 'ChimieExercises.tsx'),
      'utf8',
    )

    expect(source).toContain('useReducedMotion')
    expect(source).toContain("status === 'incorrect' && !shouldReduceMotion")
    expect(source).toContain('transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3 }}')
  })

  it('WaveExercises labels compact icon controls', () => {
    const source = readFileSync(
      sourcePath('waves', 'course', 'components', 'interactive', 'WaveExercises.tsx'),
      'utf8',
    )

    expect(source).toContain("aria-pressed={gameState === 'running'}")
    expect(source).toContain("aria-label=\"Reinitialiser l'exercice\"")
  })
})
