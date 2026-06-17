// Curated catalog of simulators a professor can drop into a Lab/Simulator tab.
// Each `key` is a `renderer_key` understood by `components/animated/registry.tsx`;
// selecting an entry writes that key onto the tab. `params` describes a small
// form of common settings persisted into the tab's `config_json`.

export type SimulatorCategory = 'Optique' | 'Ondes' | 'Électricité' | 'Nucléaire' | 'Chimie' | 'Maths'

export type SimulatorParam =
  | { key: string; label: string; type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string }
  | { key: string; label: string; type: 'text'; default: string }
  | { key: string; label: string; type: 'select'; default: string; options: { value: string; label: string }[] }

export type SimulatorEntry = {
  key: string
  title: string
  description: string
  category: SimulatorCategory
  accent: string
  params: SimulatorParam[]
}

export const SIMULATOR_CATEGORIES: SimulatorCategory[] = [
  'Optique', 'Ondes', 'Électricité', 'Nucléaire', 'Chimie', 'Maths',
]

const CATEGORY_ACCENT: Record<SimulatorCategory, string> = {
  Optique: '#5b60f9',
  Ondes: '#0ea5e9',
  Électricité: '#f5900b',
  Nucléaire: '#16a34a',
  Chimie: '#db2777',
  Maths: '#7c3aed',
}

function entry(
  key: string,
  title: string,
  description: string,
  category: SimulatorCategory,
  params: SimulatorParam[] = [],
): SimulatorEntry {
  return { key, title, description, category, accent: CATEGORY_ACCENT[category], params }
}

