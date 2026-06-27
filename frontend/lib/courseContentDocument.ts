import type { AnimatedJsonValue } from '@/components/animated/types'

export type CourseBlockDisplay = 'inline' | 'panel' | 'full_width' | 'compact' | 'hero' | 'boxed'
export type CourseBlockTone = 'neutral' | 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'slate'
export type CourseCalloutVariant = 'tip' | 'warning' | 'success' | 'info' | 'exam'
export type CourseListStyle = 'bullet' | 'numbered' | 'check'
export type CourseQuoteVariant = 'plain' | 'accent' | 'source'

type CourseBlockBase = {
  id: string
  type: string
  display?: CourseBlockDisplay
  tone?: CourseBlockTone
}

export type CourseHeadingBlock = CourseBlockBase & {
  type: 'heading'
  text: string
  level?: 2 | 3 | 4
}

export type CourseParagraphBlock = CourseBlockBase & {
  type: 'paragraph'
  text: string
}

export type CourseDefinitionBlock = CourseBlockBase & {
  type: 'definition'
  title: string
  body: string
}

export type CoursePropertyBlock = CourseBlockBase & {
  type: 'property'
  title: string
  body: string
}

export type CourseFormulaBlock = CourseBlockBase & {
  type: 'formula'
  latex: string
  caption?: string
}

export type CourseCalloutBlock = CourseBlockBase & {
  type: 'callout'
  title?: string
  body: string
  variant?: CourseCalloutVariant
}

export type CourseDividerBlock = CourseBlockBase & {
  type: 'divider'
}

export type CourseComponentBlock = CourseBlockBase & {
  type: 'component'
  key: string
  title?: string
  description?: string
  props?: Record<string, AnimatedJsonValue>
}

export type CourseImageBlock = CourseBlockBase & {
  type: 'image'
  src?: string
  asset_key?: string
  alt: string
  caption?: string
}

export type CourseCardsBlock = CourseBlockBase & {
  type: 'cards'
  layout?: 'one_column' | 'two_column' | 'three_column'
  items: Array<{
    id?: string
    title: string
    body: string
    tone?: CourseBlockTone
  }>
}

export type CourseComparisonBlock = CourseBlockBase & {
  type: 'comparison'
  columns: Array<{
    id?: string
    title: string
    body: string
    tone?: CourseBlockTone
  }>
}

export type CourseStepsBlock = CourseBlockBase & {
  type: 'steps'
  steps: Array<{
    id?: string
    title: string
    body: string
  }>
}

export type CourseListBlock = CourseBlockBase & {
  type: 'list'
  title?: string
  style?: CourseListStyle
  items: Array<{
    id?: string
    text: string
  }>
}

export type CourseTableBlock = CourseBlockBase & {
  type: 'table'
  title?: string
  columns: string[]
  rows: string[][]
}

export type CourseTimelineBlock = CourseBlockBase & {
  type: 'timeline'
  title?: string
  items: Array<{
    id?: string
    marker?: string
    title: string
    body: string
  }>
}

export type CourseEquationSetBlock = CourseBlockBase & {
  type: 'equation_set'
  title?: string
  equations: Array<{
    id?: string
    label?: string
    latex: string
    caption?: string
  }>
}

export type CourseQuoteBlock = CourseBlockBase & {
  type: 'quote'
  body: string
  cite?: string
  variant?: CourseQuoteVariant
}

export type CourseKeyValueGridBlock = CourseBlockBase & {
  type: 'key_value_grid'
  columns?: 2 | 3
  items: Array<{
    id?: string
    label: string
    value: string
    caption?: string
    tone?: CourseBlockTone
  }>
}

export type CourseCodeBlock = CourseBlockBase & {
  type: 'code'
  language?: string
  filename?: string
  code: string
  caption?: string
}

export type CourseContentBlock =
  | CourseHeadingBlock
  | CourseParagraphBlock
  | CourseDefinitionBlock
  | CoursePropertyBlock
  | CourseFormulaBlock
  | CourseCalloutBlock
  | CourseDividerBlock
  | CourseComponentBlock
  | CourseImageBlock
  | CourseCardsBlock
  | CourseComparisonBlock
  | CourseStepsBlock
  | CourseListBlock
  | CourseTableBlock
  | CourseTimelineBlock
  | CourseEquationSetBlock
  | CourseQuoteBlock
  | CourseKeyValueGridBlock
  | CourseCodeBlock

export type CourseDocument = {
  id?: string
  schema_version?: number
  blocks: CourseContentBlock[]
}

const allowedCourseComponentKeys = new Set([
  'animated_lesson',
  'structured_lesson',
  'interactive_component',
  'wave_periodicity',
  'periodicite_interactive_course',
  'nucleus_composition',
  'nucleus_composition_interactive_course',
  'atom_composition',
  'nucleus_builder',
  'isotope_comparator',
  'stability_graph',
  'decay_simulator',
  'decay_law_graph',
  'decay_diagrams',
  'half_life_explanation',
  'formula_summary',
  'radioactivity_visualizer',
  'radioactivity_formulas',
  'tau_demonstration',
  'soddy_law_demonstrator',
  'particle_identification_method',
  'mass_energy_scale',
  'mass_energy_demonstration',
  'aston_curve',
  'fission_fusion_animator',
  'nuclear_formulas',
  'nucleus_stability_explorer',
  'wave_source_simulator',
  'wave_simulator_source',
  'rope_wave_simulator',
  'sound_wave_simulator',
  'superposition_simulator',
  'time_delay_simulator',
  'periodic_wave_simulator',
  'stroboscope_simulator',
  'wave_periodic_formulas',
  'light_diffraction_simulator',
  'diffraction_simulator',
  'prism_simulator',
  'light_formulas',
  'kinetics_course',
  'progress_table',
  'distribution_chart',
  'ph_scale',
  'predominance',
  'titration_curve',
  'indicator_simulator',
  'interactive_water',
  'chimie_formulas',
  'sets_inclusion',
  'sets_inclusion_animation',
  'variations',
  'variations_animation',
  'pascal_triangle_animation',
  'function_explorer',
  'rc_formulas',
  'capacitor_association',
])

export function courseDocumentFromConfig(config: unknown): CourseDocument | null {
  const direct = courseDocumentFromRecord(config)
  if (direct) return direct

  if (!isRecord(config)) return null

  return (
    courseDocumentFromRecord(config.course) ??
    courseDocumentFromRecord(config.course_document) ??
    null
  )
}

export function hasCourseDocument(config: unknown) {
  return Boolean(courseDocumentFromConfig(config))
}

export function normalizeCourseComponentKey(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function isAllowedCourseComponentKey(value: unknown) {
  return allowedCourseComponentKeys.has(normalizeCourseComponentKey(value))
}

function courseDocumentFromRecord(value: unknown): CourseDocument | null {
  if (!isRecord(value)) return null

  const rawBlocks = Array.isArray(value.blocks)
    ? value.blocks
    : Array.isArray(value.course_blocks)
      ? value.course_blocks
      : null

  if (!rawBlocks) return null

  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    schema_version: typeof value.schema_version === 'number' ? value.schema_version : undefined,
    blocks: rawBlocks.filter(isRecord) as CourseContentBlock[],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
