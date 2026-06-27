import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n?/g, '\n')
}

describe('animated renderer performance', () => {
  it('keeps the nucleus composition lesson off framer-motion while preserving lazy loading', () => {
    const rendererSource = source('components', 'animated', 'renderers', 'NucleusCompositionRenderer.tsx')
    const registrySource = source('components', 'animated', 'registry.tsx')

    expect(rendererSource).not.toContain('framer-motion')
    expect(rendererSource).not.toContain('<motion')
    expect(rendererSource).not.toContain('motion.')
    expect(rendererSource).toContain('motion-safe:animate-[spin_44s_linear_infinite]')
    expect(rendererSource).toContain("transition-[opacity,transform]")
    expect(rendererSource).toContain('transform: `translate3d(${particle.x}px, ${particle.y}px, 0)`')

    expect(registrySource).toContain("const NucleusCompositionRenderer = lazyRenderer(() => import('./renderers/NucleusCompositionRenderer'))")
    expect(registrySource).toContain('nucleus_composition: adaptAnimatedRenderer(NucleusCompositionRenderer)')
  })

  it('keeps source-port lessons split by selected interactive component', () => {
    const rendererFiles = [
      ['ChemistrySourceRenderer.tsx', "from '../source-ports/chemistry'"],
      ['MathSourceRenderer.tsx', "from '../source-ports/math'"],
      ['NuclearSourceRenderer.tsx', "from '../source-ports/nuclear'"],
      ['OpticsSourceRenderer.tsx', "from '../source-ports/optics'"],
      ['RcCapacitorSourceRenderer.tsx', "from '../source-ports/rc'"],
      ['WaveSourceRenderer.tsx', "from '../source-ports/waves'"],
    ] as const

    for (const [fileName, barrelImport] of rendererFiles) {
      const rendererSource = source('components', 'animated', 'renderers', fileName)

      expect(rendererSource).toContain('lazySourceComponent')
      expect(rendererSource).toContain("import('../source-ports/")
      expect(rendererSource).not.toContain(barrelImport)
    }
  })

  it('keeps nuclear settings storage off non-exercise interactives', () => {
    const rendererSource = source('components', 'animated', 'renderers', 'NuclearSourceRenderer.tsx')

    expect(rendererSource).toContain("componentKey === 'nuclear-exercises'")
    expect(rendererSource).toContain('<SettingsProvider>{content}</SettingsProvider>')
  })

  it('keeps Math Sets theme storage off standalone math interactives', () => {
    const rendererSource = source('components', 'animated', 'renderers', 'MathSourceRenderer.tsx')

    expect(rendererSource).toContain("componentKey === 'function-explorer'")
    expect(rendererSource).toContain('<MathSetsThemeProvider>{content}</MathSetsThemeProvider>')
  })

  it('keeps Course content rendering split from the animated registry until component blocks render', () => {
    const courseRendererSource = source('components', 'topic-workspace', 'CourseContentRenderer.tsx')

    expect(courseRendererSource).not.toContain('import { AnimatedContentRenderer }')
    expect(courseRendererSource).not.toContain("from '@/components/animated/registry'")
    expect(courseRendererSource).toContain("import('@/components/animated/registry')")
    expect(courseRendererSource).toContain('DeferredAnimatedContentRenderer')
  })

  it('defers offscreen Course document blocks before mounting rich lesson content', () => {
    const courseRendererSource = source('components', 'topic-workspace', 'CourseContentRenderer.tsx')

    expect(courseRendererSource).toContain("import { useNearViewport } from '@/hooks/useNearViewport'")
    expect(courseRendererSource).toContain('const EAGER_COURSE_BLOCK_COUNT = 4')
    expect(courseRendererSource).toContain('const CourseBlockFrame = memo(function CourseBlockFrame')
    expect(courseRendererSource).toContain('useNearViewport<HTMLDivElement>({ rootMargin: COURSE_BLOCK_ROOT_MARGIN })')
    expect(courseRendererSource).toContain('data-course-block-placeholder')
    expect(courseRendererSource).toContain('[content-visibility:auto] [contain-intrinsic-size:auto_240px]')
  })

  it('caches repeated Course inline math parsing across renders', () => {
    const courseRendererSource = source('components', 'topic-workspace', 'CourseContentRenderer.tsx')

    expect(courseRendererSource).toContain('const INLINE_MATH_PARTS_CACHE_MAX = 256')
    expect(courseRendererSource).toContain('const inlineMathPartsCache = new Map<string, InlineMathPart[]>()')
    expect(courseRendererSource).toContain('const cached = inlineMathPartsCache.get(text)')
    expect(courseRendererSource).toContain('if (cached) return cached')
    expect(courseRendererSource).toContain('inlineMathPartsCache.delete(first)')
  })

  it('keeps shared formula cards off framer-motion', () => {
    const formulaCardSource = source('components', 'animated', 'shared', 'FormulaCard.tsx')

    expect(formulaCardSource).not.toContain('framer-motion')
    expect(formulaCardSource).not.toContain('<motion')
    expect(formulaCardSource).toContain('motion-safe:animate-[fadeIn_360ms_ease-out]')
  })

  it('caches shared KaTeX formula rendering across repeated mounts', () => {
    const latexSource = source('components', 'animated', 'shared', 'Latex.tsx')

    expect(latexSource).toContain('const LATEX_RENDER_CACHE_MAX = 512')
    expect(latexSource).toContain('const latexRenderCache = new Map<string, LatexRenderResult>()')
    expect(latexSource).toContain('export const Latex: React.FC<LatexProps> = React.memo(function Latex')
    expect(latexSource).toContain('const cached = latexRenderCache.get(cacheKey)')
    expect(latexSource).toContain('katex.renderToString(formula')
    expect(latexSource).toContain('containerRef.current.innerHTML = result.html')
    expect(latexSource).not.toContain('katex.render(formula')
  })
})
