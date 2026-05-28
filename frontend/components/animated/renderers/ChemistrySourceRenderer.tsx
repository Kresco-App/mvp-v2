'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import {
  ChimieExercises,
  ChimieFormulas,
  DistributionChart,
  IndicatorSimulator,
  InteractiveWater,
  KineticsCourse,
  PHScale,
  Predominance1D,
  ProgressTable,
  TitrationCurve,
} from '../source-ports/chemistry'

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

const components: Record<ChemistryComponentKey, ComponentType<any>> = {
  'kinetics-course': KineticsCourse,
  'progress-table': ProgressTable,
  'distribution-chart': DistributionChart,
  'ph-scale': PHScale,
  predominance: Predominance1D,
  'titration-curve': TitrationCurve,
  'indicator-simulator': IndicatorSimulator,
  'interactive-water': InteractiveWater,
  'chimie-formulas': ChimieFormulas,
  'chimie-exercises': ChimieExercises,
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
