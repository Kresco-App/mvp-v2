'use client'

import { useMemo, useState } from 'react'
import { Atom, Gauge, Minus, Plus, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import type { AnimatedLessonConfig, AnimatedRendererProps } from '../types'

type NumberBounds = {
  minZ?: number
  maxZ?: number
  minN?: number
  maxN?: number
}

type NucleusSource = NumberBounds & {
  title?: string
  subtitle?: string
  prompt?: string
  elementName?: string
  name?: string
  symbol?: string
  atomicNumber?: number
  protons?: number
  protonCount?: number
  neutrons?: number
  neutronCount?: number
  massNumber?: number
  charge?: string | number
  interactive?: boolean
  controls?: (NumberBounds & { enabled?: boolean }) | boolean
  keyPoints?: string[]
  facts?: string[]
  callout?: string
  lesson?: {
    keyPoints?: string[]
    facts?: string[]
    callout?: string
  }
  element?: Partial<NucleusSource>
  nucleus?: Partial<NucleusSource>
  notation?: {
    symbol?: string
    charge?: string | number
  }
}

type LegacyComplete = (correct: boolean) => void

export type NucleusCompositionRendererProps = Omit<AnimatedRendererProps, 'config' | 'onComplete'> & NucleusSource & {
  config?: AnimatedLessonConfig | NucleusSource | Record<string, unknown> | null
  config_json?: AnimatedLessonConfig | NucleusSource | Record<string, unknown> | null
  animatedConfig?: AnimatedLessonConfig | NucleusSource | Record<string, unknown> | null
  data?: NucleusSource | Record<string, unknown> | null
  activityData?: NucleusSource | Record<string, unknown> | null
  className?: string
  onComplete?: AnimatedRendererProps['onComplete'] | LegacyComplete
}

type ElementInfo = {
  symbol: string
  name: string
  typicalNeutrons: number
}

type Particle = {
  id: string
  type: 'proton' | 'neutron'
  x: number
  y: number
  size: number
  delay: number
}

const ELEMENTS: Record<number, ElementInfo> = {
  1: { symbol: 'H', name: 'Hydrogen', typicalNeutrons: 0 },
  2: { symbol: 'He', name: 'Helium', typicalNeutrons: 2 },
  3: { symbol: 'Li', name: 'Lithium', typicalNeutrons: 4 },
  4: { symbol: 'Be', name: 'Beryllium', typicalNeutrons: 5 },
  5: { symbol: 'B', name: 'Boron', typicalNeutrons: 6 },
  6: { symbol: 'C', name: 'Carbon', typicalNeutrons: 6 },
  7: { symbol: 'N', name: 'Nitrogen', typicalNeutrons: 7 },
  8: { symbol: 'O', name: 'Oxygen', typicalNeutrons: 8 },
  9: { symbol: 'F', name: 'Fluorine', typicalNeutrons: 10 },
  10: { symbol: 'Ne', name: 'Neon', typicalNeutrons: 10 },
  11: { symbol: 'Na', name: 'Sodium', typicalNeutrons: 12 },
  12: { symbol: 'Mg', name: 'Magnesium', typicalNeutrons: 12 },
  13: { symbol: 'Al', name: 'Aluminium', typicalNeutrons: 14 },
  14: { symbol: 'Si', name: 'Silicon', typicalNeutrons: 14 },
  15: { symbol: 'P', name: 'Phosphorus', typicalNeutrons: 16 },
  16: { symbol: 'S', name: 'Sulfur', typicalNeutrons: 16 },
  17: { symbol: 'Cl', name: 'Chlorine', typicalNeutrons: 18 },
  18: { symbol: 'Ar', name: 'Argon', typicalNeutrons: 22 },
  19: { symbol: 'K', name: 'Potassium', typicalNeutrons: 20 },
  20: { symbol: 'Ca', name: 'Calcium', typicalNeutrons: 20 },
}

const DEFAULT_CONFIG: Required<Pick<NucleusSource, 'title' | 'subtitle' | 'prompt' | 'callout'>> = {
  title: 'Nucleus composition',
  subtitle: 'Build an isotope by changing protons and neutrons.',
  prompt: 'Protons set the element. Neutrons set the isotope.',
  callout: 'Mass number A = protons Z + neutrons N.',
}

const DEFAULT_POINTS = [
  'Z counts protons and identifies the element.',
  'N counts neutrons and changes the isotope.',
  'A is the total number of nucleons inside the nucleus.',
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function numberFrom(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanFrom(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function arrayFrom(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function particleLayout(protons: number, neutrons: number): Particle[] {
  const visibleProtons = Math.min(protons, 24)
  const visibleNeutrons = Math.min(neutrons, 24)
  const total = visibleProtons + visibleNeutrons
  const particles: Particle[] = []
  const sequence: Particle['type'][] = []

  for (let i = 0; i < total; i += 1) {
    const protonShare = visibleProtons / Math.max(1, total)
    const expectedProtons = Math.round((i + 1) * protonShare)
    const currentProtons = sequence.filter((type) => type === 'proton').length
    sequence.push(currentProtons < expectedProtons && currentProtons < visibleProtons ? 'proton' : 'neutron')
  }

  let protonIndex = 0
  let neutronIndex = 0
  sequence.forEach((type, index) => {
    const ring = Math.floor(Math.sqrt(index))
    const ringStart = ring * ring
    const ringCount = Math.max(1, (ring + 1) * (ring + 1) - ringStart)
    const angle = ((index - ringStart) / ringCount) * Math.PI * 2 + ring * 0.72
    const radius = ring === 0 ? 0 : 12 + ring * 18
    const wobble = index % 2 === 0 ? 4 : -3
    const localIndex = type === 'proton' ? protonIndex++ : neutronIndex++

    particles.push({
      id: `${type}-${localIndex}`,
      type,
      x: Math.cos(angle) * radius + wobble,
      y: Math.sin(angle) * radius - wobble,
      size: 26 + ((index + ring) % 3) * 2,
      delay: index * 0.025,
    })
  })

  return particles
}

function lessonConfigToNucleusSource(config: unknown): Record<string, unknown> {
  const record = asRecord(config)
  const metadata = asRecord(record.metadata)
  const simulator = asRecord(record.simulator)

  return {
    ...record,
    ...asRecord(metadata.nucleus),
    ...asRecord(metadata.composition),
    ...asRecord(simulator.initial_state),
    title: record.title,
    subtitle: record.subtitle ?? record.description,
  }
}

function resolveSource(props: NucleusCompositionRendererProps) {
  const nested = [
    lessonConfigToNucleusSource(props.tab?.config_json),
    lessonConfigToNucleusSource(props.config),
    lessonConfigToNucleusSource(props.config_json),
    lessonConfigToNucleusSource(props.animatedConfig),
    asRecord(props.activityData),
    asRecord(props.data),
    asRecord(props),
  ]

  const merged = nested.reduce<Record<string, unknown>>((acc, item) => ({ ...acc, ...item }), {})
  const element = asRecord(merged.element)
  const nucleus = asRecord(merged.nucleus)
  const notation = asRecord(merged.notation)
  const controls = typeof merged.controls === 'object' ? asRecord(merged.controls) : {}

  return { merged, element, nucleus, notation, controls }
}

function stabilityLabel(protons: number, neutrons: number) {
  if (protons <= 2) {
    return Math.abs(protons - neutrons) <= 1 ? 'balanced light nucleus' : 'unusual light isotope'
  }

  const ratio = neutrons / protons
  if (ratio < 0.82) return 'proton-rich isotope'
  if (ratio > 1.55) return 'neutron-rich isotope'
  return 'balanced composition'
}

export default function NucleusCompositionRenderer(props: NucleusCompositionRendererProps) {
  const { merged, element, nucleus, notation, controls } = resolveSource(props)

  const initialAtomicNumber = numberFrom(
    nucleus.protons ?? nucleus.protonCount ?? element.atomicNumber ?? element.protons ?? merged.atomicNumber ?? merged.protons ?? merged.protonCount,
    6
  )
  const elementInfo = ELEMENTS[clamp(Math.round(initialAtomicNumber), 1, 20)] ?? ELEMENTS[6]
  const initialNeutrons = numberFrom(
    nucleus.neutrons ?? nucleus.neutronCount ?? element.neutrons ?? merged.neutrons ?? merged.neutronCount,
    elementInfo.typicalNeutrons + 2
  )

  const minZ = clamp(Math.round(numberFrom(controls.minZ ?? merged.minZ, 1)), 1, 20)
  const maxZ = clamp(Math.round(numberFrom(controls.maxZ ?? merged.maxZ, 20)), minZ, 20)
  const minN = clamp(Math.round(numberFrom(controls.minN ?? merged.minN, 0)), 0, 32)
  const maxN = clamp(Math.round(numberFrom(controls.maxN ?? merged.maxN, 28)), minN, 40)
  const interactive = typeof merged.controls === 'boolean'
    ? merged.controls
    : booleanFrom(controls.enabled ?? merged.interactive, true)

  const [protons, setProtons] = useState(() => clamp(Math.round(initialAtomicNumber), minZ, maxZ))
  const [neutrons, setNeutrons] = useState(() => clamp(Math.round(initialNeutrons), minN, maxN))

  const activeElement = ELEMENTS[protons] ?? {
    symbol: stringFrom(element.symbol ?? nucleus.symbol ?? notation.symbol ?? merged.symbol, 'X'),
    name: stringFrom(element.name ?? element.elementName ?? nucleus.name ?? nucleus.elementName ?? merged.elementName ?? merged.name, 'Element'),
    typicalNeutrons: neutrons,
  }

  const symbol = stringFrom(notation.symbol ?? nucleus.symbol ?? element.symbol ?? merged.symbol, activeElement.symbol)
  const elementName = stringFrom(
    nucleus.name ?? nucleus.elementName ?? element.name ?? element.elementName ?? merged.elementName ?? merged.name,
    activeElement.name
  )
  const chargeValue = notation.charge ?? nucleus.charge ?? element.charge ?? merged.charge
  const charge = typeof chargeValue === 'number' ? `${chargeValue > 0 ? '+' : ''}${chargeValue}` : stringFrom(chargeValue, '0')
  const massNumber = protons + neutrons
  const remainingParticles = Math.max(0, protons + neutrons - 48)
  const points = arrayFrom(merged.keyPoints ?? merged.facts ?? asRecord(merged.lesson).keyPoints ?? asRecord(merged.lesson).facts, DEFAULT_POINTS)

  const particles = useMemo(() => particleLayout(protons, neutrons), [protons, neutrons])

  function reset() {
    setProtons(clamp(Math.round(initialAtomicNumber), minZ, maxZ))
    setNeutrons(clamp(Math.round(initialNeutrons), minN, maxN))
  }

  function completeLesson() {
    if (!props.onComplete) return

    props.onComplete({
      completed: true,
      score: 100,
      reason: 'nucleus_composition_viewed',
      metadata: {
        protons,
        neutrons,
        massNumber,
        symbol,
      },
    } as never)
  }

  return (
    <section
      className={cn(
        'w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm',
        props.className
      )}
      aria-label="Nucleus composition lesson"
    >
      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-slate-200 bg-[#f7fbff] p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-sky-200 bg-white px-3 py-1 text-xs font-bold text-sky-700">
                <Atom size={14} aria-hidden="true" />
                Atomic structure
              </div>
              <h2 className="m-0 text-2xl font-black text-slate-950 sm:text-3xl">
                {stringFrom(merged.title, DEFAULT_CONFIG.title)}
              </h2>
              <p className="m-0 mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">
                {stringFrom(merged.subtitle ?? merged.prompt, DEFAULT_CONFIG.subtitle)}
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset
            </button>
          </div>

          <div className="relative mx-auto flex aspect-square max-h-[430px] min-h-[300px] max-w-[430px] items-center justify-center rounded-lg border border-slate-200 bg-white">
            <div className="absolute inset-6 rounded-full border border-dashed border-slate-200" />
            <div className="absolute inset-14 rounded-full border border-dashed border-sky-200" />
            <motion.div
              className="relative h-56 w-56 rounded-full border border-slate-200 bg-[#f8fafc]"
              animate={{ rotate: 360 }}
              transition={{ duration: 44, repeat: Infinity, ease: 'linear' }}
              aria-hidden="true"
            >
              {particles.map((particle) => (
                <motion.span
                  key={particle.id}
                  className={cn(
                    'absolute left-1/2 top-1/2 grid place-items-center rounded-full border text-[10px] font-black shadow-sm',
                    particle.type === 'proton'
                      ? 'border-rose-200 bg-rose-500 text-white'
                      : 'border-sky-200 bg-sky-500 text-white'
                  )}
                  style={{
                    width: particle.size,
                    height: particle.size,
                    marginLeft: -particle.size / 2,
                    marginTop: -particle.size / 2,
                  }}
                  initial={{ opacity: 0, scale: 0.6, x: particle.x, y: particle.y }}
                  animate={{ opacity: 1, scale: 1, x: particle.x, y: particle.y }}
                  transition={{ delay: particle.delay, type: 'spring', stiffness: 220, damping: 18 }}
                >
                  {particle.type === 'proton' ? 'p+' : 'n'}
                </motion.span>
              ))}
            </motion.div>
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap justify-center gap-2">
              <span className="rounded-md border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
                {protons} protons
              </span>
              <span className="rounded-md border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                {neutrons} neutrons
              </span>
              {remainingParticles > 0 && (
                <span className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600">
                  +{remainingParticles} more
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid content-start gap-4 p-4 sm:p-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-xs font-black uppercase text-slate-500">Symbolic notation</p>
                <p className="m-0 mt-1 text-sm font-semibold text-slate-600">{elementName}-{massNumber}</p>
              </div>
              <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                {stabilityLabel(protons, neutrons)}
              </span>
            </div>

            <div className="mt-5 flex items-center justify-center">
              <div className="grid grid-cols-[auto_auto_auto] items-center gap-x-2">
                <div className="grid justify-items-end text-right font-black text-slate-700">
                  <span className="text-lg leading-5">{massNumber}</span>
                  <span className="text-lg leading-5">{protons}</span>
                </div>
                <div className="text-7xl font-black leading-none text-slate-950">{symbol}</div>
                <div className="self-start pt-2 text-lg font-black text-slate-600">{charge}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <Metric label="Z" value={protons} tone="rose" />
              <Metric label="N" value={neutrons} tone="sky" />
              <Metric label="A" value={massNumber} tone="emerald" />
            </div>
          </div>

          {interactive && (
            <div className="rounded-lg border border-slate-200 bg-[#fcfcfd] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Gauge size={16} className="text-slate-600" aria-hidden="true" />
                <p className="m-0 text-sm font-black text-slate-800">Composition controls</p>
              </div>
              <Control
                label="Protons"
                value={protons}
                min={minZ}
                max={maxZ}
                onChange={setProtons}
                tone="rose"
              />
              <Control
                label="Neutrons"
                value={neutrons}
                min={minN}
                max={maxN}
                onChange={setNeutrons}
                tone="sky"
              />
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white">
            <p className="m-0 text-sm font-black text-white">{stringFrom(merged.callout ?? asRecord(merged.lesson).callout, DEFAULT_CONFIG.callout)}</p>
            <ul className="m-0 mt-3 grid gap-2 p-0">
              {points.slice(0, 4).map((point) => (
                <li key={point} className="flex gap-2 text-sm font-semibold leading-6 text-slate-300">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-emerald-400" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {props.onComplete && (
            <button
              type="button"
              onClick={completeLesson}
              className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Mark lesson complete
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'sky' | 'emerald' }) {
  const classes = {
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  }

  return (
    <div className={cn('rounded-md border p-3', classes[tone])}>
      <p className="m-0 text-xs font-black">{label}</p>
      <p className="m-0 mt-1 text-2xl font-black">{value}</p>
    </div>
  )
}

function Control({
  label,
  value,
  min,
  max,
  tone,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  tone: 'rose' | 'sky'
  onChange: (value: number) => void
}) {
  const accent = tone === 'rose' ? 'accent-rose-500' : 'accent-sky-500'

  function step(delta: number) {
    onChange(clamp(value + delta, min, max))
  }

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-sm font-black text-slate-700" htmlFor={`nucleus-${label}`}>
          {label}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300"
            aria-label={`Decrease ${label.toLowerCase()}`}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className="grid h-8 min-w-10 place-items-center rounded-md bg-white px-3 text-sm font-black text-slate-950">
            {value}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300"
            aria-label={`Increase ${label.toLowerCase()}`}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <input
        id={`nucleus-${label}`}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn('h-2 w-full cursor-pointer rounded-md', accent)}
      />
      <div className="mt-1 flex justify-between text-xs font-bold text-slate-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}
