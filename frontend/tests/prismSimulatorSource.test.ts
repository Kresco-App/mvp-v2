import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
const prismSimulatorPath = join(
  root,
  'components',
  'animated',
  'source-ports',
  'optics',
  'course',
  'components',
  'interactive',
  'PrismSimulator.tsx',
)

const sourcePortPath = (...segments: string[]) =>
  join(root, 'components', 'animated', 'source-ports', ...segments)

const opticsLabPolishFiles = [
  sourcePortPath('optics', 'light-lab', 'pages', 'GeometricOpticsPage.tsx'),
  sourcePortPath('optics', 'light-lab', 'pages', 'PrismPage.tsx'),
  sourcePortPath('optics', 'light-lab', 'components', 'LabLayout.tsx'),
  sourcePortPath('optics', 'light-lab', 'components', 'EmbeddedLabCard.tsx'),
  sourcePortPath('optics', 'course', 'components', 'interactive', 'DiffractionSimulator.tsx'),
  sourcePortPath('optics', 'course', 'components', 'interactive', 'labs', 'DiffractionLab.tsx'),
]

const opticsInteractiveControlFiles = [
  sourcePortPath('optics', 'light-lab', 'pages', 'GeometricOpticsPage.tsx'),
  sourcePortPath('optics', 'light-lab', 'pages', 'PrismPage.tsx'),
  sourcePortPath('optics', 'light-lab', 'components', 'LabLayout.tsx'),
  sourcePortPath('optics', 'course', 'components', 'interactive', 'DiffractionSimulator.tsx'),
]

describe('PrismSimulator state model', () => {
  it('does not mirror slider state through synchronization effects', () => {
    const source = readFileSync(prismSimulatorPath, 'utf8')

    expect(source).not.toContain('localIncidentAngle')
    expect(source).not.toContain('localPrismAngle')
    expect(source).not.toContain('setLocalIncidentAngle')
    expect(source).not.toContain('setLocalPrismAngle')
    expect(source).not.toContain('setLocalIncidentAngle(incidentAngle)')
    expect(source).not.toContain('setLocalPrismAngle(prismAngle)')
  })
})

describe('optics lab interaction polish', () => {
  for (const filePath of opticsLabPolishFiles) {
    it(`${filePath.split(/[\\/]/).slice(-2).join('/')} avoids broad transition shorthands`, () => {
      const source = readFileSync(filePath, 'utf8')

      expect(source).toContain('motion-reduce:transition-none')
      expect(source).not.toContain('transition-colors')
      expect(source).not.toContain('transition-transform')
      expect(source).not.toContain('transition-opacity')
      expect(source).not.toContain('focus:ring-2')
      expect(source).not.toContain('active:scale-95')
    })
  }

  for (const filePath of opticsInteractiveControlFiles) {
    it(`${filePath.split(/[\\/]/).slice(-2).join('/')} has crisp focus and press feedback`, () => {
      const source = readFileSync(filePath, 'utf8')

      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('active:scale-[0.96]')
    })
  }

  it('light-lab angle toggles expose pressed state and explicit switch motion', () => {
    const geometricSource = readFileSync(
      sourcePortPath('optics', 'light-lab', 'pages', 'GeometricOpticsPage.tsx'),
      'utf8',
    )
    const prismSource = readFileSync(
      sourcePortPath('optics', 'light-lab', 'pages', 'PrismPage.tsx'),
      'utf8',
    )

    for (const source of [geometricSource, prismSource]) {
      expect(source).toContain('aria-pressed={showAngles}')
      expect(source).toContain('setShowAngles((visible) => !visible)')
      expect(source).toContain('transition-[transform]')
    }
  })

  it('LabLayout exposes navigation and theme state to assistive tech', () => {
    const source = readFileSync(
      sourcePortPath('optics', 'light-lab', 'components', 'LabLayout.tsx'),
      'utf8',
    )

    expect(source).toContain("aria-pressed={currentPage === 'optics'}")
    expect(source).toContain("aria-pressed={currentPage === 'diffraction'}")
    expect(source).toContain("aria-pressed={currentPage === 'prism'}")
    expect(source).toContain("aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}")
  })
})
