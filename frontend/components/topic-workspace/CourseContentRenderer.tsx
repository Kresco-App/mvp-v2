'use client'

import { Component, memo, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import type { AnimatedLessonConfig, AnimatedRendererProps } from '@/components/animated/types'
import { useNearViewport } from '@/hooks/useNearViewport'
import {
  isAllowedCourseComponentKey as isAllowedCourseComponentKeyFromDocument,
  normalizeCourseComponentKey as normalizeCourseComponentKeyFromDocument,
  type CourseBlockDisplay,
  type CourseBlockTone,
  type CourseCalloutBlock,
  type CourseCalloutVariant,
  type CourseCardsBlock,
  type CourseCodeBlock,
  type CourseComparisonBlock,
  type CourseComponentBlock,
  type CourseContentBlock,
  type CourseDefinitionBlock,
  type CourseDocument,
  type CourseEquationSetBlock,
  type CourseFormulaBlock,
  type CourseHeadingBlock,
  type CourseImageBlock,
  type CourseKeyValueGridBlock,
  type CourseListBlock,
  type CourseParagraphBlock,
  type CoursePropertyBlock,
  type CourseQuoteBlock,
  type CourseStepsBlock,
  type CourseTableBlock,
  type CourseTimelineBlock,
} from '@/lib/courseContentDocument'

export {
  courseDocumentFromConfig,
  hasCourseDocument,
  isAllowedCourseComponentKey,
  normalizeCourseComponentKey,
} from '@/lib/courseContentDocument'
export type { CourseContentBlock, CourseDocument } from '@/lib/courseContentDocument'

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
const EAGER_COURSE_BLOCK_COUNT = 4
const COURSE_BLOCK_ROOT_MARGIN = '900px'
const courseBlockContainmentClass = '[content-visibility:auto] [contain-intrinsic-size:auto_240px]'
const Latex = dynamic(
  () => import('@/components/animated/shared/Latex').then((module) => module.Latex),
  { ssr: false },
)

const DeferredAnimatedContentRenderer = dynamic<AnimatedRendererProps>(
  () => import('@/components/animated/registry').then((module) => module.AnimatedContentRenderer),
  {
    ssr: false,
    loading: () => <CourseComponentLoading />,
  },
)

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
    <div className={`grid w-full max-w-[1057px] gap-6 ${className}`} data-course-content-document={document.id ?? ''}>
      {document.blocks.map((block, index) => (
        <CourseBlockFrame block={block} eager={index < EAGER_COURSE_BLOCK_COUNT} key={block.id || `${block.type}-${index}`} />
      ))}
    </div>
  )
}

const CourseBlockFrame = memo(function CourseBlockFrame({
  block,
  eager,
}: {
  block: CourseContentBlock
  eager: boolean
}) {
  const { nearViewport, ref } = useNearViewport<HTMLDivElement>({ rootMargin: COURSE_BLOCK_ROOT_MARGIN })
  const shouldRenderBlock = eager || nearViewport

  return (
    <div ref={ref} className={`min-w-0 ${courseBlockContainmentClass}`} data-course-block-type={block.type}>
      {shouldRenderBlock ? (
        <CourseBlockRenderer block={block} />
      ) : (
        <div
          aria-hidden="true"
          data-course-block-placeholder
          style={{ minHeight: courseBlockPlaceholderHeight(block) }}
        />
      )}
    </div>
  )
})

function courseBlockPlaceholderHeight(block: CourseContentBlock) {
  if (block.type === 'component') return block.display === 'hero' ? 420 : 260
  if (block.type === 'table') return 280
  if (block.type === 'cards' || block.type === 'comparison' || block.type === 'steps') return 240
  if (block.type === 'image') return 320
  if (block.type === 'equation_set' || block.type === 'key_value_grid' || block.type === 'timeline') return 220
  if (block.type === 'heading' || block.type === 'divider') return 48
  return 160
}

function CourseBlockEmptyState({ message = 'This block has no displayable content yet.' }: { message?: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#d4d4d8] bg-[#f7f8fb] px-4 py-4 text-[13px] font-bold leading-6 text-[#71717b]">
      {message}
    </div>
  )
}

