'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Lightbulb,
  Sigma,
  Sparkles,
} from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type Accent = 'purple' | 'yellow' | 'blue' | 'green' | 'neutral'

const accentStyles: Record<
  Accent,
  {
    icon: string
    soft: string
    border: string
    text: string
    fill: string
    ring: string
    solid: string
    shadow: string
  }
> = {
  purple: {
    icon: 'bg-[#edf1ff] text-[#453dee]',
    soft: 'bg-[#f4f3ff]',
    border: 'border-[#d9d7ff]',
    text: 'text-[#453dee]',
    fill: 'bg-[#453dee]',
    ring: 'focus-visible:ring-[#453dee]/20',
    solid: 'bg-[#453dee] text-white',
    shadow: 'shadow-[0_10px_24px_rgba(69,61,238,0.12)]',
  },
  yellow: {
    icon: 'bg-[#fff7d6] text-[#d97706]',
    soft: 'bg-[#fffbeb]',
    border: 'border-[#fde68a]',
    text: 'text-[#b45309]',
    fill: 'bg-[#f5a20b]',
    ring: 'focus-visible:ring-[#f5a20b]/20',
    solid: 'bg-[#f5a20b] text-white',
    shadow: 'shadow-[0_10px_24px_rgba(245,162,11,0.12)]',
  },
  blue: {
    icon: 'bg-[#eaf8ff] text-[#1292cf]',
    soft: 'bg-[#f0f9ff]',
    border: 'border-[#bae6fd]',
    text: 'text-[#0284c7]',
    fill: 'bg-[#29aee4]',
    ring: 'focus-visible:ring-[#29aee4]/20',
    solid: 'bg-[#29aee4] text-white',
    shadow: 'shadow-[0_10px_24px_rgba(41,174,228,0.12)]',
  },
  green: {
    icon: 'bg-[#f0fdf4] text-[#16a34a]',
    soft: 'bg-[#f0fdf4]',
    border: 'border-[#bbf7d0]',
    text: 'text-[#15803d]',
    fill: 'bg-[#16a34a]',
    ring: 'focus-visible:ring-[#16a34a]/20',
    solid: 'bg-[#16a34a] text-white',
    shadow: 'shadow-[0_10px_24px_rgba(22,163,74,0.12)]',
  },
  neutral: {
    icon: 'bg-[#f4f4f5] text-[#52525c]',
    soft: 'bg-[#f8f9fc]',
    border: 'border-[#e4e4e7]',
    text: 'text-[#52525c]',
    fill: 'bg-[#71717b]',
    ring: 'focus-visible:ring-[#71717b]/20',
    solid: 'bg-[#3f3f46] text-white',
    shadow: 'shadow-[0_10px_24px_rgba(24,24,27,0.08)]',
  },
}

const enterTransition = {
  type: 'spring',
  stiffness: 340,
  damping: 30,
  mass: 0.8,
} as const

export interface AnimatedLessonShellProps {
  children: React.ReactNode
  header?: React.ReactNode
  sidebar?: React.ReactNode
  footer?: React.ReactNode
  progress?: number
  maxWidthClassName?: string
  className?: string
  contentClassName?: string
}

export function AnimatedLessonShell({
  children,
  header,
  sidebar,
  footer,
  progress,
  maxWidthClassName = 'max-w-6xl',
  className,
  contentClassName,
}: AnimatedLessonShellProps) {
  const progressValue = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : undefined

  return (
    <section className={cn('min-h-screen bg-[#f8f9fc] px-4 py-6 text-[#18181b] sm:px-6 lg:px-8', className)}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={enterTransition}
        className={cn('mx-auto w-full', maxWidthClassName)}
      >
        {progressValue !== undefined && (
          <div aria-label="Lesson progress" className="mb-5 h-2 overflow-hidden rounded-full bg-[#eceef4]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#ffd21f] to-[#453dee]"
              initial={{ width: 0 }}
              animate={{ width: `${progressValue}%` }}
              transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </div>
        )}

        {header && <div className="mb-5">{header}</div>}

        <div
          className={cn(
            'grid items-start gap-5',
            sidebar ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-1',
            contentClassName,
          )}
        >
          <main className="min-w-0 space-y-5">{children}</main>
          {sidebar && <aside className="min-w-0 space-y-4 lg:sticky lg:top-5">{sidebar}</aside>}
        </div>

        {footer && <div className="mt-5">{footer}</div>}
      </motion.div>
    </section>
  )
}

