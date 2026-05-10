import type {
  ComponentType,
} from 'react'
import type {
  AnimatedLessonConfig,
  AnimatedRendererComponent,
  AnimatedRendererKey,
  AnimatedRendererProps,
  AnimatedRendererRegistry,
} from './types'
import NucleusCompositionRenderer from './renderers/NucleusCompositionRenderer'
import WavePeriodicityRenderer from './renderers/WavePeriodicityRenderer'

export const ANIMATED_FALLBACK_RENDERER_KEY = 'fallback'

function normalizeRendererKey(rendererKey?: AnimatedRendererKey | null) {
  return rendererKey?.trim() || ANIMATED_FALLBACK_RENDERER_KEY
}

function isLessonConfig(value: unknown): value is AnimatedLessonConfig {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function resolveConfig(props: AnimatedRendererProps): AnimatedLessonConfig {
  const tabConfig = isLessonConfig(props.tab?.config_json) ? props.tab.config_json : undefined
  const config = props.config ?? tabConfig

  return {
    ...(config ?? {}),
    renderer_key: props.rendererKey ?? config?.renderer_key ?? props.tab?.renderer_key ?? props.item?.renderer_key,
    title: config?.title ?? props.tab?.label ?? props.item?.title,
    description: config?.description ?? props.tab?.content ?? props.item?.description,
  }
}

function adaptAnimatedRenderer(Renderer: ComponentType<any>): AnimatedRendererComponent {
  return function AdaptedAnimatedRenderer(props: AnimatedRendererProps) {
    const config = resolveConfig(props)

    return (
      <Renderer
        {...config}
        config={config}
        config_json={config}
        animatedConfig={config}
        activityData={config}
        className={props.className}
        onComplete={(payload: unknown) => {
          if (payload && typeof payload === 'object' && 'completed' in payload) {
            props.onComplete?.(payload as Parameters<NonNullable<AnimatedRendererProps['onComplete']>>[0])
            return
          }

          props.onComplete?.({ completed: Boolean(payload), reason: 'renderer_complete' })
        }}
      />
    )
  }
}

export function FallbackAnimatedRenderer(props: AnimatedRendererProps) {
  const config = resolveConfig(props)
  const rendererKey = normalizeRendererKey(config.renderer_key)
  const blockCount = config.blocks?.length ?? 0
  const cardCount = config.cards?.length ?? 0
  const formulaCount = config.formulas?.length ?? 0
  const stepCount = config.steps?.length ?? 0
  const hasSimulator = Boolean(config.simulator)

  return (
    <section className={props.className}>
      <div className="rounded-2xl border border-[#d4e8f2] bg-[#f7fbfd] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {config.chapter && (
              <p className="m-0 text-xs font-black uppercase tracking-[0.08em] text-[#1292cf]">
                {config.chapter}
              </p>
            )}
            <h3 className="m-0 mt-1 text-lg font-black text-[#1f2933]">
              {config.title || 'Animated lesson'}
            </h3>
            {config.subtitle && (
              <p className="m-0 mt-1 text-sm font-bold text-[#517487]">{config.subtitle}</p>
            )}
          </div>
          <span className="rounded-full border border-[#b7dcec] bg-white px-3 py-1 text-xs font-black text-[#1292cf]">
            {rendererKey}
          </span>
        </div>

        {config.description && (
          <p className="m-0 mt-4 whitespace-pre-line text-sm font-semibold leading-6 text-[#4b606b]">
            {config.description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2 text-xs font-black text-[#517487]">
          {blockCount > 0 && <span className="rounded-full bg-white px-3 py-1">{blockCount} blocks</span>}
          {cardCount > 0 && <span className="rounded-full bg-white px-3 py-1">{cardCount} cards</span>}
          {formulaCount > 0 && <span className="rounded-full bg-white px-3 py-1">{formulaCount} formulas</span>}
          {stepCount > 0 && <span className="rounded-full bg-white px-3 py-1">{stepCount} steps</span>}
          {hasSimulator && <span className="rounded-full bg-white px-3 py-1">simulator</span>}
          {blockCount + cardCount + formulaCount + stepCount === 0 && !hasSimulator && (
            <span className="rounded-full bg-white px-3 py-1">fallback shell</span>
          )}
        </div>
      </div>
    </section>
  )
}

export const animatedRendererRegistry: AnimatedRendererRegistry = {
  [ANIMATED_FALLBACK_RENDERER_KEY]: FallbackAnimatedRenderer,
  animated_lesson: FallbackAnimatedRenderer,
  structured_lesson: FallbackAnimatedRenderer,
  interactive_component: FallbackAnimatedRenderer,
  continuity_graph_lab: FallbackAnimatedRenderer,
  wave_simulator: FallbackAnimatedRenderer,
  wave_periodicity: adaptAnimatedRenderer(WavePeriodicityRenderer),
  wave_periodicity_renderer: adaptAnimatedRenderer(WavePeriodicityRenderer),
  periodicite_interactive_course: adaptAnimatedRenderer(WavePeriodicityRenderer),
  nucleus_composition: adaptAnimatedRenderer(NucleusCompositionRenderer),
  nucleus_composition_renderer: adaptAnimatedRenderer(NucleusCompositionRenderer),
  nucleus_composition_interactive_course: adaptAnimatedRenderer(NucleusCompositionRenderer),
}

export function registerAnimatedRenderer(rendererKey: AnimatedRendererKey, component: AnimatedRendererComponent) {
  animatedRendererRegistry[normalizeRendererKey(rendererKey)] = component
}

export function getAnimatedRenderer(rendererKey?: AnimatedRendererKey | null) {
  return animatedRendererRegistry[normalizeRendererKey(rendererKey)] ?? FallbackAnimatedRenderer
}

export function hasAnimatedRenderer(rendererKey?: AnimatedRendererKey | null) {
  return normalizeRendererKey(rendererKey) in animatedRendererRegistry
}

export function AnimatedContentRenderer(props: AnimatedRendererProps) {
  const Renderer = getAnimatedRenderer(props.rendererKey ?? props.config?.renderer_key ?? props.tab?.renderer_key ?? props.item?.renderer_key)

  return <Renderer {...props} />
}