function CourseComponentLoading() {
  return (
    <div className="min-h-[160px] rounded-[14px] border border-dashed border-[#d4d4d8] bg-[#f8fafc] px-4 py-5 text-[13px] font-black text-[#71717b]" role="status">
      Loading interactive component...
    </div>
  )
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
    ? 'm-0 text-balance text-[26px] font-black leading-tight text-[#18181b]'
    : level === 4
      ? 'm-0 text-balance text-[17px] font-black leading-tight text-[#3f3f46]'
      : 'm-0 text-balance text-[21px] font-black leading-tight text-[#27272a]'

  if (level === 2) return <h2 className={className}>{block.text}</h2>
  if (level === 4) return <h4 className={className}>{block.text}</h4>
  return <h3 className={className}>{block.text}</h3>
}

function ParagraphBlock({ block }: { block: CourseParagraphBlock }) {
  return (
    <p className="m-0 whitespace-pre-line break-words text-pretty text-[15px] font-semibold leading-7 text-[#52525c]">
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
  const rendererKey = normalizeCourseComponentKeyFromDocument(block.key)
  const rawKey = typeof block.key === 'string' ? block.key : ''

  if (!isAllowedCourseComponentKeyFromDocument(rendererKey)) {
    return (
      <div role="alert" className="min-w-0 break-words rounded-[14px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-bold text-[#991b1b]">
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
    <ComponentDisplay
      description={block.description}
      display={block.display ?? 'inline'}
      rendererKey={rendererKey}
      title={block.title}
    >
      <CourseComponentErrorBoundary rendererKey={rendererKey} title={block.title}>
        <DeferredAnimatedContentRenderer rendererKey={rendererKey} config={config} className="min-w-0" />
      </CourseComponentErrorBoundary>
    </ComponentDisplay>
  )
}

function ComponentDisplay({
  description,
  display,
  rendererKey,
  title,
  children,
}: {
  description?: string
  display: CourseBlockDisplay
  rendererKey: string
  title?: string
  children: ReactNode
}) {
  const cleanTitle = typeof title === 'string' ? title.trim() : ''
  const cleanDescription = typeof description === 'string' ? description.trim() : ''
  const header = cleanTitle || cleanDescription
    ? (
      <div className="mb-4 min-w-0 border-b border-[#f4f4f5] pb-3">
        {cleanTitle && <h3 className="m-0 text-[17px] font-black leading-tight text-[#27272a]">{cleanTitle}</h3>}
        {cleanDescription && (
          <p className="m-0 mt-1 max-w-[760px] text-[13px] font-semibold leading-6 text-[#71717b]">
            {cleanDescription}
          </p>
        )}
      </div>
    )
    : null
  const content = (
    <>
      {header}
      <div className="min-w-0 overflow-x-auto overscroll-x-contain pb-1">
        {children}
      </div>
    </>
  )
  const ariaLabel = cleanTitle || `${componentTitleFromRendererKey(rendererKey)} interactive component`
  const baseClass = 'min-w-0 scroll-mt-24'

  if (display === 'inline') {
    return (
      <section aria-label={ariaLabel} className={`${baseClass} w-full`} data-course-component-key={rendererKey} data-course-component-display={display}>
        {content}
      </section>
    )
  }
  if (display === 'compact') {
    return (
      <section aria-label={ariaLabel} className={`${baseClass} w-full max-w-[680px] rounded-[14px] border border-[#e4e4e7] bg-white p-4`} data-course-component-key={rendererKey} data-course-component-display={display}>
        {content}
      </section>
    )
  }
  if (display === 'full_width') {
    return (
      <section aria-label={ariaLabel} className={`${baseClass} w-full max-w-[1057px] rounded-[16px] bg-white py-2`} data-course-component-key={rendererKey} data-course-component-display={display}>
        {content}
      </section>
    )
  }
  if (display === 'hero') {
    return (
      <section aria-label={ariaLabel} className={`${baseClass} rounded-[18px] border border-[#ddd6fe] bg-[#f5f3ff] p-5`} data-course-component-key={rendererKey} data-course-component-display={display}>
        {content}
      </section>
    )
  }
  return (
    <section aria-label={ariaLabel} className={`${baseClass} rounded-[16px] border border-[#e4e4e7] bg-white p-5 shadow-sm`} data-course-component-key={rendererKey} data-course-component-display={display}>
      {content}
    </section>
  )
}

type CourseComponentErrorBoundaryProps = {
  children: ReactNode
  rendererKey: string
  title?: string
}

class CourseComponentErrorBoundary extends Component<CourseComponentErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(previousProps: CourseComponentErrorBoundaryProps) {
    if (previousProps.rendererKey !== this.props.rendererKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <CourseComponentErrorFallback
          rendererKey={this.props.rendererKey}
          title={this.props.title}
        />
      )
    }

    return this.props.children
  }
}

