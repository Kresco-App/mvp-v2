'use client'

import type { AnimatedRendererProps } from '../types'
import {
  CapacitorAssociation,
  RCExercises,
  RCFormulas,
  RCSimulator,
} from '../source-ports/rc'

type RcComponentKey = 'simulator' | 'formulas' | 'exercises' | 'capacitor-association'

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

  if (component === 'formulas') return <RCFormulas />
  if (component === 'exercises') return <RCExercises />
  if (component === 'capacitor-association') return <CapacitorAssociation />

  return <RCSimulator />
}