export interface LessonHeroHeaderProps {
  title: React.ReactNode
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  badge?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  meta?: React.ReactNode
  accent?: Accent
  className?: string
}

export function LessonHeroHeader({
  title,
  eyebrow,
  description,
  badge,
  icon,
  actions,
  meta,
  accent = 'purple',
  className,
}: LessonHeroHeaderProps) {
  const styles = accentStyles[accent]

  return (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={enterTransition}
      className={cn(
        'overflow-hidden rounded-[18px] border border-[#e4e4e7] bg-white p-5 shadow-[0_14px_34px_rgba(24,24,27,0.07)] sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            className={cn(
              'grid h-12 w-12 shrink-0 place-items-center rounded-2xl border',
              styles.icon,
              styles.border,
            )}
          >
            {icon ?? <BookOpen size={22} aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {eyebrow && <span className={cn('text-xs font-extrabold uppercase tracking-[0.08em]', styles.text)}>{eyebrow}</span>}
              {badge && (
                <span className="inline-flex min-h-7 items-center rounded-full border border-[#e4e4e7] bg-[#f8f9fc] px-3 text-xs font-extrabold text-[#52525c]">
                  {badge}
                </span>
              )}
            </div>
            <h1 className="max-w-3xl text-balance text-3xl font-black leading-tight text-[#3f3f46] sm:text-4xl">
              {title}
            </h1>
            {description && <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#71717b] sm:text-base">{description}</p>}
            {meta && <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold text-[#52525c]">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </motion.header>
  )
}

export interface DefinitionBlockProps {
  term: React.ReactNode
  children?: React.ReactNode
  definition?: React.ReactNode
  example?: React.ReactNode
  icon?: React.ReactNode
  accent?: Accent
  className?: string
}

export function DefinitionBlock({
  term,
  children,
  definition,
  example,
  icon,
  accent = 'yellow',
  className,
}: DefinitionBlockProps) {
  const styles = accentStyles[accent]

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={enterTransition}
      className={cn('rounded-2xl border border-[#e4e4e7] bg-white p-5 shadow-[0_10px_24px_rgba(24,24,27,0.06)]', className)}
    >
      <div className="flex gap-4">
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border', styles.icon, styles.border)}>
          {icon ?? <Lightbulb size={18} aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black leading-tight text-[#3f3f46]">{term}</h2>
          {definition && <p className="mt-2 text-sm font-semibold leading-6 text-[#52525c]">{definition}</p>}
          {children && <div className="mt-3 text-sm font-semibold leading-6 text-[#52525c]">{children}</div>}
          {example && (
            <div className={cn('mt-4 rounded-xl border px-4 py-3 text-sm font-bold leading-6', styles.soft, styles.border, styles.text)}>
              {example}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  )
}

export interface ConceptCardData {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  meta?: React.ReactNode
  accent?: Accent
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
}

export interface ConceptCardGridProps {
  cards?: ConceptCardData[]
  children?: React.ReactNode
  columns?: 2 | 3 | 4
  className?: string
}

export function ConceptCardGrid({ cards, children, columns = 3, className }: ConceptCardGridProps) {
  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 xl:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {cards?.map((card, index) => (
        <ConceptCard key={card.id ?? index} {...card} animationDelay={index * 0.035} />
      ))}
      {children}
    </div>
  )
}

export interface ConceptCardProps extends ConceptCardData {
  animationDelay?: number
  className?: string
}

export function ConceptCard({
  title,
  description,
  icon,
  meta,
  accent = 'purple',
  selected = false,
  disabled = false,
  onClick,
  animationDelay = 0,
  className,
}: ConceptCardProps) {
  const styles = accentStyles[accent]
  const interactive = Boolean(onClick)
  const Component = interactive ? motion.button : motion.article

  return (
    <Component
      type={interactive ? 'button' : undefined}
      onClick={disabled ? undefined : onClick}
      disabled={interactive ? disabled : undefined}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={interactive && !disabled ? { y: -2 } : undefined}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ ...enterTransition, delay: animationDelay }}
      className={cn(
        'min-h-[154px] w-full rounded-2xl border bg-white p-4 text-left shadow-[0_8px_20px_rgba(24,24,27,0.055)] transition-colors',
        selected ? cn(styles.border, 'ring-4', styles.ring) : 'border-[#e4e4e7]',
        interactive && !disabled && 'cursor-pointer hover:border-[#d9d7ff] hover:shadow-[0_12px_28px_rgba(69,61,238,0.1)]',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className={cn('grid h-10 w-10 place-items-center rounded-xl border', styles.icon, styles.border)}>
            {icon ?? <Sparkles size={18} aria-hidden="true" />}
          </div>
          {selected && (
            <span className={cn('grid h-6 w-6 place-items-center rounded-full', styles.solid)}>
              <Check size={14} aria-hidden="true" />
            </span>
          )}
        </div>
        <h3 className="text-base font-black leading-tight text-[#3f3f46]">{title}</h3>
        {description && <p className="mt-2 line-clamp-3 text-sm font-semibold leading-5 text-[#71717b]">{description}</p>}
        {meta && <div className={cn('mt-auto pt-4 text-xs font-extrabold', styles.text)}>{meta}</div>}
      </div>
    </Component>
  )
}

export interface FormulaVariable {
  symbol: React.ReactNode
  label: React.ReactNode
}

export interface FormulaPanelProps {
  title?: React.ReactNode
  formula: React.ReactNode
  description?: React.ReactNode
  variables?: FormulaVariable[]
  footer?: React.ReactNode
  accent?: Accent
  className?: string
}

export function FormulaPanel({
  title = 'Formule',
  formula,
  description,
  variables,
  footer,
  accent = 'purple',
  className,
}: FormulaPanelProps) {
  const styles = accentStyles[accent]

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={enterTransition}
      className={cn('rounded-2xl border border-[#e4e4e7] bg-white p-5 shadow-[0_10px_24px_rgba(24,24,27,0.06)]', className)}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className={cn('grid h-10 w-10 place-items-center rounded-xl border', styles.icon, styles.border)}>
          <Sigma size={19} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-black text-[#3f3f46]">{title}</h2>
          {description && <p className="mt-0.5 text-sm font-semibold text-[#71717b]">{description}</p>}
        </div>
      </div>

      <div className={cn('overflow-x-auto rounded-2xl border px-4 py-5 text-center', styles.soft, styles.border)}>
        <div className="min-w-fit text-2xl font-black leading-tight text-[#27272a] sm:text-3xl">{formula}</div>
      </div>

      {variables && variables.length > 0 && (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {variables.map((variable) => (
            <div key={`${String(variable.symbol)}-${String(variable.label)}`} className="rounded-xl border border-[#e4e4e7] bg-[#fbfbfc] px-3 py-2">
              <dt className={cn('text-sm font-black', styles.text)}>{variable.symbol}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#52525c]">{variable.label}</dd>
            </div>
          ))}
        </dl>
      )}

      {footer && <div className="mt-4 text-sm font-semibold leading-6 text-[#52525c]">{footer}</div>}
    </motion.section>
  )
}

export interface InteractivePanelProps {
  title: React.ReactNode
  children: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  status?: React.ReactNode
  accent?: Accent
  className?: string
  bodyClassName?: string
}

export function InteractivePanel({
  title,
  children,
  description,
  icon,
  toolbar,
  footer,
  status,
  accent = 'purple',
  className,
  bodyClassName,
}: InteractivePanelProps) {
  const styles = accentStyles[accent]

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={enterTransition}
      className={cn('overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white shadow-[0_10px_24px_rgba(24,24,27,0.06)]', className)}
    >
      <div className="flex flex-col gap-4 border-b border-[#e4e4e7] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border', styles.icon, styles.border)}>
            {icon ?? <Sparkles size={18} aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black leading-tight text-[#3f3f46]">{title}</h2>
            {description && <p className="mt-1 text-sm font-semibold leading-5 text-[#71717b]">{description}</p>}
          </div>
        </div>
        {(status || toolbar) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {status && (
              <span className={cn('inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-extrabold', styles.soft, styles.border, styles.text)}>
                {status}
              </span>
            )}
            {toolbar}
          </div>
        )}
      </div>
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-[#e4e4e7] bg-[#fbfbfc] px-4 py-3 text-sm font-semibold text-[#52525c]">{footer}</div>}
    </motion.section>
  )
}

export interface StepPagerStep {
  id?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  content: React.ReactNode
  complete?: boolean
}

export interface StepPagerProps {
  steps: StepPagerStep[]
  activeStep?: number
  defaultStep?: number
  onStepChange?: (stepIndex: number) => void
  nextLabel?: React.ReactNode
  previousLabel?: React.ReactNode
  completeLabel?: React.ReactNode
  accent?: Accent
  className?: string
}

export function StepPager({
  steps,
  activeStep,
  defaultStep = 0,
  onStepChange,
  nextLabel = 'Suivant',
  previousLabel = 'Retour',
  completeLabel = 'Termine',
  accent = 'purple',
  className,
}: StepPagerProps) {
  const styles = accentStyles[accent]
  const [internalStep, setInternalStep] = React.useState(defaultStep)
  const currentStep = Math.max(0, Math.min(steps.length - 1, activeStep ?? internalStep))
  const current = steps[currentStep]

  const setStep = React.useCallback(
    (nextStep: number) => {
      const boundedStep = Math.max(0, Math.min(steps.length - 1, nextStep))
      if (activeStep === undefined) {
        setInternalStep(boundedStep)
      }
      onStepChange?.(boundedStep)
    },
    [activeStep, onStepChange, steps.length],
  )

  if (!steps.length) {
    return null
  }

  return (
    <section className={cn('rounded-2xl border border-[#e4e4e7] bg-white p-4 shadow-[0_10px_24px_rgba(24,24,27,0.06)]', className)}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {steps.map((step, index) => {
          const isActive = index === currentStep
          return (
            <button
              key={step.id ?? index}
              type="button"
              onClick={() => setStep(index)}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4',
                isActive ? cn(styles.solid, 'border-transparent', styles.shadow) : 'border-[#e4e4e7] bg-[#fbfbfc] text-[#71717b] hover:bg-[#f4f4f5]',
                styles.ring,
              )}
            >
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full text-[11px]',
                  isActive ? 'bg-white/20 text-white' : step.complete ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#eceef4] text-[#71717b]',
                )}
              >
                {step.complete ? <Check size={12} aria-hidden="true" /> : index + 1}
              </span>
              {step.title}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="rounded-2xl border border-[#e4e4e7] bg-[#fbfbfc] p-4"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black leading-tight text-[#3f3f46]">{current.title}</h3>
              {current.subtitle && <p className="mt-1 text-sm font-semibold leading-5 text-[#71717b]">{current.subtitle}</p>}
            </div>
            <span className="text-xs font-extrabold text-[#9f9fa9]">
              {currentStep + 1}/{steps.length}
            </span>
          </div>
          <div>{current.content}</div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(currentStep - 1)}
          disabled={currentStep === 0}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e4e4e7] bg-white px-4 text-sm font-extrabold text-[#52525c] transition-colors hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {previousLabel}
        </button>
        <button
          type="button"
          onClick={() => setStep(currentStep + 1)}
          disabled={currentStep === steps.length - 1}
          className={cn('inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-extrabold transition-opacity disabled:cursor-not-allowed disabled:opacity-70', styles.solid)}
        >
          {currentStep === steps.length - 1 ? completeLabel : nextLabel}
          {currentStep === steps.length - 1 ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </div>
    </section>
  )
}

export interface AnimatedSliderMark {
  value: number
  label?: React.ReactNode
}

export interface AnimatedSliderProps {
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step?: number
  label?: React.ReactNode
  minLabel?: React.ReactNode
  maxLabel?: React.ReactNode
  marks?: AnimatedSliderMark[]
  formatValue?: (value: number) => React.ReactNode
  accent?: Accent
  disabled?: boolean
  className?: string
}

export function AnimatedSlider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  label,
  minLabel,
  maxLabel,
  marks,
  formatValue = (nextValue) => nextValue,
  accent = 'purple',
  disabled = false,
  className,
}: AnimatedSliderProps) {
  const styles = accentStyles[accent]
  const boundedValue = Math.max(min, Math.min(max, value))
  const range = max - min
  const percentage = range === 0 ? 0 : ((boundedValue - min) / range) * 100
  const ariaLabel = typeof label === 'string' ? label : 'Slider value'

  return (
    <div className={cn('rounded-2xl border border-[#e4e4e7] bg-white p-4 shadow-[0_8px_20px_rgba(24,24,27,0.055)]', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {label && <label className="text-sm font-black text-[#3f3f46]">{label}</label>}
        <motion.output
          key={boundedValue}
          initial={{ scale: 0.92, opacity: 0.72 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.16 }}
          className={cn('ml-auto rounded-full px-3 py-1 text-xs font-extrabold', styles.soft, styles.text)}
        >
          {formatValue(boundedValue)}
        </motion.output>
      </div>

      <input
        aria-label={ariaLabel}
        type="range"
        min={min}
        max={max}
        step={step}
        value={boundedValue}
        disabled={disabled}
        onChange={(event) => onValueChange(Number(event.currentTarget.value))}
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-full bg-[#eceef4] accent-[#453dee] outline-none transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
          styles.ring,
        )}
        style={{
          background: `linear-gradient(90deg, ${accent === 'yellow' ? '#f5a20b' : accent === 'blue' ? '#29aee4' : accent === 'green' ? '#16a34a' : '#453dee'} ${percentage}%, #eceef4 ${percentage}%)`,
        }}
      />

      <div className="mt-2 flex items-center justify-between text-xs font-bold text-[#9f9fa9]">
        <span>{minLabel ?? min}</span>
        <span>{maxLabel ?? max}</span>
      </div>

      {marks && marks.length > 0 && (
        <div className="relative mt-4 h-5">
          {marks.map((mark) => {
            const markPosition = range === 0 ? 0 : ((mark.value - min) / range) * 100
            return (
              <div
                key={mark.value}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
                style={{ left: `${Math.max(0, Math.min(100, markPosition))}%` }}
              >
                <span className={cn('h-2 w-2 rounded-full', boundedValue >= mark.value ? styles.fill : 'bg-[#d4d4d8]')} />
                {mark.label && <span className="whitespace-nowrap text-[11px] font-bold text-[#71717b]">{mark.label}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export interface SegmentedModeToggleOption<TValue extends string = string> {
  value: TValue
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SegmentedModeToggleProps<TValue extends string = string> {
  value: TValue
  options: SegmentedModeToggleOption<TValue>[]
  onValueChange: (value: TValue) => void
  ariaLabel?: string
  accent?: Accent
  className?: string
}

export function SegmentedModeToggle<TValue extends string = string>({
  value,
  options,
  onValueChange,
  ariaLabel = 'Mode',
  accent = 'purple',
  className,
}: SegmentedModeToggleProps<TValue>) {
  const styles = accentStyles[accent]

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full items-center gap-1 rounded-2xl border border-[#e4e4e7] bg-[#f4f4f5] p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'relative inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
              selected ? 'text-white' : 'text-[#71717b] hover:bg-white',
              styles.ring,
            )}
          >
            {selected && (
              <motion.span
                layoutId="animated-mode-toggle-pill"
                className={cn('absolute inset-0 rounded-xl', styles.solid, styles.shadow)}
                transition={enterTransition}
              />
            )}
            <span className="relative z-10 flex min-w-0 items-center gap-2">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
