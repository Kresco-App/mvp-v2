'use client'

import type { ReactNode } from 'react'
import { AnimatedContentRenderer } from '@/components/animated/registry'
import { Latex } from '@/components/animated/shared/Latex'
import type { AnimatedJsonValue, AnimatedLessonConfig } from '@/components/animated/types'

type CourseBlockDisplay = 'inline' | 'panel' | 'full_width' | 'compact' | 'hero' | 'boxed'
type CourseBlockTone = 'neutral' | 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'slate'
type CourseCalloutVariant = 'tip' | 'warning' | 'success' | 'info' | 'exam'
type CourseListStyle = 'bullet' | 'numbered' | 'check'
type CourseQuoteVariant = 'plain' | 'accent' | 'source'

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

const toneClasses: Record<CourseBlockTone, string> = {
  neutral: 'border-[#e4e4e7] bg-white text-[#3f3f46]',
  purple: 'border-[#ddd6fe] bg-[#f5f3ff] text-[#4c1d95]',
  blue: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e3a8a]',
  green: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#14532d]',
  amber: 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]',
  red: 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]',
  slate: 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155]',
}

const calloutToneByVariant: Record<CourseCalloutVariant, CourseBlockTone> = {
  tip: 'amber',
  warning: 'red',
  success: 'green',
  info: 'blue',
  exam: 'purple',
}

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

export function CourseContentRenderer({
  document,
  className = '',
}: {
  document: CourseDocument
  className?: string
}) {
  if (!document.blocks.length) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#d4d4d8] bg-[#f7f8fb] px-6 py-8 text-center">
        <p className="m-0 text-[16px] font-black text-[#3f3f46]">No course blocks yet</p>
        <p className="m-0 mt-2 text-[13px] font-semibold leading-6 text-[#71717b]">This Course document exists but has no blocks.</p>
      </div>
    )
  }

  return (
    <div className={`grid max-w-[900px] gap-6 ${className}`} data-course-content-document={document.id ?? ''}>
      {document.blocks.map((block, index) => (
        <CourseBlockRenderer block={block} key={block.id || `${block.type}-${index}`} />
      ))}
    </div>
  )
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

function CourseBlockRenderer({ block }: { block: CourseContentBlock }) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock block={block} />
    case 'paragraph':
      return <ParagraphBlock block={block} />
    case 'definition':
      return <FramedTextBlock block={block} label="Définition" />
    case 'property':
      return <FramedTextBlock block={block} label="Propriété" />
    case 'formula':
      return <FormulaBlock block={block} />
    case 'callout':
      return <CalloutBlock block={block} />
    case 'divider':
      return <hr className="my-2 border-0 border-t border-[#e4e4e7]" />
    case 'component':
      return <CourseComponentBlockRenderer block={block} />
    case 'image':
      return <ImageBlock block={block} />
    case 'cards':
      return <CardsBlock block={block} />
    case 'comparison':
      return <ComparisonBlock block={block} />
    case 'steps':
      return <StepsBlock block={block} />
    case 'list':
      return <ListBlock block={block} />
    case 'table':
      return <TableBlock block={block} />
    case 'timeline':
      return <TimelineBlock block={block} />
    case 'equation_set':
      return <EquationSetBlock block={block} />
    case 'quote':
      return <QuoteBlock block={block} />
    case 'key_value_grid':
      return <KeyValueGridBlock block={block} />
    case 'code':
      return <CodeBlock block={block} />
    default:
      return <UnknownBlock type={(block as { type: string }).type} />
  }
}

function HeadingBlock({ block }: { block: CourseHeadingBlock }) {
  const level = block.level ?? 3
  const className = level === 2
    ? 'm-0 text-[26px] font-black leading-tight text-[#18181b]'
    : level === 4
      ? 'm-0 text-[17px] font-black leading-tight text-[#3f3f46]'
      : 'm-0 text-[21px] font-black leading-tight text-[#27272a]'

  if (level === 2) return <h2 className={className}>{block.text}</h2>
  if (level === 4) return <h4 className={className}>{block.text}</h4>
  return <h3 className={className}>{block.text}</h3>
}

function ParagraphBlock({ block }: { block: CourseParagraphBlock }) {
  return (
    <p className="m-0 whitespace-pre-line text-[15px] font-semibold leading-7 text-[#52525c]">
      <InlineMathText text={block.text} />
    </p>
  )
}

function FramedTextBlock({
  block,
  label,
}: {
  block: CourseDefinitionBlock | CoursePropertyBlock
  label: string
}) {
  const tone = block.tone ?? (block.type === 'definition' ? 'purple' : 'blue')
  return (
    <section className={`rounded-[16px] border-l-4 p-5 ${toneClasses[tone]}`}>
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.08em] opacity-70">{label}</p>
      <h4 className="m-0 mt-2 text-[17px] font-black">{block.title}</h4>
      <p className="m-0 mt-3 whitespace-pre-line text-[14px] font-semibold leading-7">
        <InlineMathText text={block.body} />
      </p>
    </section>
  )
}

