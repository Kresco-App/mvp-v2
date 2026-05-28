import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
const rendererPath = join(root, 'components', 'activities', 'InteractiveActivityRenderer.tsx')

describe('InteractiveActivityRenderer lazy loading', () => {
  it('lazy-loads standard activities and keeps explicit loading and error states', () => {
    const source = readFileSync(rendererPath, 'utf8')

    expect(source).toContain("const TrueFalse = lazy(() => import('./TrueFalse'))")
    expect(source).toContain("const Matching = lazy(() => import('./Matching'))")
    expect(source).toContain("const FillInBlank = lazy(() => import('./FillInBlank'))")
    expect(source).toContain("const Ordering = lazy(() => import('./Ordering'))")
    expect(source).toContain("const DragAndDrop = lazy(() => import('./DragAndDrop'))")
    expect(source).toContain('function ActivityLoadingState')
    expect(source).toContain('class ActivityErrorBoundary')
    expect(source).not.toContain("import TrueFalse from './TrueFalse'")
    expect(source).not.toContain("import Matching from './Matching'")
    expect(source).not.toContain("import FillInBlank from './FillInBlank'")
    expect(source).not.toContain("import Ordering from './Ordering'")
    expect(source).not.toContain("import DragAndDrop from './DragAndDrop'")
  })
})
