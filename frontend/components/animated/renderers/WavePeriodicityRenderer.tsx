'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  Timer,
  Waves,
  Zap,
} from 'lucide-react'

type WaveMode = 'spatial' | 'temporal'
const waveButtonMotion = 'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'
const waveModeButtonMotion = 'transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'

type NumericRange = {
  min?: number
  max?: number
  step?: number
}

export type WavePeriodicityRendererConfig = {
  title?: string
  subtitle?: string
  mode?: WaveMode
  initialMode?: WaveMode
  amplitude?: number
  frequency?: number
  frequencyHz?: number
  wavelength?: number
  wavelengthPx?: number
  frequencyRange?: NumericRange
  wavelengthRange?: NumericRange
  labels?: {
    spatial?: string
    temporal?: string
    frequency?: string
    wavelength?: string
    amplitude?: string
    speed?: string
    period?: string
  }
  callouts?: {
    wavelength?: string
    period?: string
    amplitude?: string
    relation?: string
  }
}

type RendererProps = {
  config?: WavePeriodicityRendererConfig | Record<string, unknown>
  config_json?: WavePeriodicityRendererConfig | Record<string, unknown>
  animatedConfig?: WavePeriodicityRendererConfig | Record<string, unknown>
  activityData?: WavePeriodicityRendererConfig | Record<string, unknown>
  data?: WavePeriodicityRendererConfig | Record<string, unknown>
  title?: string
  subtitle?: string
  className?: string
  onComplete?: (correct: boolean) => void
}

type NormalizedLabels = {
  spatial: string
  temporal: string
  frequency: string
  wavelength: string
  amplitude: string
  speed: string
  period: string
}

type NormalizedCallouts = {
  wavelength: string
  period: string
  amplitude: string
  relation: string
}

type NormalizedConfig = {
  title: string
  subtitle: string
  labels: NormalizedLabels
  callouts: NormalizedCallouts
  initialMode: WaveMode
  amplitude: number
  frequency: number
  wavelength: number
  frequencyRange: Required<NumericRange>
  wavelengthRange: Required<NumericRange>
}

const TAU = Math.PI * 2
const VIEWBOX_WIDTH = 760
const VIEWBOX_HEIGHT = 360
const PLOT = {
  left: 54,
  right: 720,
  top: 42,
  bottom: 294,
}

