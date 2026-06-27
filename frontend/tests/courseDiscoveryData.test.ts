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
  getJson: vi.fn(),
  postJson: mocks.postJson,
}))

import {
  recordExamProblemProgress,
  type Exam,
  type ExamBankListResponse,
  type ExamProblemDetail,
} from '@/lib/courseDiscoveryData'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('course discovery data cache updates', () => {
  it('updates every Exam Bank list cache after problem progress changes', async () => {
    mocks.postJson.mockResolvedValueOnce({
      exam_problem_id: 42,
      status: 'completed',
      saved: true,
      opened_at: null,
      completed_at: '2026-06-27T10:00:00Z',
      last_activity_at: '2026-06-27T10:00:00Z',
    })

    await recordExamProblemProgress(42, { status: 'completed' })

    expect(mocks.postJson).toHaveBeenCalledWith('/exam-bank/problems/42/progress', { status: 'completed' })
    const [listCall, detailCall] = mocks.mutate.mock.calls as unknown as Array<[unknown, unknown, unknown?]>
    const listPredicate = listCall?.[0] as (key: unknown) => boolean
    const listUpdater = listCall?.[1] as (current: ExamBankListResponse | Exam[] | undefined) => ExamBankListResponse | Exam[] | undefined

    expect(listPredicate('/exam-bank')).toBe(true)
    expect(listPredicate('/exam-bank?saved=true')).toBe(true)
    expect(listPredicate('/exam-bank/problems/42')).toBe(false)
    expect(listCall?.[2]).toEqual({ revalidate: false })

    const currentList = examBankListCache()
    const nextList = listUpdater(currentList) as ExamBankListResponse

    expect(nextList).not.toBe(currentList)
    expect(nextList.items[0]?.problems[0]).toMatchObject({
      id: 42,
      progress_status: 'completed',
      saved: true,
    })

    const unchangedList = examBankListCache({ problemId: 7 })
    expect(listUpdater(unchangedList)).toBe(unchangedList)

    const detailUpdater = detailCall?.[1] as (current: ExamProblemDetail | undefined) => ExamProblemDetail | undefined
    expect(detailCall?.[0]).toBe('/exam-bank/problems/42')
    expect(detailCall?.[2]).toEqual({ revalidate: false })
    expect(detailUpdater(examProblemDetail())).toMatchObject({
      id: 42,
      progress_status: 'completed',
      saved: true,
    })
  })
})

function examBankListCache({ problemId = 42 } = {}): ExamBankListResponse {
  return {
    total: 1,
    items: [{
      id: 1,
      subject_id: 2,
      subject_title: 'Physics',
      title: 'BAC Physics',
      year: 2026,
      session: 'normal',
      statement_url: '',
      problems: [{
        id: problemId,
        title: 'Problem',
        statement: '',
        written_solution: '',
        written_solution_url: '',
        difficulty: 'medium',
        concept_slugs: [],
        progress_status: 'opened',
        saved: false,
      }],
    }],
  }
}

function examProblemDetail(): ExamProblemDetail {
  return {
    id: 42,
    title: 'Problem',
    statement: '',
    written_solution: '',
    written_solution_url: '',
    difficulty: 'medium',
    concept_slugs: [],
    progress_status: 'opened',
    saved: false,
    exam_title: 'BAC Physics',
    subject_title: 'Physics',
    year: 2026,
    session: 'normal',
    parts: [],
  }
}
