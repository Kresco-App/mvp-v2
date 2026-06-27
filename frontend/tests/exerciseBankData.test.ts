import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(() => Promise.resolve()),
  postJson: vi.fn(),
}))

vi.mock('swr', () => ({
  default: vi.fn(),
  mutate: mocks.mutate,
}))

vi.mock('@/lib/apiClient', () => ({
  patchJson: vi.fn(),
  postJson: mocks.postJson,
}))

import { saveExercise, type ExerciseBankList } from '@/lib/exerciseBankData'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exercise bank cache updates', () => {
  it('keeps unrelated subject list caches referentially stable after exercise mutations', async () => {
    mocks.postJson.mockResolvedValueOnce({
      xp_awarded: 0,
      exercise: {
        ...exerciseListItem({ id: 42 }),
        statement_body: '',
        solution_body: '',
        solution_video_url: '',
        assets: [],
        reveal_count: 0,
        first_revealed_at: null,
        last_revealed_at: null,
        self_grade_history: [],
        notes: '',
        can_save_notes: true,
        metadata_json: {},
        saved: true,
        updated_at: '2026-06-27T10:00:00Z',
      },
    })

    await saveExercise(42, true)

    expect(mocks.postJson).toHaveBeenCalledWith('/exercises/42/saved', { saved: true })
    const [, listCall] = mocks.mutate.mock.calls as unknown as Array<[unknown, unknown, unknown?]>
    const predicate = listCall?.[0] as (key: unknown) => boolean
    const updater = listCall?.[1] as (current: ExerciseBankList | undefined) => ExerciseBankList | undefined

    expect(predicate('/exercises/subjects/2?limit=50')).toBe(true)
    expect(predicate('/exercises/subjects/3?limit=50')).toBe(false)
    expect(listCall?.[2]).toEqual({ revalidate: false })

    const currentList = exerciseListCache({ itemId: 42 })
    const nextList = updater(currentList)

    expect(nextList).not.toBe(currentList)
    expect(nextList?.items[0]).toMatchObject({
      id: 42,
      saved: true,
      updated_at: '2026-06-27T10:00:00Z',
    })

    const unchangedList = exerciseListCache({ itemId: 7 })
    expect(updater(unchangedList)).toBe(unchangedList)
  })
})

function exerciseListCache({ itemId }: { itemId: number }): ExerciseBankList {
  return {
    subject_id: 2,
    topic_id: null,
    total: 1,
    items: [exerciseListItem({ id: itemId })],
  }
}

function exerciseListItem({ id }: { id: number }) {
  return {
    id,
    subject_id: 2,
    topic_id: null,
    title: 'Exercise',
    slug: 'exercise',
    summary: '',
    difficulty: 'medium',
    estimated_minutes: 10,
    order: 1,
    concept_slugs: [],
    is_free_preview: false,
    self_grade: 'not_started' as const,
    saved: false,
    has_solution_body: false,
    has_solution_video: false,
    asset_count: 0,
    created_at: '2026-06-27T09:00:00Z',
    updated_at: '2026-06-27T09:00:00Z',
  }
}
