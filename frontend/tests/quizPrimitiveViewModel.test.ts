import { describe, expect, it } from 'vitest'

import { quizPrimitiveQuestions } from '@/components/quiz/quizPrimitiveData'
import {
  availableFormulaTokens,
  circleInsideEllipse,
  clamp,
  findQuizPrimitiveQuestion,
  isDragDropCorrect,
  isNumericApproximationCorrect,
  isOrderedAnswerCorrect,
  isTextAnswerCorrect,
  isWithinTolerance,
  orderedZoneItems,
  quizPrimitiveGroups,
  schemaPreview,
  toggleSelection,
} from '@/lib/quizPrimitiveViewModel'

describe('quiz primitive view model', () => {
  it('keeps all primitive question types grouped and discoverable', () => {
    const groupedTypes = new Set(quizPrimitiveGroups.flatMap((group) => group.types))
    const questionTypes = new Set(quizPrimitiveQuestions.map((question) => question.type))

    expect(groupedTypes).toEqual(questionTypes)
    expect(findQuizPrimitiveQuestion(quizPrimitiveQuestions, 'q-formula')?.title).toBe('Mental calculation')
    expect(findQuizPrimitiveQuestion(quizPrimitiveQuestions, 'missing')).toBe(quizPrimitiveQuestions[0])
  })

  it('normalizes selection and answer checking helpers', () => {
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b'])
    expect(isWithinTolerance(2.04, 2, 0.05)).toBe(true)
    expect(isNumericApproximationCorrect('2.06', 2, 0.05)).toBe(false)
    expect(isTextAnswerCorrect(' hz ', 'Hz')).toBe(true)
    expect(isOrderedAnswerCorrect(['lambda', 'equals', 'v'], ['lambda', 'equals', 'v'])).toBe(true)
  })

  it('handles formula and drag-drop ordering state without component state', () => {
    const tokens = [
      { id: 'lambda', label: 'lambda' },
      { id: 'equals', label: '=' },
      { id: 'v', label: 'v' },
    ]
    const items = [
      { id: 'sound', label: 'Sound' },
      { id: 'light', label: 'Light' },
      { id: 'rope', label: 'Rope' },
    ]
    const assignments = { sound: 'mechanical', light: 'electromagnetic', rope: 'mechanical' }

    expect(availableFormulaTokens(tokens, ['lambda']).map((token) => token.id)).toEqual(['equals', 'v'])
    expect(orderedZoneItems(items, assignments, { mechanical: ['rope'] }, 'mechanical').map((item) => item.id)).toEqual(['rope', 'sound'])
    expect(isDragDropCorrect(assignments, { sound: 'mechanical', light: 'electromagnetic' })).toBe(true)
  })

  it('checks hotspot geometry with circle radius and produces schema previews', () => {
    const region = { shape: 'ellipse' as const, label: 'crest', x: 50, y: 50, rx: 20, ry: 12 }

    expect(clamp(120, 0, 100)).toBe(100)
    expect(circleInsideEllipse({ x: 50, y: 50, radius: 4 }, region)).toBe(true)
    expect(circleInsideEllipse({ x: 68, y: 50, radius: 4 }, region)).toBe(false)

    const preview = schemaPreview(quizPrimitiveQuestions[0])
    expect(preview).toMatchObject({
      id: 'q-wave-source',
      type: 'multiple_choice',
      concept: 'ondes mecaniques',
    })
    expect(preview).not.toHaveProperty('title')
  })
})