function CourseComponentErrorFallback({
  rendererKey,
  title,
}: {
  rendererKey: string
  title?: string
}) {
  const label = title?.trim() || componentTitleFromRendererKey(rendererKey)

  return (
    <div role="alert" className="min-w-0 rounded-[14px] border border-[#fecaca] bg-[#fef2f2] px-4 py-4 text-[#991b1b]">
      <p className="m-0 text-[13px] font-black uppercase tracking-[0.08em]">Interactive component unavailable</p>
      <p className="m-0 mt-2 text-[14px] font-semibold leading-6">
        {label} could not load. The rest of the lesson remains available.
      </p>
      <p className="m-0 mt-2 break-words text-[12px] font-bold text-[#b91c1c]">
        Component: <code>{rendererKey}</code>
      </p>
    </div>
  )
}

function componentTitleFromRendererKey(value: string) {
  const words = value.split('_').filter(Boolean)
  if (!words.length) return 'Course'
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
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
      <Image
        src={src}
        alt={block.alt}
        width={1200}
        height={675}
        unoptimized
        loading="lazy"
        className="kresco-media-outline max-h-[520px] w-full rounded-[16px] object-contain"
      />
      {block.caption && <figcaption className="mt-2 break-words text-center text-[12px] font-bold text-[#71717b]">{block.caption}</figcaption>}
    </figure>
  )
}

function CardsBlock({ block }: { block: CourseCardsBlock }) {
  const items = Array.isArray(block.items) ? block.items : []
  const gridClass = block.layout === 'three_column'
    ? 'md:grid-cols-3'
    : block.layout === 'one_column'
      ? 'grid-cols-1'
      : 'md:grid-cols-2'

  if (items.length === 0) return <CourseBlockEmptyState message="This card group has no items yet." />

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {items.map((item, index) => (
        <section className={`rounded-[14px] border p-4 ${toneClasses[item.tone ?? block.tone ?? 'neutral']}`} key={item.id ?? `${block.id}-${index}`}>
          <h4 className="m-0 break-words text-[15px] font-black">{item.title}</h4>
          <p className="m-0 mt-2 break-words text-[13px] font-semibold leading-6">
            <InlineMathText text={item.body} />
          </p>
        </section>
      ))}
    </div>
  )
}

function ComparisonBlock({ block }: { block: CourseComparisonBlock }) {
  const columns = Array.isArray(block.columns) ? block.columns : []

  if (columns.length === 0) return <CourseBlockEmptyState message="This comparison has no columns yet." />

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {columns.map((column, index) => (
        <section className={`rounded-[14px] border p-4 ${toneClasses[column.tone ?? block.tone ?? 'neutral']}`} key={column.id ?? `${block.id}-${index}`}>
          <h4 className="m-0 break-words text-[15px] font-black">{column.title}</h4>
          <p className="m-0 mt-2 break-words text-[13px] font-semibold leading-6">
            <InlineMathText text={column.body} />
          </p>
        </section>
      ))}
    </div>
  )
}

