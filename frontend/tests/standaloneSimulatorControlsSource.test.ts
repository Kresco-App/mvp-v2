import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
const simulatorPath = (...segments: string[]) => join(root, 'components', 'simulators', ...segments)

const simulatorFiles = [
  simulatorPath('PrismSimulator.tsx'),
  simulatorPath('DescartesBasicsSimulator.tsx'),
  simulatorPath('WaveSimulator.tsx'),
]

describe('standalone simulator control polish', () => {
  for (const filePath of simulatorFiles) {
    it(`${filePath.split(/[\\/]/).at(-1)} keeps simulator controls tactile and motion-safe`, () => {
      const source = readFileSync(filePath, 'utf8')

      expect(source).toMatch(/min-h-10|h-10 w-10/)
      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('active:scale-[0.96]')
      expect(source).toContain('motion-reduce:transition-none')
      expect(source).not.toContain('text-slate-400 hover:text-slate-400')
      expect(source).not.toContain('focus-visible:ring-2')
    })
  }

  it('exposes simulator toggle state to assistive technology', () => {
    const prismSource = readFileSync(simulatorPath('PrismSimulator.tsx'), 'utf8')
    const descartesSource = readFileSync(simulatorPath('DescartesBasicsSimulator.tsx'), 'utf8')
    const waveSource = readFileSync(simulatorPath('WaveSimulator.tsx'), 'utf8')

    expect(prismSource).toContain("aria-pressed={sourceMode === 'white'}")
    expect(prismSource).toContain("aria-pressed={sourceMode === 'single'}")
    expect(prismSource).toContain("aria-pressed={sourceMode === 'double'}")
    expect(prismSource).toContain('aria-pressed={showAngles}')
    expect(descartesSource).toContain('aria-pressed={showAngles}')
    expect(waveSource).toContain('aria-pressed={isPlaying}')
  })
})
