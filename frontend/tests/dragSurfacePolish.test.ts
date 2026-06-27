import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const FRONTEND_ROOT = fileURLToPath(new URL('../', import.meta.url))

function readFrontendFile(...segments: string[]) {
  return readFileSync(join(FRONTEND_ROOT, ...segments), 'utf8')
}

describe('drag surface interaction polish', () => {
  it('excludes drag surfaces from global hover and active transforms', () => {
    const css = readFrontendFile('app', 'globals.css')

    expect(css).toContain('.kresco-drag-surface')
    expect(css).toContain('[data-kresco-drag-surface="true"]')
    expect(css).toContain('[data-kresco-drag-surface="true"]:active')
    expect(css).toContain('transform: none;')
  })

  it.each([
    ['native drag-and-drop activity', 'components', 'activities', 'DragAndDrop.tsx'],
    ['ordering activity', 'components', 'activities', 'Ordering.tsx'],
    ['quiz primitive drag renderer', 'components', 'quiz', 'QuizPrimitiveRenderers.tsx'],
    ['professor studio sort handle', 'components', 'professor', 'studio', 'SortableShell.tsx'],
  ])('marks the %s as a precision drag surface', (_label, ...pathSegments) => {
    const source = readFrontendFile(...pathSegments)

    expect(source).toContain('data-kresco-drag-surface="true"')
    expect(source).toContain('kresco-drag-surface')
  })

  it('keeps professor studio drag handles large, focusable, and calm', () => {
    const source = readFrontendFile('components', 'professor', 'studio', 'SortableShell.tsx')

    expect(source).toContain('const studioDragHandleClass')
    expect(source).toContain('h-10 w-10')
    expect(source).toContain('focus-visible:ring-4')
    expect(source).toContain('motion-reduce:transition-none')
    expect(source).not.toContain('active:scale-')
  })
})
