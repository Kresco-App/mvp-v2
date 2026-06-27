'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import { ThemeProvider as OndeLabThemeProvider } from '../source-ports/waves/onde-lab/context/ThemeContext'
import { lazySourceComponent } from './lazySourceComponent'

type WaveComponentKey =
  | 'wave-simulator'
  | 'rope-wave-simulator'
  | 'sound-wave-simulator'
  | 'superposition-simulator'
  | 'time-delay-simulator'
  | 'periodic-wave-simulator'
  | 'stroboscope-simulator'
  | 'wave-lab'
  | 'wave-exercises'
  | 'wave-periodic-formulas'
  | 'wave-periodic-exercises'
  | 'wave-advanced-exercises'
  | 'onde-lab'

const components: Record<Exclude<WaveComponentKey, 'onde-lab'>, ComponentType> = {
  'wave-simulator': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/WaveSimulator').then((mod) => mod.WaveSimulator)),
  'rope-wave-simulator': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/RopeWaveSimulator').then((mod) => mod.RopeWaveSimulator)),
  'sound-wave-simulator': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/SoundWaveSimulator').then((mod) => mod.SoundWaveSimulator)),
  'superposition-simulator': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/SuperpositionSimulator').then((mod) => mod.SuperpositionSimulator)),
  'time-delay-simulator': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/TimeDelaySimulator').then((mod) => mod.TimeDelaySimulator)),
  'periodic-wave-simulator': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/PeriodicWaveSimulator').then((mod) => mod.PeriodicWaveSimulator)),
  'stroboscope-simulator': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/StroboscopeSimulator').then((mod) => mod.StroboscopeSimulator)),
  'wave-lab': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/labs/WaveLab').then((mod) => mod.WaveLab)),
  'wave-exercises': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/WaveExercises').then((mod) => mod.WaveExercises)),
  'wave-periodic-formulas': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/WavePeriodicFormulas').then((mod) => mod.WavePeriodicFormulas)),
  'wave-periodic-exercises': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/WavePeriodicExercises').then((mod) => mod.WavePeriodicExercises)),
  'wave-advanced-exercises': lazySourceComponent(() => import('../source-ports/waves/course/components/interactive/advanced/WaveAdvancedExercises').then((mod) => mod.WaveAdvancedExercises)),
}

const OndesCourseEmbed = lazySourceComponent(
  () => import('../source-ports/waves/onde-lab/components/OndesCourseEmbed').then((mod) => mod.default),
)

const aliases: Record<string, WaveComponentKey> = {
  wave_simulator: 'wave-simulator',
  wavesimulator: 'wave-simulator',
  rope_wave_simulator: 'rope-wave-simulator',
  ropewavesimulator: 'rope-wave-simulator',
  sound_wave_simulator: 'sound-wave-simulator',
  soundwavesimulator: 'sound-wave-simulator',
  superposition_simulator: 'superposition-simulator',
  superpositionsimulator: 'superposition-simulator',
  time_delay_simulator: 'time-delay-simulator',
  timedelaysimulator: 'time-delay-simulator',
  periodic_wave_simulator: 'periodic-wave-simulator',
  periodicwavesimulator: 'periodic-wave-simulator',
  stroboscope_simulator: 'stroboscope-simulator',
  stroboscopesimulator: 'stroboscope-simulator',
  wave_lab: 'wave-lab',
  wavelab: 'wave-lab',
  wave_exercises: 'wave-exercises',
  waveexercises: 'wave-exercises',
  wave_periodic_formulas: 'wave-periodic-formulas',
  waveperiodicformulas: 'wave-periodic-formulas',
  wave_periodic_exercises: 'wave-periodic-exercises',
  waveperiodicexercises: 'wave-periodic-exercises',
  wave_advanced_exercises: 'wave-advanced-exercises',
  waveadvancedexercises: 'wave-advanced-exercises',
  onde_lab: 'onde-lab',
  ondelab: 'onde-lab',
  onde_lab_embed: 'onde-lab',
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

function resolveComponentKey(props: AnimatedRendererProps): WaveComponentKey {
  const metadata = metadataFromConfig(props)
  const raw = normalizeKey(
    metadata.component ??
      metadata.source_component ??
      props.rendererKey ??
      props.config?.renderer_key ??
      props.tab?.renderer_key
  )

  return aliases[raw] ?? 'wave-simulator'
}

export default function WaveSourceRenderer(props: AnimatedRendererProps) {
  const componentKey = resolveComponentKey(props)

  if (componentKey === 'onde-lab') {
    return (
      <OndeLabThemeProvider>
        <OndesCourseEmbed modules={['single']} />
      </OndeLabThemeProvider>
    )
  }

  const Component = components[componentKey]
  return <Component />
}
