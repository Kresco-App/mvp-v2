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