export const SIMULATOR_CATALOG: SimulatorEntry[] = [
  // ── Optique ────────────────────────────────────────────────────────────
  entry('prism_simulator', 'Dispersion par un prisme', 'Décomposition de la lumière blanche à travers un prisme.', 'Optique', [
    { key: 'incidentAngle', label: 'Angle d’incidence', type: 'number', default: 40, min: 0, max: 90, unit: '°' },
  ]),
  entry('light_diffraction_simulator', 'Diffraction de la lumière', 'Figure de diffraction par une fente fine.', 'Optique', [
    { key: 'slitWidth', label: 'Largeur de fente', type: 'number', default: 100, min: 10, max: 500, unit: 'µm' },
    { key: 'wavelength', label: 'Longueur d’onde', type: 'number', default: 550, min: 380, max: 750, unit: 'nm' },
  ]),
  entry('diffraction_simulator', 'Diffraction (fente simple)', 'Diffraction et tache centrale.', 'Optique', [
    { key: 'slitWidth', label: 'Largeur de fente', type: 'number', default: 100, min: 10, max: 500, unit: 'µm' },
    { key: 'wavelength', label: 'Longueur d’onde', type: 'number', default: 550, min: 380, max: 750, unit: 'nm' },
  ]),
  entry('diffraction_lab', 'Labo de diffraction', 'Atelier interactif complet sur la diffraction.', 'Optique'),
  entry('light_lab', 'Labo d’optique', 'Environnement d’optique guidé.', 'Optique'),

  // ── Ondes ──────────────────────────────────────────────────────────────
  entry('wave_source_simulator', 'Propagation d’une onde', 'Onde progressive depuis une source.', 'Ondes', [
    { key: 'frequency', label: 'Fréquence', type: 'number', default: 2, min: 0.5, max: 10, step: 0.5, unit: 'Hz' },
    { key: 'amplitude', label: 'Amplitude', type: 'number', default: 1, min: 0.1, max: 3, step: 0.1 },
  ]),
  entry('rope_wave_simulator', 'Onde sur une corde', 'Propagation le long d’une corde.', 'Ondes'),
  entry('sound_wave_simulator', 'Onde sonore', 'Compression / dilatation d’une onde sonore.', 'Ondes'),
  entry('superposition_simulator', 'Superposition d’ondes', 'Interférences de deux ondes.', 'Ondes'),
  entry('time_delay_simulator', 'Retard temporel', 'Décalage entre deux points.', 'Ondes'),
  entry('periodic_wave_simulator', 'Onde périodique', 'Période, longueur d’onde et célérité.', 'Ondes'),
  entry('stroboscope_simulator', 'Stroboscope', 'Immobilisation apparente d’un mouvement.', 'Ondes'),
  entry('wave_lab', 'Labo des ondes', 'Atelier interactif sur les ondes.', 'Ondes'),

  // ── Électricité ────────────────────────────────────────────────────────
  entry('rc_simulator', 'Circuit RC', 'Charge et décharge d’un condensateur.', 'Électricité', [
    { key: 'resistance', label: 'Résistance', type: 'number', default: 1000, min: 100, max: 100000, unit: 'Ω' },
    { key: 'capacitance', label: 'Capacité', type: 'number', default: 100, min: 1, max: 1000, unit: 'µF' },
    { key: 'voltage', label: 'Tension', type: 'number', default: 5, min: 1, max: 24, unit: 'V' },
  ]),
  entry('capacitor_association', 'Association de condensateurs', 'Série et parallèle.', 'Électricité'),

  // ── Nucléaire ──────────────────────────────────────────────────────────
  entry('decay_simulator', 'Désintégration radioactive', 'Loi de décroissance et demi-vie.', 'Nucléaire', [
    { key: 'halfLife', label: 'Demi-vie', type: 'number', default: 10, min: 1, max: 100, unit: 's' },
    { key: 'initialNuclei', label: 'Noyaux initiaux', type: 'number', default: 1000, min: 100, max: 10000, step: 100 },
  ]),
  entry('nucleus_builder', 'Constructeur de noyau', 'Composition d’un noyau (Z, N, A).', 'Nucléaire'),
  entry('isotope_comparator', 'Comparateur d’isotopes', 'Comparer des isotopes.', 'Nucléaire'),
  entry('stability_graph', 'Vallée de stabilité', 'Diagramme (N, Z) de stabilité.', 'Nucléaire'),
  entry('fission_fusion_animator', 'Fission / Fusion', 'Réactions nucléaires animées.', 'Nucléaire'),

  // ── Chimie ─────────────────────────────────────────────────────────────
  entry('ph_scale', 'Échelle de pH', 'Acidité et basicité.', 'Chimie'),
  entry('titration_curve', 'Courbe de titrage', 'Suivi pH lors d’un titrage.', 'Chimie'),
  entry('indicator_simulator', 'Indicateurs colorés', 'Zones de virage des indicateurs.', 'Chimie'),
  entry('distribution_chart', 'Diagramme de distribution', 'Espèces en fonction du pH.', 'Chimie'),
  entry('predominance', 'Diagramme de prédominance', 'Domaines de prédominance.', 'Chimie'),
  entry('progress_table', 'Tableau d’avancement', 'Avancement d’une réaction.', 'Chimie'),

  // ── Maths ──────────────────────────────────────────────────────────────
  entry('function_explorer', 'Explorateur de fonctions', 'Tracé et variations de fonctions.', 'Maths'),
  entry('sets_inclusion', 'Inclusion d’ensembles', 'Relations entre ensembles.', 'Maths'),
  entry('variations', 'Tableau de variations', 'Construction d’un tableau de variations.', 'Maths'),
  entry('pascal_triangle_lab', 'Triangle de Pascal', 'Coefficients binomiaux.', 'Maths'),
]

export function findSimulator(key: string | null | undefined): SimulatorEntry | undefined {
  if (!key) return undefined
  return SIMULATOR_CATALOG.find((s) => s.key === key)
}

export function defaultConfigFor(simKey: string): Record<string, unknown> {
  const sim = findSimulator(simKey)
  if (!sim) return {}
  const config: Record<string, unknown> = {}
  for (const param of sim.params) config[param.key] = param.default
  return config
}
