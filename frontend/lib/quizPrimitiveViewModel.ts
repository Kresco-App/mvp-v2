export type QuizPrimitiveBaseQuestion = {
  id: string
  type: string
  title: string
  prompt: string
  concept: string
  difficulty: string
  hook?: string
  explanation?: string
  media?: {
    src: string
    alt: string
  }
}

export type QuizPrimitiveOption = {
  id: string
  label: string
  image?: string
}

export type EllipseAnswerRegion = {
  shape: 'ellipse'
  label: string
  x: number
  y: number
  rx: number
  ry: number
}

export type QuizPrimitiveQuestion =
  | (QuizPrimitiveBaseQuestion & { type: 'multiple_choice' | 'true_false'; options: QuizPrimitiveOption[]; answer: string })
  | (QuizPrimitiveBaseQuestion & { type: 'multi_select'; options: QuizPrimitiveOption[]; answer: string[] })
  | (QuizPrimitiveBaseQuestion & { type: 'numeric_approximation'; answer: number; tolerance: number; unit: string; sample: string })
  | (QuizPrimitiveBaseQuestion & { type: 'slider_estimation'; min: number; max: number; step: number; answer: number; tolerance: number; unit: string; start: number })
  | (QuizPrimitiveBaseQuestion & { type: 'exact_match' | 'fill_in_blank' | 'short_answer'; answer: string; sample: string; hint?: string })
  | (QuizPrimitiveBaseQuestion & { type: 'ordering'; items: QuizPrimitiveOption[]; answer: string[] })
  | (QuizPrimitiveBaseQuestion & { type: 'matching'; left: QuizPrimitiveOption[]; right: QuizPrimitiveOption[]; answer: Record<string, string> })
  | (QuizPrimitiveBaseQuestion & { type: 'formula_builder'; tokens: QuizPrimitiveOption[]; answer: string[] })
  | (QuizPrimitiveBaseQuestion & { type: 'error_spotting'; lines: QuizPrimitiveOption[]; answer: string })
  | (QuizPrimitiveBaseQuestion & { type: 'drag_and_drop'; items: QuizPrimitiveOption[]; zones: QuizPrimitiveOption[]; answer: Record<string, string> })
  | (QuizPrimitiveBaseQuestion & {
      type: 'image_hotspot'
      cursor: { x: number; y: number; radius: number }
      answerRegion: EllipseAnswerRegion
    })

export type QuizPrimitiveType = QuizPrimitiveQuestion['type']

export const quizPrimitiveGroups: { label: string; types: QuizPrimitiveType[] }[] = [
  { label: 'Selection', types: ['multiple_choice', 'multi_select', 'true_false'] },
  { label: 'Typed', types: ['numeric_approximation', 'slider_estimation', 'exact_match', 'fill_in_blank', 'short_answer'] },
  { label: 'Manipulation', types: ['ordering', 'matching', 'formula_builder', 'error_spotting', 'drag_and_drop', 'image_hotspot'] },
]

export function findQuizPrimitiveQuestion(questions: QuizPrimitiveQuestion[], activeId: string) {
  return questions.find((question) => question.id === activeId) ?? questions[0]
}

export function toggleSelection(current: string[], id: string) {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
}

export function isWithinTolerance(value: number, answer: number, tolerance: number) {
  return Number.isFinite(value) && Math.abs(value - answer) <= tolerance
}

export function isNumericApproximationCorrect(value: string, answer: number, tolerance: number) {
  if (!value.trim()) return false
  return isWithinTolerance(Number(value), answer, tolerance)
}

export function isTextAnswerCorrect(value: string, answer: string) {
  return value.trim().toLowerCase() === answer.trim().toLowerCase()
}

export function isOrderedAnswerCorrect(current: string[], answer: string[]) {
  return current.length >= answer.length && current.join('|') === answer.join('|')
}

export function availableFormulaTokens(tokens: QuizPrimitiveOption[], built: string[]) {
  const builtIds = new Set(built)
  return tokens.filter((token) => !builtIds.has(token.id))
}

export function isDragDropCorrect(assignments: Record<string, string>, answer: Record<string, string>) {
  return Object.entries(answer).every(([itemId, zoneId]) => assignments[itemId] === zoneId)
}

export function orderedZoneItems(
  items: QuizPrimitiveOption[],
  assignments: Record<string, string>,
  zoneOrders: Record<string, string[]>,
  zoneId: string,
) {
  const orderedIds = zoneOrders[zoneId] ?? []
  const itemById = new Map(items.map((item) => [item.id, item]))
  const assignedIds = items.flatMap((item) => assignments[item.id] === zoneId ? [item.id] : [])
  const assignedIdSet = new Set(assignedIds)
  const orderedIdSet = new Set(orderedIds)
  const ids = [...orderedIds.filter((id) => assignedIdSet.has(id)), ...assignedIds.filter((id) => !orderedIdSet.has(id))]

  return ids.flatMap((id) => {
    const item = itemById.get(id)
    return item ? [item] : []
  })
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function circleInsideEllipse(
  cursor: { x: number; y: number; radius: number },
  region: EllipseAnswerRegion,
) {
  const safeRx = region.rx - cursor.radius
  const safeRy = region.ry - cursor.radius
  if (safeRx <= 0 || safeRy <= 0) return false
  const dx = cursor.x - region.x
  const dy = cursor.y - region.y
  return ((dx * dx) / (safeRx * safeRx)) + ((dy * dy) / (safeRy * safeRy)) <= 1
}

export function schemaPreview(question: QuizPrimitiveQuestion) {
  const { media, ...rest } = question
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    concept: question.concept,
    difficulty: question.difficulty,
    ...(media ? { media: { src: media.src.slice(0, 54) + '...', alt: media.alt } } : {}),
    ...Object.fromEntries(
      Object.entries(rest).filter(([key]) => !['id', 'type', 'title', 'prompt', 'concept', 'difficulty'].includes(key)),
    ),
  }
}