const DEFAULT_CONFIG: NormalizedConfig = {
  title: 'Periodicite des ondes',
  subtitle: 'Compare la periodicite spatiale (longueur d onde) et temporelle (periode).',
  initialMode: 'spatial',
  amplitude: 56,
  frequency: 1.6,
  wavelength: 190,
  frequencyRange: { min: 0.4, max: 4, step: 0.1 },
  wavelengthRange: { min: 90, max: 320, step: 5 },
  labels: {
    spatial: 'Espace',
    temporal: 'Temps',
    frequency: 'Frequence',
    wavelength: 'Longueur d onde',
    amplitude: 'Amplitude',
    speed: 'Celerite',
    period: 'Periode',
  },
  callouts: {
    wavelength: 'Distance entre deux cretes successives',
    period: 'Duree d une oscillation complete',
    amplitude: 'Ecart maximal a la position d equilibre',
    relation: 'v = lambda x f',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function modeFrom(value: unknown): WaveMode | undefined {
  return value === 'spatial' || value === 'temporal' ? value : undefined
}

function rangeFrom(value: unknown, fallback: Required<NumericRange>): Required<NumericRange> {
  if (!isRecord(value)) return fallback

  return {
    min: numberFrom(value.min) ?? fallback.min,
    max: numberFrom(value.max) ?? fallback.max,
    step: numberFrom(value.step) ?? fallback.step,
  }
}

function nestedConfigFrom(source: unknown): Record<string, unknown> {
  if (!isRecord(source)) return {}

  const candidates = [
    source,
    source.animatedConfig,
    source.animated_config,
    source.animation,
    source.rendererConfig,
    source.renderer_config,
    source.periodicity,
    source.wavePeriodicity,
    source.wave_periodicity,
  ]

  return candidates.reduce<Record<string, unknown>>((acc, candidate) => {
    if (!isRecord(candidate)) return acc
    return { ...acc, ...candidate }
  }, {})
}

function normalizeConfig(props: RendererProps): NormalizedConfig {
  const merged = {
    ...nestedConfigFrom(props.data),
    ...nestedConfigFrom(props.activityData),
    ...nestedConfigFrom(props.config_json),
    ...nestedConfigFrom(props.config),
    ...nestedConfigFrom(props.animatedConfig),
  }

  const labels = isRecord(merged.labels) ? merged.labels : {}
  const callouts = isRecord(merged.callouts) ? merged.callouts : {}
  const frequencyRange = rangeFrom(merged.frequencyRange ?? merged.frequency_range, DEFAULT_CONFIG.frequencyRange)
  const wavelengthRange = rangeFrom(merged.wavelengthRange ?? merged.wavelength_range, DEFAULT_CONFIG.wavelengthRange)

  return {
    title: props.title ?? stringFrom(merged.title) ?? DEFAULT_CONFIG.title,
    subtitle: props.subtitle ?? stringFrom(merged.subtitle) ?? DEFAULT_CONFIG.subtitle,
    initialMode: modeFrom(merged.initialMode) ?? modeFrom(merged.initial_mode) ?? modeFrom(merged.mode) ?? DEFAULT_CONFIG.initialMode,
    amplitude: numberFrom(merged.amplitude) ?? DEFAULT_CONFIG.amplitude,
    frequency: numberFrom(merged.frequency) ?? numberFrom(merged.frequencyHz) ?? numberFrom(merged.frequency_hz) ?? DEFAULT_CONFIG.frequency,
    wavelength: numberFrom(merged.wavelength) ?? numberFrom(merged.wavelengthPx) ?? numberFrom(merged.wavelength_px) ?? DEFAULT_CONFIG.wavelength,
    frequencyRange,
    wavelengthRange,
    labels: {
      spatial: stringFrom(labels.spatial) ?? DEFAULT_CONFIG.labels.spatial,
      temporal: stringFrom(labels.temporal) ?? DEFAULT_CONFIG.labels.temporal,
      frequency: stringFrom(labels.frequency) ?? DEFAULT_CONFIG.labels.frequency,
      wavelength: stringFrom(labels.wavelength) ?? DEFAULT_CONFIG.labels.wavelength,
      amplitude: stringFrom(labels.amplitude) ?? DEFAULT_CONFIG.labels.amplitude,
      speed: stringFrom(labels.speed) ?? DEFAULT_CONFIG.labels.speed,
      period: stringFrom(labels.period) ?? DEFAULT_CONFIG.labels.period,
    },
    callouts: {
      wavelength: stringFrom(callouts.wavelength) ?? DEFAULT_CONFIG.callouts.wavelength,
      period: stringFrom(callouts.period) ?? DEFAULT_CONFIG.callouts.period,
      amplitude: stringFrom(callouts.amplitude) ?? DEFAULT_CONFIG.callouts.amplitude,
      relation: stringFrom(callouts.relation) ?? DEFAULT_CONFIG.callouts.relation,
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function buildWavePath({
  mode,
  amplitude,
  frequency,
  wavelength,
  elapsed,
}: {
  mode: WaveMode
  amplitude: number
  frequency: number
  wavelength: number
  elapsed: number
}): string {
  const plotWidth = PLOT.right - PLOT.left
  const midY = (PLOT.top + PLOT.bottom) / 2
  const points = 170

  return Array.from({ length: points + 1 }, (_, index) => {
    const progress = index / points
    const x = PLOT.left + progress * plotWidth
    const phase =
      mode === 'spatial'
        ? (progress * plotWidth) / wavelength - frequency * elapsed
        : progress * 2.75 - frequency * elapsed
    const y = midY - amplitude * Math.sin(TAU * phase)

    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function ControlSlider({
  icon,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-slate-800">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-mono text-xs text-slate-500">{display}</span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-cyan-600"
      />
    </label>
  )
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tone}`}>{icon}</span>
        {label}
      </div>
      <p className="m-0 font-mono text-lg font-black text-slate-900">{value}</p>
    </div>
  )
}

export default function WavePeriodicityRenderer(props: RendererProps) {
  const normalized = useMemo(() => normalizeConfig(props), [props])
  const [mode, setMode] = useState<WaveMode>(normalized.initialMode)
  const [frequency, setFrequency] = useState(() =>
    clamp(normalized.frequency, normalized.frequencyRange.min, normalized.frequencyRange.max),
  )
  const [wavelength, setWavelength] = useState(() =>
    clamp(normalized.wavelength, normalized.wavelengthRange.min, normalized.wavelengthRange.max),
  )
  const [isPlaying, setIsPlaying] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const frameRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)

  useEffect(() => {
    setMode(normalized.initialMode)
    setFrequency(clamp(normalized.frequency, normalized.frequencyRange.min, normalized.frequencyRange.max))
    setWavelength(clamp(normalized.wavelength, normalized.wavelengthRange.min, normalized.wavelengthRange.max))
  }, [normalized])

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (lastFrameRef.current === null) lastFrameRef.current = timestamp
      const deltaSeconds = (timestamp - lastFrameRef.current) / 1000
      lastFrameRef.current = timestamp

      if (isPlaying) {
        setElapsed((current) => (current + Math.min(deltaSeconds, 0.04)) % 1000)
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      lastFrameRef.current = null
    }
  }, [isPlaying])

  const amplitude = clamp(normalized.amplitude, 28, 82)
  const period = 1 / frequency
  const speed = frequency * wavelength
  const wavePath = buildWavePath({ mode, amplitude, frequency, wavelength, elapsed })
  const plotWidth = PLOT.right - PLOT.left
  const midY = (PLOT.top + PLOT.bottom) / 2
  const markerX = PLOT.left + plotWidth * 0.62
  const markerPhase = mode === 'spatial' ? ((markerX - PLOT.left) / wavelength) - frequency * elapsed : 1.55 - frequency * elapsed
  const markerY = midY - amplitude * Math.sin(TAU * markerPhase)
  const wavelengthEnd = Math.min(PLOT.left + wavelength, PLOT.right)
  const periodEnd = PLOT.left + plotWidth / 2.75
  const measureY = PLOT.bottom + 26

  const reset = () => {
    setFrequency(clamp(normalized.frequency, normalized.frequencyRange.min, normalized.frequencyRange.max))
    setWavelength(clamp(normalized.wavelength, normalized.wavelengthRange.min, normalized.wavelengthRange.max))
    setElapsed(0)
  }

  return (
    <section className={`w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-950 shadow-sm ${props.className ?? ''}`}>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 border-b border-slate-200 bg-white p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-cyan-700">
                <Waves size={16} />
                Onde sinusoidale
              </div>
              <h3 className="m-0 text-xl font-black text-slate-950 sm:text-2xl">{normalized.title}</h3>
              <p className="m-0 mt-1 max-w-2xl text-sm leading-6 text-slate-600">{normalized.subtitle}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying((value) => !value)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm ${waveButtonMotion} hover:border-cyan-300 hover:text-cyan-700`}
                aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button
                type="button"
                onClick={reset}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm ${waveButtonMotion} hover:border-amber-300 hover:text-amber-700`}
                aria-label="Reset controls"
                title="Reset"
              >
                <RotateCcw size={17} />
              </button>
            </div>
          </div>

          <div className="mb-4 inline-grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {(['spatial', 'temporal'] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                onClick={() => setMode(nextMode)}
                className={`h-9 rounded-md px-4 text-sm font-black ${waveModeButtonMotion} ${
                  mode === nextMode
                    ? 'bg-white text-cyan-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {nextMode === 'spatial' ? normalized.labels.spatial : normalized.labels.temporal}
              </button>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <svg
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
              role="img"
              aria-label="Animated wave periodicity visualization"
              className="block aspect-[19/9] w-full min-h-[250px]"
            >
              <defs>
                <linearGradient id="wave-periodicity-line" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="55%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <filter id="wave-periodicity-glow" x="-20%" y="-80%" width="140%" height="260%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="#020617" />
              {Array.from({ length: 14 }, (_, index) => {
                const x = PLOT.left + index * 52
                return <line key={`x-${index}`} x1={x} x2={x} y1={PLOT.top} y2={PLOT.bottom} stroke="#1e293b" strokeWidth="1" />
              })}
              {Array.from({ length: 6 }, (_, index) => {
                const y = PLOT.top + index * 50
                return <line key={`y-${index}`} x1={PLOT.left} x2={PLOT.right} y1={y} y2={y} stroke="#1e293b" strokeWidth="1" />
              })}

              <line x1={PLOT.left} x2={PLOT.right} y1={midY} y2={midY} stroke="#64748b" strokeDasharray="8 7" />
              <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.bottom} stroke="#334155" />
              <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="#334155" />

              <path d={wavePath} fill="none" stroke="#0e7490" strokeWidth="10" opacity="0.22" />
              <path d={wavePath} fill="none" stroke="url(#wave-periodicity-line)" strokeWidth="4" filter="url(#wave-periodicity-glow)" />

              <line x1={markerX} x2={markerX} y1={PLOT.top + 8} y2={PLOT.bottom} stroke="#f59e0b" strokeDasharray="6 6" opacity="0.78" />
              <circle cx={markerX} cy={markerY} r="7" fill="#f8fafc" stroke="#f59e0b" strokeWidth="3" />

              <line x1={PLOT.left + 22} x2={PLOT.left + 22} y1={midY} y2={midY - amplitude} stroke="#34d399" strokeWidth="3" />
              <path d={`M ${PLOT.left + 14} ${midY} L ${PLOT.left + 30} ${midY} M ${PLOT.left + 14} ${midY - amplitude} L ${PLOT.left + 30} ${midY - amplitude}`} stroke="#34d399" strokeWidth="3" />
              <text x={PLOT.left + 36} y={midY - amplitude / 2 + 4} fill="#a7f3d0" fontSize="14" fontWeight="800">
                A
              </text>

              {mode === 'spatial' ? (
                <>
                  <line x1={PLOT.left} x2={wavelengthEnd} y1={measureY} y2={measureY} stroke="#fbbf24" strokeWidth="3" />
                  <path d={`M ${PLOT.left} ${measureY - 9} L ${PLOT.left} ${measureY + 9} M ${wavelengthEnd} ${measureY - 9} L ${wavelengthEnd} ${measureY + 9}`} stroke="#fbbf24" strokeWidth="3" />
                  <text x={(PLOT.left + wavelengthEnd) / 2} y={measureY + 25} fill="#fde68a" fontSize="15" fontWeight="900" textAnchor="middle">
                    lambda
                  </text>
                </>
              ) : (
                <>
                  <line x1={PLOT.left} x2={periodEnd} y1={measureY} y2={measureY} stroke="#fbbf24" strokeWidth="3" />
                  <path d={`M ${PLOT.left} ${measureY - 9} L ${PLOT.left} ${measureY + 9} M ${periodEnd} ${measureY - 9} L ${periodEnd} ${measureY + 9}`} stroke="#fbbf24" strokeWidth="3" />
                  <text x={(PLOT.left + periodEnd) / 2} y={measureY + 25} fill="#fde68a" fontSize="15" fontWeight="900" textAnchor="middle">
                    T
                  </text>
                </>
              )}

              <text x={PLOT.left} y={24} fill="#cbd5e1" fontSize="13" fontWeight="800">
                {mode === 'spatial' ? 'Deplacement y(x) a un instant donne' : 'Oscillation y(t) en un point fixe'}
              </text>
              <text x={PLOT.right} y={24} fill="#94a3b8" fontSize="12" fontWeight="700" textAnchor="end">
                {mode === 'spatial' ? 'axe x' : 'axe t'}
              </text>
            </svg>
          </div>
        </div>

        <aside className="bg-slate-50 p-4 sm:p-5">
          <div className="grid gap-3">
            <MetricCard
              icon={<Timer size={15} />}
              label={normalized.labels.period}
              value={`${period.toFixed(2)} s`}
              tone="bg-cyan-100 text-cyan-700"
            />
            <MetricCard
              icon={<Zap size={15} />}
              label={normalized.labels.speed}
              value={`${Math.round(speed)} u/s`}
              tone="bg-amber-100 text-amber-700"
            />
          </div>

          <div className="mt-4 grid gap-3">
            <ControlSlider
              icon={<Activity size={16} />}
              label={normalized.labels.frequency}
              value={frequency}
              min={normalized.frequencyRange.min}
              max={normalized.frequencyRange.max}
              step={normalized.frequencyRange.step}
              display={`${frequency.toFixed(1)} Hz`}
              onChange={setFrequency}
            />
            <ControlSlider
              icon={<Ruler size={16} />}
              label={normalized.labels.wavelength}
              value={wavelength}
              min={normalized.wavelengthRange.min}
              max={normalized.wavelengthRange.max}
              step={normalized.wavelengthRange.step}
              display={`${Math.round(wavelength)} u`}
              onChange={setWavelength}
            />
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            <p className="m-0 font-bold text-slate-900">
              {mode === 'spatial' ? normalized.callouts.wavelength : normalized.callouts.period}
            </p>
            <p className="m-0 mt-2">{normalized.callouts.amplitude}</p>
            <p className="m-0 mt-3 rounded-md bg-slate-100 px-3 py-2 font-mono text-xs font-black text-slate-700">
              {normalized.callouts.relation}
            </p>
          </div>

          {props.onComplete && (
            <button
              type="button"
              onClick={() => props.onComplete?.(true)}
              className={`mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-cyan-700 px-4 text-sm font-black text-white ${waveButtonMotion} hover:bg-cyan-800`}
            >
              Terminer
            </button>
          )}
        </aside>
      </div>
    </section>
  )
}
