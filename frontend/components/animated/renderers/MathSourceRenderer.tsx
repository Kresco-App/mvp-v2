'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import { ThemeProvider as MathSetsThemeProvider } from '../source-ports/math/math-sets-lab/context/ThemeContext'
import { lazySourceComponent } from './lazySourceComponent'

type MathComponentKey =
  | 'sets-inclusion'
  | 'variations'
  | 'pascal-triangle-lab'
  | 'pascal-triangle-animation'
  | 'function-explorer'
  | 'math-sets-page'

const components: Record<Exclude<MathComponentKey, 'math-sets-page'>, ComponentType> = {
  'sets-inclusion': lazySourceComponent(() => import('../source-ports/math/math-sets-lab/components/SetsInclusionAnimation').then((mod) => mod.default)),
  variations: lazySourceComponent(() => import('../source-ports/math/math-sets-lab/components/VariationsAnimation').then((mod) => mod.default)),
  'pascal-triangle-lab': lazySourceComponent(() => import('../source-ports/math/math-sets-lab/math/PascalTriangleLab').then((mod) => mod.default)),
  'pascal-triangle-animation': lazySourceComponent(() => import('../source-ports/math/math-sets-lab/components/PascalTriangleAnimation').then((mod) => mod.default)),
  'function-explorer': lazySourceComponent(() => import('../source-ports/math/course/components/math/FunctionExplorer').then((mod) => mod.FunctionExplorer)),
}

const MathSetsPage = lazySourceComponent(
  () => import('../source-ports/math/math-sets-lab/pages/MathSetsPage').then((mod) => mod.default),
)

const aliases: Record<string, MathComponentKey> = {
  sets_inclusion: 'sets-inclusion',
  setsinclusion: 'sets-inclusion',
  sets_inclusion_animation: 'sets-inclusion',
  setsinclusionanimation: 'sets-inclusion',
  variations: 'variations',
  variations_animation: 'variations',
  variationsanimation: 'variations',
  pascal_triangle_lab: 'pascal-triangle-lab',
  pascaltrianglelab: 'pascal-triangle-lab',
  pascal_triangle_animation: 'pascal-triangle-animation',
  pascaltriangleanimation: 'pascal-triangle-animation',
  function_explorer: 'function-explorer',
  functionexplorer: 'function-explorer',
  math_sets_page: 'math-sets-page',
  mathsetspage: 'math-sets-page',
}

function metadataFromConfig(props: AnimatedRendererProps) {
  const config = props.config ?? props.tab?.config_json ?? {}
  return config.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)
    ? config.metadata
    : {}
}

function normalizeKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_')
}

function resolveComponentKey(props: AnimatedRendererProps): MathComponentKey {
  const metadata = metadataFromConfig(props)
  const raw = normalizeKey(metadata.component ?? metadata.source_component ?? props.rendererKey ?? props.config?.renderer_key ?? props.tab?.renderer_key)
  return aliases[raw] ?? 'sets-inclusion'
}

export default function MathSourceRenderer(props: AnimatedRendererProps) {
  const componentKey = resolveComponentKey(props)

  if (componentKey === 'math-sets-page') {
    return (
      <MathSetsThemeProvider>
        <MathSetsPage onNavigate={() => undefined} initialMode="inclusion" />
      </MathSetsThemeProvider>
    )
  }

  const Component = components[componentKey]
  const content = <Component />

  return componentKey === 'function-explorer' ? content : <MathSetsThemeProvider>{content}</MathSetsThemeProvider>
}
