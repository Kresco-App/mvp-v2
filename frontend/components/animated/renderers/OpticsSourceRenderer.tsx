'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import { ThemeProvider as LightLabThemeProvider } from '../source-ports/optics/light-lab/context/ThemeContext'
import { lazySourceComponent } from './lazySourceComponent'

type OpticsComponentKey =
  | 'light-diffraction-simulator'
  | 'diffraction-simulator'
  | 'diffraction-lab'
  | 'prism-simulator'
  | 'light-formulas'
  | 'light-exercises'
  | 'light-advanced-exercises'
  | 'light-lab'

const components: Record<Exclude<OpticsComponentKey, 'light-lab'>, ComponentType> = {
  'light-diffraction-simulator': lazySourceComponent(() => import('../source-ports/optics/course/components/interactive/LightDiffractionSimulator').then((mod) => mod.LightDiffractionSimulator)),
  'diffraction-simulator': lazySourceComponent(() => import('../source-ports/optics/course/components/interactive/DiffractionSimulator').then((mod) => mod.DiffractionSimulator)),
  'diffraction-lab': lazySourceComponent(() => import('../source-ports/optics/course/components/interactive/labs/DiffractionLab').then((mod) => mod.DiffractionLab)),
  'prism-simulator': lazySourceComponent(() => import('../source-ports/optics/course/components/interactive/PrismSimulator').then((mod) => mod.PrismSimulator)),
  'light-formulas': lazySourceComponent(() => import('../source-ports/optics/course/components/interactive/LightFormulas').then((mod) => mod.LightFormulas)),
  'light-exercises': lazySourceComponent(() => import('../source-ports/optics/course/components/interactive/LightExercises').then((mod) => mod.LightExercises)),
  'light-advanced-exercises': lazySourceComponent(() => import('../source-ports/optics/course/components/interactive/advanced/LightAdvancedExercises').then((mod) => mod.LightAdvancedExercises)),
}

const OpticsCourseEmbed = lazySourceComponent(
  () => import('../source-ports/optics/light-lab/components/OpticsCourseEmbed').then((mod) => mod.default),
)

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
