import { describe, expect, it } from 'vitest'
import { liveMessages, liveQuestions, mergeLiveInteraction } from '@/lib/liveInteractions'
import type { LiveSessionInteraction } from '@/lib/professor'

function interaction(
  id: number,
  kind: 'message' | 'question',
  status: string,
  created_at: string,
  patch: Partial<LiveSessionInteraction> = {},
): LiveSessionInteraction {
  return {
    id,
    live_session_id: 1,
    course_offering_id: 1,
    professor_user_id: 2,
    student_user_id: 3,
    student_name: 'Student',
    kind,
    body: `${kind} ${id}`,
    status,
    answer: '',
    answered_by_user_id: null,
    answered_at: null,
    deleted_at: null,
    created_at,
    updated_at: created_at,
    ...patch,
  }
}

describe('live interaction helpers', () => {
  it('upserts realtime interactions without duplicating existing messages', () => {
    const first = interaction(1, 'message', 'pending', '2026-05-26T10:00:00Z')
    const updated = interaction(1, 'message', 'answered', '2026-05-26T10:00:00Z', { answer: 'Reply' })

    const merged = mergeLiveInteraction([first], updated)

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 1, status: 'answered', answer: 'Reply' })
  })

  it('keeps chat chronological and hides moderated messages', () => {
    const items = [
      interaction(3, 'message', 'pending', '2026-05-26T10:03:00Z'),
      interaction(1, 'message', 'pending', '2026-05-26T10:01:00Z'),
      interaction(2, 'message', 'hidden', '2026-05-26T10:02:00Z'),
    ]

    expect(liveMessages(items).map((item) => item.id)).toEqual([1, 3])
  })

  it('keeps pending questions before answered questions', () => {
    const items = [
      interaction(1, 'question', 'answered', '2026-05-26T10:03:00Z'),
      interaction(2, 'question', 'pending', '2026-05-26T10:02:00Z'),
      interaction(3, 'question', 'pending', '2026-05-26T10:04:00Z'),
    ]

    expect(liveQuestions(items).map((item) => item.id)).toEqual([3, 2, 1])
  })
})
