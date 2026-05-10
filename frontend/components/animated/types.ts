import type { ComponentType } from 'react'

export type AnimatedRendererKey = string

export type AnimatedJsonPrimitive = string | number | boolean | null
export type AnimatedJsonValue =
  | AnimatedJsonPrimitive
  | AnimatedJsonValue[]
  | { [key: string]: AnimatedJsonValue }

export type AnimatedAccentColors = {
  primary?: string
  secondary?: string
  background?: string
  surface?: string
  text?: string
  muted?: string
  success?: string
  warning?: string
  danger?: string
}

export type AnimatedMedia = {
  src: string
  alt?: string
  kind?: 'image' | 'video' | 'animation' | 'embed'
  caption?: string
  aspect_ratio?: string
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedCard = {
  id?: string
  title: string
  subtitle?: string
  body?: string
  badge?: string
  icon?: string
  media?: AnimatedMedia
  accent_color?: string
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedFormula = {
  id?: string
  label?: string
  latex: string
  description?: string
  variables?: Array<{
    symbol: string
    label: string
    unit?: string
    description?: string
  }>
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedStep = {
  id?: string
  title: string
  body?: string
  formula?: AnimatedFormula
  media?: AnimatedMedia
  hint?: string
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedSimulatorControl = {
  id: string
  label: string
  kind: 'slider' | 'stepper' | 'toggle' | 'select' | 'radio' | 'number'
  value?: string | number | boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: Array<{
    label: string
    value: string | number | boolean
  }>
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedSimulatorConfig = {
  simulator_key: string
  title?: string
  subtitle?: string
  description?: string
  controls?: AnimatedSimulatorControl[]
  initial_state?: Record<string, AnimatedJsonValue>
  targets?: Array<{
    id: string
    label: string
    value?: AnimatedJsonValue
  }>
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedCta = {
  label: string
  href?: string
  action?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedPagerMetadata = {
  current?: number
  total?: number
  previous_label?: string
  next_label?: string
  previous_href?: string
  next_href?: string
  can_skip?: boolean
  completion_policy?: 'view' | 'manual' | 'quiz_pass' | 'simulator_target' | string
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedContentBlockBase = {
  id?: string
  title?: string
  subtitle?: string
  accent_color?: string
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedTextBlock = AnimatedContentBlockBase & {
  type: 'text'
  body: string
}

export type AnimatedHeadingBlock = AnimatedContentBlockBase & {
  type: 'heading'
  level?: 1 | 2 | 3 | 4
}

export type AnimatedListBlock = AnimatedContentBlockBase & {
  type: 'list'
  items: string[]
  ordered?: boolean
}

export type AnimatedCardsBlock = AnimatedContentBlockBase & {
  type: 'cards'
  cards: AnimatedCard[]
}

export type AnimatedFormulaBlock = AnimatedContentBlockBase & {
  type: 'formula'
  formula: AnimatedFormula
}

export type AnimatedStepsBlock = AnimatedContentBlockBase & {
  type: 'steps'
  steps: AnimatedStep[]
}

export type AnimatedSimulatorBlock = AnimatedContentBlockBase & {
  type: 'simulator'
  simulator: AnimatedSimulatorConfig
}

export type AnimatedCtaBlock = AnimatedContentBlockBase & {
  type: 'cta'
  cta: AnimatedCta
}

export type AnimatedMediaBlock = AnimatedContentBlockBase & {
  type: 'media'
  media: AnimatedMedia
}

export type AnimatedCustomBlock = AnimatedContentBlockBase & {
  type: 'custom'
  renderer_key?: AnimatedRendererKey
  data?: Record<string, AnimatedJsonValue>
}

export type AnimatedContentBlock =
  | AnimatedTextBlock
  | AnimatedHeadingBlock
  | AnimatedListBlock
  | AnimatedCardsBlock
  | AnimatedFormulaBlock
  | AnimatedStepsBlock
  | AnimatedSimulatorBlock
  | AnimatedCtaBlock
  | AnimatedMediaBlock
  | AnimatedCustomBlock

export type AnimatedLessonConfig = {
  renderer_key?: AnimatedRendererKey
  chapter?: string
  title?: string
  subtitle?: string
  description?: string
  blocks?: AnimatedContentBlock[]
  cards?: AnimatedCard[]
  formulas?: AnimatedFormula[]
  steps?: AnimatedStep[]
  simulator?: AnimatedSimulatorConfig
  accent_colors?: AnimatedAccentColors
  cta?: AnimatedCta
  pager?: AnimatedPagerMetadata
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedTabContentReference = {
  id?: number | string
  label?: string
  tab_type?: string
  content?: string
  config_json?: AnimatedLessonConfig | Record<string, AnimatedJsonValue>
  renderer_key?: AnimatedRendererKey
}

export type AnimatedTopicItemReference = {
  id?: number | string
  title?: string
  description?: string
  item_type?: string
  renderer_key?: AnimatedRendererKey
}

export type AnimatedCompletionEvent = {
  completed: boolean
  score?: number
  reason?: string
  metadata?: Record<string, AnimatedJsonValue>
}

export type AnimatedRendererProps = {
  rendererKey?: AnimatedRendererKey | null
  config?: AnimatedLessonConfig | null
  tab?: AnimatedTabContentReference | null
  item?: AnimatedTopicItemReference | null
  className?: string
  onComplete?: (event: AnimatedCompletionEvent) => void
}

export type AnimatedRendererComponent = ComponentType<AnimatedRendererProps>

export type AnimatedRendererRegistry = Record<AnimatedRendererKey, AnimatedRendererComponent>
