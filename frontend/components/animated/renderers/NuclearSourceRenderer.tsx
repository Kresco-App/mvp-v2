'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import { SettingsProvider } from '../source-ports/nuclear/context/SettingsContext'
import { lazySourceComponent } from './lazySourceComponent'

type NuclearComponentKey =
  | 'atom-composition'
  | 'nucleus-builder'
  | 'isotope-comparator'
  | 'stability-graph'
  | 'decay-simulator'
  | 'decay-law-graph'
  | 'decay-diagrams'
  | 'half-life-explanation'
  | 'formula-summary'
  | 'comprehensive-exercises'
  | 'radioactivity-visualizer'
  | 'radioactivity-formulas'
  | 'radioactivity-exercises'
  | 'tau-demonstration'
  | 'soddy-law-demonstrator'
  | 'particle-identification-method'
  | 'mass-energy-scale'
  | 'mass-energy-demonstration'
  | 'aston-curve'
  | 'fission-fusion-animator'
  | 'nuclear-formulas'
  | 'nuclear-exercises'
  | 'nuclear-advanced-exercises'
  | 'nucleus-stability-explorer'

const components: Record<NuclearComponentKey, ComponentType<any>> = {
  'atom-composition': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/AtomComposition').then((mod) => mod.AtomComposition)),
  'nucleus-builder': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/NucleusBuilder').then((mod) => mod.NucleusBuilder)),
  'isotope-comparator': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/IsotopeComparator').then((mod) => mod.IsotopeComparator)),
  'stability-graph': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/StabilityGraph').then((mod) => mod.StabilityGraph)),
  'decay-simulator': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/DecaySimulator').then((mod) => mod.DecaySimulator)),
  'decay-law-graph': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/DecayLawGraph').then((mod) => mod.DecayLawGraph)),
  'decay-diagrams': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/DecayDiagrams').then((mod) => mod.DecayDiagrams)),
  'half-life-explanation': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/HalfLifeExplanation').then((mod) => mod.HalfLifeExplanation)),
  'formula-summary': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/FormulaSummary').then((mod) => mod.FormulaSummary)),
  'comprehensive-exercises': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/ComprehensiveExercises').then((mod) => mod.ComprehensiveExercises)),
  'radioactivity-visualizer': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/RadioactivityVisualizer').then((mod) => mod.RadioactivityVisualizer)),
  'radioactivity-formulas': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/RadioactivityFormulas').then((mod) => mod.RadioactivityFormulas)),
  'radioactivity-exercises': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/RadioactivityExercises').then((mod) => mod.RadioactivityExercises)),
  'tau-demonstration': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/TauDemonstration').then((mod) => mod.TauDemonstration)),
  'soddy-law-demonstrator': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/SoddyLawDemonstrator').then((mod) => mod.SoddyLawDemonstrator)),
  'particle-identification-method': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/ParticleIdentificationMethod').then((mod) => mod.ParticleIdentificationMethod)),
  'mass-energy-scale': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/MassEnergyScale').then((mod) => mod.MassEnergyScale)),
  'mass-energy-demonstration': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/MassEnergyDemonstration').then((mod) => mod.MassEnergyDemonstration)),
  'aston-curve': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/AstonCurve').then((mod) => mod.AstonCurve)),
  'fission-fusion-animator': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/FissionFusionAnimator').then((mod) => mod.FissionFusionAnimator)),
  'nuclear-formulas': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/NuclearFormulas').then((mod) => mod.NuclearFormulas)),
  'nuclear-exercises': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/NuclearExercises').then((mod) => mod.NuclearExercises)),
  'nuclear-advanced-exercises': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/NuclearAdvancedExercises').then((mod) => mod.NuclearAdvancedExercises)),
  'nucleus-stability-explorer': lazySourceComponent(() => import('../source-ports/nuclear/components/interactive/NucleusStabilityExplorer').then((mod) => mod.NucleusStabilityExplorer)),
}

const rendererAliases: Record<string, NuclearComponentKey> = {
  atom_composition: 'atom-composition',
  atomcomposition: 'atom-composition',
  nucleus_builder: 'nucleus-builder',
  nucleusbuilder: 'nucleus-builder',
  isotope_comparator: 'isotope-comparator',
  isotopecomparator: 'isotope-comparator',
  stability_graph: 'stability-graph',
  stabilitygraph: 'stability-graph',
  decay_simulator: 'decay-simulator',
  decaysimulator: 'decay-simulator',
  decay_law_graph: 'decay-law-graph',
  decaylawgraph: 'decay-law-graph',
  decay_diagrams: 'decay-diagrams',
  decaydiagrams: 'decay-diagrams',
  half_life_explanation: 'half-life-explanation',
  halflifeexplanation: 'half-life-explanation',
  formula_summary: 'formula-summary',
  formulasummary: 'formula-summary',
  comprehensive_exercises: 'comprehensive-exercises',
  comprehensiveexercises: 'comprehensive-exercises',
  radioactivity_visualizer: 'radioactivity-visualizer',
  radioactivityvisualizer: 'radioactivity-visualizer',
  radioactivity_formulas: 'radioactivity-formulas',
  radioactivityformulas: 'radioactivity-formulas',
  radioactivity_exercises: 'radioactivity-exercises',
  radioactivityexercises: 'radioactivity-exercises',
  tau_demonstration: 'tau-demonstration',
  taudemonstration: 'tau-demonstration',
  soddy_law_demonstrator: 'soddy-law-demonstrator',
  soddy_law: 'soddy-law-demonstrator',
  soddylawdemonstrator: 'soddy-law-demonstrator',
  particle_identification_method: 'particle-identification-method',
  particleidentificationmethod: 'particle-identification-method',
  mass_energy_scale: 'mass-energy-scale',
  massenergyscale: 'mass-energy-scale',
  mass_energy_demonstration: 'mass-energy-demonstration',
  massenergydemonstration: 'mass-energy-demonstration',
  aston_curve: 'aston-curve',
  astoncurve: 'aston-curve',
  fission_fusion_animator: 'fission-fusion-animator',
  fissionfusionanimator: 'fission-fusion-animator',
  nuclear_formulas: 'nuclear-formulas',
  nuclearformulas: 'nuclear-formulas',
  nuclear_exercises: 'nuclear-exercises',
  nuclearexercises: 'nuclear-exercises',
  nuclear_advanced_exercises: 'nuclear-advanced-exercises',
  nuclearadvancedexercises: 'nuclear-advanced-exercises',
  nucleus_stability_explorer: 'nucleus-stability-explorer',
  nucleusstabilityexplorer: 'nucleus-stability-explorer',
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

function resolveComponentKey(props: AnimatedRendererProps): NuclearComponentKey {
  const metadata = metadataFromConfig(props)
  const raw = normalizeKey(
    metadata.component ??
      metadata.source_component ??
      props.rendererKey ??
      props.config?.renderer_key ??
      props.tab?.renderer_key
  )

  return rendererAliases[raw] ?? 'atom-composition'
}

export default function NuclearSourceRenderer(props: AnimatedRendererProps) {
  const componentKey = resolveComponentKey(props)
  const Component = components[componentKey]
  const metadata = metadataFromConfig(props)
  const sourceProps = componentKey === 'decay-simulator'
    ? { type: metadata.type ?? 'alpha' }
    : componentKey === 'decay-diagrams'
      ? { type: metadata.type ?? 'alpha' }
    : {}
  const content = <Component {...sourceProps} />

  return componentKey === 'nuclear-exercises' ? <SettingsProvider>{content}</SettingsProvider> : content
}
