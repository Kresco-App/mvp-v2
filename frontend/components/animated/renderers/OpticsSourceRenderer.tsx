'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import {
  DiffractionLab,
  DiffractionSimulator,
  LightAdvancedExercises,
  LightDiffractionSimulator,
  LightExercises,
  LightFormulas,
  LightLabThemeProvider,
  OpticsCourseEmbed,
  PrismSimulator,
} from '../source-ports/optics'

type OpticsComponentKey =
  | 'light-diffraction-simulator'
  | 'diffraction-simulator'
  | 'diffraction-lab'
  | 'prism-simulator'
  | 'light-formulas'
  | 'light-exercises'
  | 'light-advanced-exercises'
  | 'light-lab'

const components: Record<Exclude<OpticsComponentKey, 'light-lab'>, ComponentType<any>> = {
  'light-diffraction-simulator': LightDiffractionSimulator,
  'diffraction-simulator': DiffractionSimulator,
  'diffraction-lab': DiffractionLab,
  'prism-simulator': PrismSimulator,
  'light-formulas': LightFormulas,
  'light-exercises': LightExercises,
  'light-advanced-exercises': LightAdvancedExercises,
}

const aliases: Record<string, OpticsComponentKey> = {
  light_diffraction_simulator: 'light-diffraction-simulator',
  lightdiffractionsimulator: 'light-diffraction-simulator',
  diffraction_simulator: 'diffraction-simulator',
  diffractionsimulator: 'diffraction-simulator',
  diffraction_lab: 'diffraction-lab',
  diffractionlab: 'diffraction-lab',
  prism_simulator: 'prism-simulator',
  prismsimulator: 'prism-simulator',
  light_formulas: 'light-formulas',
  lightformulas: 'light-formulas',
  light_exercises: 'light-exercises',
  lightexercises: 'light-exercises',
  light_advanced_exercises: 'light-advanced-exercises',
  lightadvancedexercises: 'light-advanced-exercises',
  light_lab: 'light-lab',
  lightlab: 'light-lab',
  optics_lab: 'light-lab',
  optics_course_embed: 'light-lab',
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

function resolveComponentKey(props: AnimatedRendererProps): OpticsComponentKey {
  const metadata = metadataFromConfig(props)
  const raw = normalizeKey(metadata.component ?? metadata.source_component ?? props.rendererKey ?? props.config?.renderer_key ?? props.tab?.renderer_key)
  return aliases[raw] ?? 'light-diffraction-simulator'
}

export default function OpticsSourceRenderer(props: AnimatedRendererProps) {
  const componentKey = resolveComponentKey(props)

  if (componentKey === 'light-lab') {
    return (
      <LightLabThemeProvider>
        <OpticsCourseEmbed modules={['diffraction']} />
      </LightLabThemeProvider>
    )
  }

  const Component = components[componentKey]
  return <Component />
}
