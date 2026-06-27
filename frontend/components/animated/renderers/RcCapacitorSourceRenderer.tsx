'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import { lazySourceComponent } from './lazySourceComponent'

type RcComponentKey = 'simulator' | 'formulas' | 'exercises' | 'capacitor-association'

const components: Record<RcComponentKey, ComponentType> = {
  simulator: lazySourceComponent(() => import('../source-ports/rc/RCSimulator').then((mod) => mod.RCSimulator)),
  formulas: lazySourceComponent(() => import('../source-ports/rc/RCFormulas').then((mod) => mod.RCFormulas)),
  exercises: lazySourceComponent(() => import('../source-ports/rc/RCExercises').then((mod) => mod.RCExercises)),
  'capacitor-association': lazySourceComponent(() => import('../source-ports/rc/CapacitorAssociation').then((mod) => mod.CapacitorAssociation)),
}

function resolveComponentKey(props: AnimatedRendererProps): RcComponentKey {
  const config = props.config ?? props.tab?.config_json ?? {}
  const metadata = config.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)
    ? config.metadata
    : {}
  const raw = String(
    metadata.component ??
      metadata.source_component ??
      props.rendererKey ??
      props.config?.renderer_key ??
      props.tab?.renderer_key ??
      ''
  ).toLowerCase()

  if (raw.includes('formula')) return 'formulas'
  if (raw.includes('exercise')) return 'exercises'
  if (raw.includes('association') || raw.includes('capacitor')) return 'capacitor-association'
  return 'simulator'
}

export default function RcCapacitorSourceRenderer(props: AnimatedRendererProps) {
  const component = resolveComponentKey(props)
  const Component = components[component]

  return <Component />
}
