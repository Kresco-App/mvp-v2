'use client'

import { AnimatedContentRenderer } from './registry'

const sections = [
  {
    label: 'Electricity / RC',
    items: [
      { title: 'RCSimulator.tsx', rendererKey: 'rc_simulator', component: 'simulator' },
      { title: 'RCFormulas.tsx', rendererKey: 'rc_formulas', component: 'formulas' },
      { title: 'RCExercises.tsx', rendererKey: 'rc_exercises', component: 'exercises' },
      { title: 'CapacitorAssociation.tsx', rendererKey: 'capacitor_association', component: 'capacitor-association' },
    ],
  },
  {
    label: 'Nuclear / Radioactivity',
    items: [
      { title: 'AtomComposition.tsx', rendererKey: 'atom_composition', component: 'atom-composition' },
      { title: 'NucleusBuilder.tsx', rendererKey: 'nucleus_builder', component: 'nucleus-builder' },
      { title: 'IsotopeComparator.tsx', rendererKey: 'isotope_comparator', component: 'isotope-comparator' },
      { title: 'StabilityGraph.tsx', rendererKey: 'stability_graph', component: 'stability-graph' },
      { title: 'DecaySimulator.tsx', rendererKey: 'decay_simulator', component: 'decay-simulator' },
      { title: 'DecayLawGraph.tsx', rendererKey: 'decay_law_graph', component: 'decay-law-graph' },
      { title: 'DecayDiagrams.tsx', rendererKey: 'decay_diagrams', component: 'decay-diagrams' },
      { title: 'HalfLifeExplanation.tsx', rendererKey: 'half_life_explanation', component: 'half-life-explanation' },
      { title: 'FormulaSummary.tsx', rendererKey: 'formula_summary', component: 'formula-summary' },
      { title: 'ComprehensiveExercises.tsx', rendererKey: 'comprehensive_exercises', component: 'comprehensive-exercises' },
      { title: 'RadioactivityVisualizer.tsx', rendererKey: 'radioactivity_visualizer', component: 'radioactivity-visualizer' },
      { title: 'RadioactivityFormulas.tsx', rendererKey: 'radioactivity_formulas', component: 'radioactivity-formulas' },
      { title: 'RadioactivityExercises.tsx', rendererKey: 'radioactivity_exercises', component: 'radioactivity-exercises' },
      { title: 'TauDemonstration.tsx', rendererKey: 'tau_demonstration', component: 'tau-demonstration' },
      { title: 'SoddyLawDemonstrator.tsx', rendererKey: 'soddy_law_demonstrator', component: 'soddy-law-demonstrator' },
      { title: 'ParticleIdentificationMethod.tsx', rendererKey: 'particle_identification_method', component: 'particle-identification-method' },
      { title: 'MassEnergyScale.tsx', rendererKey: 'mass_energy_scale', component: 'mass-energy-scale' },
      { title: 'MassEnergyDemonstration.tsx', rendererKey: 'mass_energy_demonstration', component: 'mass-energy-demonstration' },
      { title: 'AstonCurve.tsx', rendererKey: 'aston_curve', component: 'aston-curve' },
      { title: 'FissionFusionAnimator.tsx', rendererKey: 'fission_fusion_animator', component: 'fission-fusion-animator' },
      { title: 'NuclearFormulas.tsx', rendererKey: 'nuclear_formulas', component: 'nuclear-formulas' },
      { title: 'NuclearExercises.tsx', rendererKey: 'nuclear_exercises', component: 'nuclear-exercises' },
      { title: 'NuclearAdvancedExercises.tsx', rendererKey: 'nuclear_advanced_exercises', component: 'nuclear-advanced-exercises' },
      { title: 'NucleusStabilityExplorer.tsx', rendererKey: 'nucleus_stability_explorer', component: 'nucleus-stability-explorer' },
    ],
  },
  {
    label: 'Waves',
    items: [
      { title: 'WaveSimulator.tsx', rendererKey: 'wave_source_simulator', component: 'wave-simulator' },
      { title: 'RopeWaveSimulator.tsx', rendererKey: 'rope_wave_simulator', component: 'rope-wave-simulator' },
      { title: 'SoundWaveSimulator.tsx', rendererKey: 'sound_wave_simulator', component: 'sound-wave-simulator' },
      { title: 'SuperpositionSimulator.tsx', rendererKey: 'superposition_simulator', component: 'superposition-simulator' },
      { title: 'TimeDelaySimulator.tsx', rendererKey: 'time_delay_simulator', component: 'time-delay-simulator' },
      { title: 'PeriodicWaveSimulator.tsx', rendererKey: 'periodic_wave_simulator', component: 'periodic-wave-simulator' },
      { title: 'StroboscopeSimulator.tsx', rendererKey: 'stroboscope_simulator', component: 'stroboscope-simulator' },
      { title: 'WaveLab.tsx', rendererKey: 'wave_lab', component: 'wave-lab' },
      { title: 'WaveExercises.tsx', rendererKey: 'wave_exercises_source', component: 'wave-exercises' },
      { title: 'WavePeriodicFormulas.tsx', rendererKey: 'wave_periodic_formulas', component: 'wave-periodic-formulas' },
      { title: 'WavePeriodicExercises.tsx', rendererKey: 'wave_periodic_exercises', component: 'wave-periodic-exercises' },
      { title: 'WaveAdvancedExercises.tsx', rendererKey: 'wave_advanced_exercises', component: 'wave-advanced-exercises' },
      { title: 'onde-lab / OndesCourseEmbed.tsx', rendererKey: 'onde_lab', component: 'onde-lab' },
    ],
  },
  {
    label: 'Light / Optics',
    items: [
      { title: 'LightDiffractionSimulator.tsx', rendererKey: 'light_diffraction_simulator', component: 'light-diffraction-simulator' },
      { title: 'DiffractionSimulator.tsx', rendererKey: 'diffraction_simulator', component: 'diffraction-simulator' },
      { title: 'DiffractionLab.tsx', rendererKey: 'diffraction_lab', component: 'diffraction-lab' },
      { title: 'PrismSimulator.tsx', rendererKey: 'prism_simulator', component: 'prism-simulator' },
      { title: 'LightFormulas.tsx', rendererKey: 'light_formulas', component: 'light-formulas' },
      { title: 'LightExercises.tsx', rendererKey: 'light_exercises', component: 'light-exercises' },
      { title: 'LightAdvancedExercises.tsx', rendererKey: 'light_advanced_exercises', component: 'light-advanced-exercises' },
      { title: 'light-lab / OpticsCourseEmbed.tsx', rendererKey: 'light_lab', component: 'light-lab' },
    ],
  },
  {
    label: 'Chemistry',
    items: [
      { title: 'KineticsCourse.tsx', rendererKey: 'kinetics_course', component: 'kinetics-course' },
      { title: 'ProgressTable.tsx', rendererKey: 'progress_table', component: 'progress-table' },
      { title: 'DistributionChart.tsx', rendererKey: 'distribution_chart', component: 'distribution-chart' },
      { title: 'PhScale.tsx', rendererKey: 'ph_scale', component: 'ph-scale' },
      { title: 'Predominance1D.tsx', rendererKey: 'predominance', component: 'predominance' },
      { title: 'TitrationCurve.tsx', rendererKey: 'titration_curve', component: 'titration-curve' },
      { title: 'IndicatorSimulator.tsx', rendererKey: 'indicator_simulator', component: 'indicator-simulator' },
      { title: 'InteractiveWater.tsx', rendererKey: 'interactive_water', component: 'interactive-water' },
      { title: 'ChimieFormulas.tsx', rendererKey: 'chimie_formulas', component: 'chimie-formulas' },
      { title: 'ChimieExercises.tsx', rendererKey: 'chimie_exercises', component: 'chimie-exercises' },
    ],
  },
  {
    label: 'Math',
    items: [
      { title: 'SetsInclusionAnimation.tsx', rendererKey: 'sets_inclusion_animation', component: 'sets-inclusion' },
      { title: 'VariationsAnimation.tsx', rendererKey: 'variations_animation', component: 'variations' },
      { title: 'PascalTriangleLab.tsx', rendererKey: 'pascal_triangle_lab', component: 'pascal-triangle-lab' },
      { title: 'PascalTriangleAnimation.tsx', rendererKey: 'pascal_triangle_animation', component: 'pascal-triangle-animation' },
      { title: 'FunctionExplorer.tsx', rendererKey: 'function_explorer', component: 'function-explorer' },
      { title: 'math-sets-lab / MathSetsPage.tsx', rendererKey: 'math_sets_page', component: 'math-sets-page' },
    ],
  },
]

