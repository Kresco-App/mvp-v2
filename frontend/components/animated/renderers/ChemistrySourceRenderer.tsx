'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import { lazySourceComponent } from './lazySourceComponent'

type ChemistryComponentKey =
  | 'kinetics-course'
  | 'progress-table'
  | 'distribution-chart'
  | 'ph-scale'
  | 'predominance'
  | 'titration-curve'
  | 'indicator-simulator'
  | 'interactive-water'
  | 'chimie-formulas'
  | 'chimie-exercises'

const components: Record<ChemistryComponentKey, ComponentType> = {
  'kinetics-course': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/chemistry/KineticsCourse').then((mod) => mod.KineticsCourse)),
  'progress-table': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/ProgressTable').then((mod) => mod.ProgressTable)),
  'distribution-chart': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/DistributionChart').then((mod) => mod.DistributionChart)),
  'ph-scale': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/PhScale').then((mod) => mod.PHScale)),
  predominance: lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/Predominance1D').then((mod) => mod.Predominance1D)),
  'titration-curve': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/TitrationCurve').then((mod) => mod.TitrationCurve)),
  'indicator-simulator': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/IndicatorSimulator').then((mod) => mod.IndicatorSimulator)),
  'interactive-water': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/InteractiveWater').then((mod) => mod.InteractiveWater)),
  'chimie-formulas': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/ChimieFormulas').then((mod) => mod.ChimieFormulas)),
  'chimie-exercises': lazySourceComponent(() => import('../source-ports/chemistry/components/interactive/ChimieExercises').then((mod) => mod.ChimieExercises)),
}

const aliases: Record<string, ChemistryComponentKey> = {
  kinetics_course: 'kinetics-course',
  kineticscourse: 'kinetics-course',
  progress_table: 'progress-table',
  progresstable: 'progress-table',
  distribution_chart: 'distribution-chart',
  distributionchart: 'distribution-chart',
  ph_scale: 'ph-scale',
  phscale: 'ph-scale',
  predominance: 'predominance',
  predominance_1d: 'predominance',
  predominance1d: 'predominance',
  titration_curve: 'titration-curve',
  titrationcurve: 'titration-curve',
  indicator_simulator: 'indicator-simulator',
  indicatorsimulator: 'indicator-simulator',
  interactive_water: 'interactive-water',
  interactivewater: 'interactive-water',
  chimie_formulas: 'chimie-formulas',
  chimieformulas: 'chimie-formulas',
  chimie_exercises: 'chimie-exercises',
  chimieexercises: 'chimie-exercises',
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

function resolveComponentKey(props: AnimatedRendererProps): ChemistryComponentKey {
  const metadata = metadataFromConfig(props)
  const raw = normalizeKey(metadata.component ?? metadata.source_component ?? props.rendererKey ?? props.config?.renderer_key ?? props.tab?.renderer_key)
  return aliases[raw] ?? 'kinetics-course'
}

export default function ChemistrySourceRenderer(props: AnimatedRendererProps) {
  const Component = components[resolveComponentKey(props)]
  return <Component />
}