function FormulaBlock({ block }: { block: CourseFormulaBlock }) {
  const display = block.display ?? 'boxed'
  const isInline = display === 'inline'

  if (isInline) {
    return (
      <p className="m-0 text-[15px] font-semibold leading-7 text-[#52525c]">
        <Latex formula={block.latex} />
        {block.caption && <span className="ml-2 text-[13px] text-[#71717b]">{block.caption}</span>}
      </p>
    )
  }

  const wrapperClass = display === 'panel'
    ? 'rounded-[16px] border border-[#e4e4e7] bg-white px-5 py-6'
    : 'rounded-[16px] border border-[#e4e4e7] bg-[#f8fafc] px-5 py-7'

  return (
    <figure className={`m-0 overflow-x-auto text-center ${wrapperClass}`}>
      <Latex formula={block.latex} block className="text-[20px] font-black text-[#18181b]" />
      {block.caption && (
        <figcaption className="mt-4 text-[12px] font-bold italic text-[#71717b]">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

function CalloutBlock({ block }: { block: CourseCalloutBlock }) {
  const variant = block.variant ?? 'tip'
  const tone = block.tone ?? calloutToneByVariant[variant]
  return (
    <aside className={`rounded-[16px] border p-5 ${toneClasses[tone]}`}>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-current opacity-70" />
        <div className="min-w-0">
          {block.title && <p className="m-0 text-[14px] font-black">{block.title}</p>}
          <p className="m-0 mt-1 whitespace-pre-line text-[14px] font-semibold leading-7">
            <InlineMathText text={block.body} />
          </p>
        </div>
      </div>
    </aside>
  )
}

function CourseComponentBlockRenderer({ block }: { block: CourseComponentBlock }) {
  const rendererKey = normalizeCourseComponentKey(block.key)
  const rawKey = typeof block.key === 'string' ? block.key : ''

  if (!allowedCourseComponentKeys.has(rendererKey)) {
    return (
      <div className="rounded-[14px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-bold text-[#991b1b]">
        Unknown Course component key: <code>{rawKey || 'missing'}</code>
      </div>
    )
  }

  const config: AnimatedLessonConfig = {
    renderer_key: rendererKey,
    title: block.title,
    description: block.description,
    metadata: block.props ?? {},
  }

  return (
    <ComponentDisplay display={block.display ?? 'inline'}>
      <AnimatedContentRenderer rendererKey={rendererKey} config={config} />
    </ComponentDisplay>
  )
}

function ComponentDisplay({
  display,
  children,
}: {
  display: CourseBlockDisplay
  children: ReactNode
}) {
  if (display === 'inline') return <section>{children}</section>
  if (display === 'compact') {
    return (
      <section className="max-w-[680px] rounded-[14px] border border-[#e4e4e7] bg-white p-4">
        {children}
      </section>
    )
  }
  if (display === 'full_width') {
    return (
      <section className="w-full rounded-[16px] bg-white py-2">
        {children}
      </section>
    )
  }
  if (display === 'hero') {
    return (
      <section className="rounded-[18px] border border-[#ddd6fe] bg-[#f5f3ff] p-5">
        {children}
      </section>
    )
  }
  return (
    <section className="rounded-[16px] border border-[#e4e4e7] bg-white p-5 shadow-sm">
      {children}
    </section>
  )
}

function ImageBlock({ block }: { block: CourseImageBlock }) {
  const src = block.src ?? ''
  if (!src) {
    return (
      <div className="rounded-[14px] border border-dashed border-[#d4d4d8] bg-[#f7f8fb] px-4 py-5 text-[13px] font-bold text-[#71717b]">
        Image asset pending: {block.asset_key ?? block.id}
      </div>
    )
  }

  return (
    <figure className="m-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={block.alt} className="max-h-[520px] w-full rounded-[16px] border border-[#e4e4e7] object-contain" />
      {block.caption && <figcaption className="mt-2 text-center text-[12px] font-bold text-[#71717b]">{block.caption}</figcaption>}
    </figure>
  )
}

function CardsBlock({ block }: { block: CourseCardsBlock }) {
  const gridClass = block.layout === 'three_column'
    ? 'md:grid-cols-3'
    : block.layout === 'one_column'
      ? 'grid-cols-1'
      : 'md:grid-cols-2'

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {block.items.map((item, index) => (
        <section className={`rounded-[14px] border p-4 ${toneClasses[item.tone ?? block.tone ?? 'neutral']}`} key={item.id ?? `${block.id}-${index}`}>
          <h4 className="m-0 text-[15px] font-black">{item.title}</h4>
          <p className="m-0 mt-2 text-[13px] font-semibold leading-6">
            <InlineMathText text={item.body} />
          </p>
        </section>
      ))}
    </div>
  )
}

function ComparisonBlock({ block }: { block: CourseComparisonBlock }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {block.columns.map((column, index) => (
        <section className={`rounded-[14px] border p-4 ${toneClasses[column.tone ?? block.tone ?? 'neutral']}`} key={column.id ?? `${block.id}-${index}`}>
          <h4 className="m-0 text-[15px] font-black">{column.title}</h4>
          <p className="m-0 mt-2 text-[13px] font-semibold leading-6">
            <InlineMathText text={column.body} />
          </p>
        </section>
      ))}
    </div>
  )
}

function StepsBlock({ block }: { block: CourseStepsBlock }) {
  const steps = Array.isArray(block.steps) ? block.steps : []
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {steps.map((step, index) => (
        <li className="grid grid-cols-[32px_1fr] gap-3 rounded-[14px] border border-[#e4e4e7] bg-white p-4" key={step.id ?? `${block.id}-${index}`}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#3a2fd3] text-[12px] font-black text-white">{index + 1}</span>
          <div>
            <h4 className="m-0 text-[15px] font-black text-[#3f3f46]">{step.title}</h4>
            <p className="m-0 mt-1 text-[13px] font-semibold leading-6 text-[#52525c]">
              <InlineMathText text={step.body} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ListBlock({ block }: { block: CourseListBlock }) {
  const items = Array.isArray(block.items) ? block.items : []
  const style = block.style ?? 'bullet'
  return (
    <section className="rounded-[16px] border border-[#e4e4e7] bg-white p-5">
      {block.title && <h4 className="m-0 text-[16px] font-black text-[#27272a]">{block.title}</h4>}
      <ol className="m-0 mt-3 grid list-none gap-2 p-0">
        {items.map((item, index) => (
          <li className="grid grid-cols-[28px_1fr] gap-3 text-[14px] font-semibold leading-6 text-[#52525c]" key={item.id ?? `${block.id}-${index}`}>
            <span className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${style === 'check' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#edf1ff] text-[#453dee]'}`}>
              {style === 'check' ? 'ok' : style === 'numbered' ? index + 1 : '-'}
            </span>
            <span><InlineMathText text={item.text} /></span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TableBlock({ block }: { block: CourseTableBlock }) {
  const columns = Array.isArray(block.columns) ? block.columns : []
  const rows = Array.isArray(block.rows) ? block.rows : []
  return (
    <figure className="m-0 overflow-hidden rounded-[16px] border border-[#d4d4d8] bg-white">
      {block.title && <figcaption className="border-b border-[#e4e4e7] px-4 py-3 text-left text-[13px] font-black uppercase tracking-[0.08em] text-[#52525c]">{block.title}</figcaption>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <thead className="bg-[#f8fafc] text-[#3f3f46]">
            <tr>
              {columns.map((column, index) => (
                <th className="border-b border-[#e4e4e7] px-4 py-3 font-black" key={`${block.id}-column-${index}`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} key={`${block.id}-row-${rowIndex}`}>
                {columns.map((_column, columnIndex) => (
                  <td className="border-b border-[#f0f0f1] px-4 py-3 font-semibold leading-6 text-[#52525c]" key={`${block.id}-cell-${rowIndex}-${columnIndex}`}>
                    <InlineMathText text={row[columnIndex] ?? ''} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function TimelineBlock({ block }: { block: CourseTimelineBlock }) {
  const items = Array.isArray(block.items) ? block.items : []
  return (
    <section className="rounded-[16px] border border-[#e4e4e7] bg-white p-5">
      {block.title && <h4 className="m-0 text-[16px] font-black text-[#27272a]">{block.title}</h4>}
      <ol className="m-0 mt-4 grid list-none gap-4 p-0">
        {items.map((item, index) => (
          <li className="grid grid-cols-[36px_1fr] gap-3" key={item.id ?? `${block.id}-${index}`}>
            <div className="flex flex-col items-center">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#453dee] text-[11px] font-black text-white">{item.marker ?? index + 1}</span>
              {index < items.length - 1 && <span className="mt-2 h-full min-h-[28px] w-px bg-[#d4d4d8]" />}
            </div>
            <div className="pb-2">
              <h4 className="m-0 text-[15px] font-black text-[#27272a]">{item.title}</h4>
              <p className="m-0 mt-1 text-[13px] font-semibold leading-6 text-[#52525c]">
                <InlineMathText text={item.body} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function EquationSetBlock({ block }: { block: CourseEquationSetBlock }) {
  const equations = Array.isArray(block.equations) ? block.equations : []
  return (
    <section className="rounded-[16px] border border-[#ddd6fe] bg-[#fbfaff] p-5">
      {block.title && <h4 className="m-0 text-[16px] font-black text-[#4c1d95]">{block.title}</h4>}
      <div className="mt-4 grid gap-3">
        {equations.map((equation, index) => (
          <figure className="m-0 rounded-[14px] border border-[#e9d5ff] bg-white px-4 py-4 text-center" key={equation.id ?? `${block.id}-${index}`}>
            {equation.label && <figcaption className="mb-2 text-left text-[11px] font-black uppercase tracking-[0.08em] text-[#7c3aed]">{equation.label}</figcaption>}
            <Latex formula={equation.latex} block className="text-[18px] font-black text-[#18181b]" />
            {equation.caption && <figcaption className="mt-3 text-[12px] font-bold text-[#71717b]">{equation.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  )
}

function QuoteBlock({ block }: { block: CourseQuoteBlock }) {
  const variant = block.variant ?? 'accent'
  const className = variant === 'plain'
    ? 'border-[#e4e4e7] bg-white text-[#3f3f46]'
    : variant === 'source'
      ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e3a8a]'
      : 'border-[#ddd6fe] bg-[#f5f3ff] text-[#4c1d95]'

  return (
    <figure className={`m-0 rounded-[16px] border-l-4 p-5 ${className}`}>
      <blockquote className="m-0 text-[17px] font-black leading-7">
        <InlineMathText text={block.body} />
      </blockquote>
      {block.cite && <figcaption className="mt-3 text-[12px] font-bold uppercase tracking-[0.08em] opacity-70">{block.cite}</figcaption>}
    </figure>
  )
}

function KeyValueGridBlock({ block }: { block: CourseKeyValueGridBlock }) {
  const items = Array.isArray(block.items) ? block.items : []
  const gridClass = block.columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
  return (
    <dl className={`m-0 grid gap-3 ${gridClass}`}>
      {items.map((item, index) => (
        <div className={`rounded-[14px] border p-4 ${toneClasses[item.tone ?? block.tone ?? 'neutral']}`} key={item.id ?? `${block.id}-${index}`}>
          <dt className="text-[11px] font-black uppercase tracking-[0.08em] opacity-70">{item.label}</dt>
          <dd className="m-0 mt-2 text-[20px] font-black leading-tight"><InlineMathText text={item.value} /></dd>
          {item.caption && <dd className="m-0 mt-2 text-[12px] font-semibold leading-5 opacity-80"><InlineMathText text={item.caption} /></dd>}
        </div>
      ))}
    </dl>
  )
}

function CodeBlock({ block }: { block: CourseCodeBlock }) {
  return (
    <figure className="m-0 overflow-hidden rounded-[16px] border border-[#d4d4d8] bg-[#0f172a] text-[#e2e8f0]">
      {(block.filename || block.language) && (
        <figcaption className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#cbd5e1]">
          <span>{block.filename ?? 'Code'}</span>
          {block.language && <span>{block.language}</span>}
        </figcaption>
      )}
      <pre className="m-0 overflow-x-auto p-4 text-[12px] font-semibold leading-6"><code>{block.code}</code></pre>
      {block.caption && <figcaption className="border-t border-white/10 px-4 py-2 text-[12px] font-semibold text-[#cbd5e1]">{block.caption}</figcaption>}
    </figure>
  )
}

function UnknownBlock({ type }: { type: string }) {
  return (
    <div className="rounded-[14px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] font-bold text-[#92400e]">
      Unsupported Course block type: <code>{type}</code>
    </div>
  )
}

function InlineMathText({ text }: { text: string }) {
  const safeText = typeof text === 'string' ? text : ''
  return (
    <>
      {splitInlineMath(safeText).map((part, index) => (
        part.kind === 'math'
          ? <Latex formula={part.value} key={`${part.kind}-${index}`} className="align-baseline" />
          : <span key={`${part.kind}-${index}`}>{part.value}</span>
      ))}
    </>
  )
}

function splitInlineMath(text: string) {
  const parts: Array<{ kind: 'text' | 'math'; value: string }> = []
  let buffer = ''
  let math = ''
  let inMath = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const previous = index > 0 ? text[index - 1] : ''
    if (char === '$' && previous !== '\\') {
      if (inMath) {
        parts.push({ kind: 'math', value: math })
        math = ''
      } else {
        if (buffer) parts.push({ kind: 'text', value: buffer.replace(/\\\$/g, '$') })
        buffer = ''
      }
      inMath = !inMath
      continue
    }

    if (inMath) math += char
    else buffer += char
  }

  if (inMath) {
    buffer += `$${math}`
  }
  if (buffer) parts.push({ kind: 'text', value: buffer.replace(/\\\$/g, '$') })

  return parts
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
