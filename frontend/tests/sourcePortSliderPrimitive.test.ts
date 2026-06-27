import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sliderPaths = [
  join(process.cwd(), 'components', 'animated', 'source-ports', 'waves', 'course', 'components', 'ui', 'Slider.tsx'),
  join(process.cwd(), 'components', 'animated', 'source-ports', 'optics', 'course', 'components', 'ui', 'Slider.tsx'),
]

describe('source-port slider primitive polish', () => {
  for (const sliderPath of sliderPaths) {
    it(`${sliderPath.split(/[\\/]/).slice(-6).join('/')} keeps a tactile accessible thumb`, () => {
      const source = readFileSync(sliderPath, 'utf8')

      expect(source).toContain('min-h-10')
      expect(source).toContain('transition-[background-color,border-color,box-shadow,transform]')
      expect(source).toContain('after:-inset-2.5')
      expect(source).toContain('active:scale-[0.96]')
      expect(source).toContain('focus-visible:ring-4')
      expect(source).toContain('motion-reduce:transition-none')
      expect(source).not.toContain('transition-colors')
      expect(source).not.toContain('focus-visible:ring-2')
    })
  }
})
