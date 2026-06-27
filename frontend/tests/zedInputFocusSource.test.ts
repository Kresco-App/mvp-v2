import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const zedPath = (fileName: string) => join(process.cwd(), 'components', 'zed', fileName)

const zedInputFiles = [
  zedPath('ScientificCalculator.tsx'),
  zedPath('ZedModeOverlay.tsx'),
  zedPath('PdfViewerCore.tsx'),
  zedPath('FormulaLibrary.tsx'),
]

describe('Zed input focus polish', () => {
  for (const filePath of zedInputFiles) {
    it(`${filePath.split(/[\\/]/).pop()} uses focus-visible rings for form controls`, () => {
      const source = readFileSync(filePath, 'utf8')

      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('motion-reduce:transition-none')
      expect(source).not.toContain('focus:ring-2')
    })
  }

  it('ScientificCalculator applies the stronger focus ring to every visible input/select control', () => {
    const source = readFileSync(zedPath('ScientificCalculator.tsx'), 'utf8')
    const visibleControlCount = (source.match(/<(input|select)\b/g) ?? []).length
    const focusVisibleCount = (source.match(/focus-visible:ring-4/g) ?? []).length

    expect(focusVisibleCount).toBeGreaterThanOrEqual(visibleControlCount)
  })
})