function StepsBlock({ block }: { block: CourseStepsBlock }) {
  const steps = Array.isArray(block.steps) ? block.steps : []
  if (steps.length === 0) return <CourseBlockEmptyState message="This step list has no steps yet." />

  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {steps.map((step, index) => (
        <li className="grid grid-cols-[32px_1fr] gap-3 rounded-[14px] border border-[#e4e4e7] bg-white p-4" key={step.id ?? `${block.id}-${index}`}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#3a2fd3] text-[12px] font-black text-white">{index + 1}</span>
          <div className="min-w-0">
            <h4 className="m-0 break-words text-[15px] font-black text-[#3f3f46]">{step.title}</h4>
            <p className="m-0 mt-1 break-words text-[13px] font-semibold leading-6 text-[#52525c]">
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
      {block.title && <h4 className="m-0 break-words text-[16px] font-black text-[#27272a]">{block.title}</h4>}
      {items.length === 0 && <CourseBlockEmptyState message="This list has no items yet." />}
      <ol className="m-0 mt-3 grid list-none gap-2 p-0">
        {items.map((item, index) => (
          <li className="grid grid-cols-[28px_1fr] gap-3 text-[14px] font-semibold leading-6 text-[#52525c]" key={item.id ?? `${block.id}-${index}`}>
            <span className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${style === 'check' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#edf1ff] text-[#453dee]'}`}>
              {style === 'check' ? 'ok' : style === 'numbered' ? index + 1 : '-'}
            </span>
            <span className="min-w-0 break-words"><InlineMathText text={item.text} /></span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TableBlock({ block }: { block: CourseTableBlock }) {
  const columns = Array.isArray(block.columns) ? block.columns : []
  const rows = Array.isArray(block.rows) ? block.rows : []
  if (columns.length === 0 || rows.length === 0) return <CourseBlockEmptyState message="This table has no rows yet." />

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
  if (items.length === 0) return <CourseBlockEmptyState message="This timeline has no items yet." />

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
            <div className="min-w-0 pb-2">
              <h4 className="m-0 break-words text-[15px] font-black text-[#27272a]">{item.title}</h4>
              <p className="m-0 mt-1 break-words text-[13px] font-semibold leading-6 text-[#52525c]">
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
      {block.title && <h4 className="m-0 break-words text-[16px] font-black text-[#4c1d95]">{block.title}</h4>}
      {equations.length === 0 && <CourseBlockEmptyState message="This equation set has no equations yet." />}
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
  if (items.length === 0) return <CourseBlockEmptyState message="This key-value grid has no items yet." />

  return (
    <dl className={`m-0 grid gap-3 ${gridClass}`}>
      {items.map((item, index) => (
        <div className={`rounded-[14px] border p-4 ${toneClasses[item.tone ?? block.tone ?? 'neutral']}`} key={item.id ?? `${block.id}-${index}`}>
          <dt className="break-words text-[11px] font-black uppercase tracking-[0.08em] opacity-70">{item.label}</dt>
          <dd className="m-0 mt-2 break-words text-[20px] font-black leading-tight"><InlineMathText text={item.value} /></dd>
          {item.caption && <dd className="m-0 mt-2 break-words text-[12px] font-semibold leading-5 opacity-80"><InlineMathText text={item.caption} /></dd>}
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
    <div className="break-words rounded-[14px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] font-bold text-[#92400e]">
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

type InlineMathPart = { kind: 'text' | 'math'; value: string }

const INLINE_MATH_PARTS_CACHE_MAX = 256
const inlineMathPartsCache = new Map<string, InlineMathPart[]>()

function splitInlineMath(text: string) {
  const cached = inlineMathPartsCache.get(text)
  if (cached) return cached

  const parts: InlineMathPart[] = []
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

  rememberInlineMathParts(text, parts)
  return parts
}

function rememberInlineMathParts(text: string, parts: InlineMathPart[]) {
  if (inlineMathPartsCache.size >= INLINE_MATH_PARTS_CACHE_MAX) {
    const first = inlineMathPartsCache.keys().next().value
    if (first !== undefined) inlineMathPartsCache.delete(first)
  }

  inlineMathPartsCache.set(text, parts)
}
