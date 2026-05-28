'use client'

import type { ComponentType } from 'react'
import type { AnimatedRendererProps } from '../types'
import {
  AstonCurve,
  AtomComposition,
  ComprehensiveExercises,
  DecayLawGraph,
  DecayDiagrams,
  DecaySimulator,
  FissionFusionAnimator,
  FormulaSummary,
  HalfLifeExplanation,
  IsotopeComparator,
  MassEnergyDemonstration,
  MassEnergyScale,
  NuclearExercises,
  NuclearAdvancedExercises,
  NuclearFormulas,
  NucleusBuilder,
  NucleusStabilityExplorer,
  ParticleIdentificationMethod,
  RadioactivityExercises,
  RadioactivityFormulas,
  RadioactivityVisualizer,
  SoddyLawDemonstrator,
  StabilityGraph,
  TauDemonstration,
} from '../source-ports/nuclear'
import { SettingsProvider } from '../source-ports/nuclear/context/SettingsContext'

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
  'atom-composition': AtomComposition,
  'nucleus-builder': NucleusBuilder,
  'isotope-comparator': IsotopeComparator,
  'stability-graph': StabilityGraph,
  'decay-simulator': DecaySimulator,
  'decay-law-graph': DecayLawGraph,
  'decay-diagrams': DecayDiagrams,
  'half-life-explanation': HalfLifeExplanation,
  'formula-summary': FormulaSummary,
  'comprehensive-exercises': ComprehensiveExercises,
  'radioactivity-visualizer': RadioactivityVisualizer,
  'radioactivity-formulas': RadioactivityFormulas,
  'radioactivity-exercises': RadioactivityExercises,
  'tau-demonstration': TauDemonstration,
  'soddy-law-demonstrator': SoddyLawDemonstrator,
  'particle-identification-method': ParticleIdentificationMethod,
  'mass-energy-scale': MassEnergyScale,
  'mass-energy-demonstration': MassEnergyDemonstration,
  'aston-curve': AstonCurve,
  'fission-fusion-animator': FissionFusionAnimator,
  'nuclear-formulas': NuclearFormulas,
  'nuclear-exercises': NuclearExercises,
  'nuclear-advanced-exercises': NuclearAdvancedExercises,
  'nucleus-stability-explorer': NucleusStabilityExplorer,
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

  return (
    <SettingsProvider>
      <Component {...sourceProps} />
    </SettingsProvider>
  )
}