export default function AnimatedShowcaseSimpleClient() {
  return (
    <main className="min-h-screen bg-[#f7fbfd] px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <h1 className="m-0 text-2xl font-black text-[#1f2933]">Animated component showcase</h1>
        </div>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.label} className="space-y-6">
              <h2 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[#1292cf]">
                {section.label}
              </h2>
              {section.items.map((item) => (
                <div key={item.rendererKey}>
                  <h3 className="mb-3 text-base font-black text-[#1f2933]">{item.title}</h3>
                  <AnimatedContentRenderer
                    rendererKey={item.rendererKey}
                    config={{
                      renderer_key: item.rendererKey,
                      metadata: { component: item.component },
                    }}
                  />
                </div>
              ))}
            </section>
          ))}

          <section className="space-y-6">
            <h2 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[#1292cf]">
              Nuclear
            </h2>
            <div>
              <h3 className="mb-3 text-base font-black text-[#1f2933]">NucleusCompositionRenderer.tsx</h3>
              <AnimatedContentRenderer
                rendererKey="nucleus_composition"
                config={{
                  renderer_key: 'nucleus_composition',
                  title: 'Composition du noyau',
                  subtitle: 'Protons, neutrons et notation nucleaire',
                  description: 'Interactive nuclear composition component used by lesson video tabs.',
                  metadata: {
                    nucleus: {
                      symbol: 'C',
                      protons: 6,
                      neutrons: 8,
                    },
                  },
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
