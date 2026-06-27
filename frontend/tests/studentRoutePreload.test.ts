import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { State } from 'swr'

const mocks = vi.hoisted(() => ({
  apiSWRFetcher: vi.fn(async (key: string): Promise<unknown> => ({ key })),
}))

import {
  clearStudentRoutePreloadState,
  preloadStudentRouteData,
  studentRoutePreloadKeys,
  type StudentRouteDataMutate,
} from '@/lib/studentRoutePreload'

beforeEach(() => {
  vi.clearAllMocks()
  clearStudentRoutePreloadState()
})

describe('student route data preload', () => {
  it('maps student routes to the same stable SWR keys used by destination pages', () => {
    expect(studentRoutePreloadKeys('/home')).toEqual(['/courses/topics', '/courses/subjects', '/progress/sidebar-summary'])
    expect(studentRoutePreloadKeys('/home/42')).toEqual([
      '/courses/subjects/42',
      '/courses/subjects/42/topics',
      '/progress/sidebar-summary',
    ])
    expect(studentRoutePreloadKeys('/courses')).toEqual(['/courses/topics', '/progress/sidebar-summary'])
    expect(studentRoutePreloadKeys('/topics/12?item=34&tab=8')).toEqual(['/courses/topics/12/workspace?item_id=34'])
    expect(studentRoutePreloadKeys('/exam/42')).toEqual(['/quizzes/subjects/42/discovery'])
    expect(studentRoutePreloadKeys('/exam-bank')).toEqual(['/exam-bank', '/progress/sidebar-summary'])
    expect(studentRoutePreloadKeys('/exam-bank?problem=99&topic=12')).toEqual([
      '/exam-bank',
      '/exam-bank/problems/99',
      '/progress/sidebar-summary',
    ])
    expect(studentRoutePreloadKeys('/exercise-bank')).toEqual(['/courses/subjects'])
    expect(studentRoutePreloadKeys('/exercise-bank?subject=2&difficulty=medium&saved=true&exercise=10')).toEqual([
      '/courses/subjects',
      '/exercises/subjects/2?limit=50&difficulty=medium&saved=true',
      '/exercises/10',
    ])
    expect(studentRoutePreloadKeys('/calendar', {
      now: new Date('2026-06-27T12:00:00Z'),
      timezone: 'Africa/Casablanca',
    })).toEqual(['/calendar/events?start=2026-06-22&end=2026-06-28&timezone=Africa%2FCasablanca'])
    expect(studentRoutePreloadKeys('/calendar?event=42', {
      now: new Date('2026-06-27T12:00:00Z'),
      timezone: 'Africa/Casablanca',
    })).toEqual([
      '/calendar/events?start=2026-06-22&end=2026-06-28&timezone=Africa%2FCasablanca',
      '/calendar/events/42',
    ])
    expect(studentRoutePreloadKeys('/profile')).toEqual(expect.arrayContaining([
      '/profile/me',
      '/progress/xp',
      '/courses/topics',
      '/progress/sidebar-summary',
    ]))
    expect(studentRoutePreloadKeys('/zed')).toEqual([])
  })

  it('preloads each destination key once and lets SWR own the populated cache', async () => {
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate

    expect(preloadStudentRouteData('/home', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual(['/courses/topics', '/courses/subjects', '/progress/sidebar-summary'])
    await Promise.all(vi.mocked(mutate).mock.calls.map(([, request]) => request))

    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/courses/topics')
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/courses/subjects')
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/progress/sidebar-summary')
    expect(mutate).toHaveBeenCalledWith(
      '/courses/topics',
      expect.any(Promise),
      { populateCache: true, revalidate: false },
    )

    vi.clearAllMocks()
    expect(preloadStudentRouteData('/home', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual([])
    expect(mocks.apiSWRFetcher).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('skips destination keys that already have successful SWR cache data', async () => {
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate
    const cache = new Map<string, State<unknown>>([
      ['/courses/topics', { data: [{ id: 1, title: 'Warm topic' }] }],
      ['/progress/sidebar-summary', { data: { leaderboard_entries: [] } }],
    ])

    expect(preloadStudentRouteData('/courses', mutate, { cache, fetcher: mocks.apiSWRFetcher })).toEqual([])

    expect(mocks.apiSWRFetcher).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('lets SWR cache ownership recover preloads after warmed entries are evicted', async () => {
    const cache = new Map<string, State<unknown>>()
    const mutate = vi.fn(async (key, request) => {
      const data = await request
      cache.set(key, { data })
      return data
    }) as StudentRouteDataMutate

    expect(preloadStudentRouteData('/courses', mutate, { cache, fetcher: mocks.apiSWRFetcher })).toEqual(['/courses/topics', '/progress/sidebar-summary'])
    await Promise.all(vi.mocked(mutate).mock.calls.map(([, request]) => request))
    await Promise.resolve()

    expect(preloadStudentRouteData('/courses', mutate, { cache, fetcher: mocks.apiSWRFetcher })).toEqual([])

    cache.delete('/courses/topics')
    vi.clearAllMocks()

    expect(preloadStudentRouteData('/courses', mutate, { cache, fetcher: mocks.apiSWRFetcher })).toEqual(['/courses/topics'])
    await vi.mocked(mutate).mock.calls[0]?.[1]

    expect(mocks.apiSWRFetcher).toHaveBeenCalledTimes(1)
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/courses/topics')
  })

  it('still preloads cached keys when the cached state contains an error', async () => {
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate
    const cache = new Map<string, State<unknown>>([
      ['/exam-bank', { data: [{ id: 1 }], error: new Error('stale failure') }],
      ['/progress/sidebar-summary', { data: { leaderboard_entries: [] } }],
    ])

    expect(preloadStudentRouteData('/exam-bank', mutate, { cache, fetcher: mocks.apiSWRFetcher })).toEqual(['/exam-bank'])
    await vi.mocked(mutate).mock.calls[0]?.[1]

    expect(mocks.apiSWRFetcher).toHaveBeenCalledTimes(1)
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/exam-bank')
  })

  it('starts the default Exercise Bank list preload as soon as subjects resolve', async () => {
    mocks.apiSWRFetcher.mockImplementation(async (key: string) => (
      key === '/courses/subjects'
        ? [{ id: 2, title: 'Physique' }]
        : { key }
    ))
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate

    expect(preloadStudentRouteData('/exercise-bank', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual(['/courses/subjects'])
    await vi.mocked(mutate).mock.calls[0]?.[1]
    await Promise.resolve()

    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/exercises/subjects/2?limit=50')
    expect(mutate).toHaveBeenCalledWith(
      '/exercises/subjects/2?limit=50',
      expect.any(Promise),
      { populateCache: true, revalidate: false },
    )
  })

  it('uses cached subjects to start the default Exercise Bank list preload without refetching subjects', async () => {
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate
    const cache = new Map<string, State<unknown>>([
      ['/courses/subjects', { data: [{ id: 5, title: 'SVT' }] }],
    ])

    expect(preloadStudentRouteData('/exercise-bank', mutate, { cache, fetcher: mocks.apiSWRFetcher })).toEqual([])
    await Promise.resolve()

    expect(mocks.apiSWRFetcher).not.toHaveBeenCalledWith('/courses/subjects')
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/exercises/subjects/5?limit=50')
    expect(mutate).toHaveBeenCalledWith(
      '/exercises/subjects/5?limit=50',
      expect.any(Promise),
      { populateCache: true, revalidate: false },
    )
  })

  it('preloads explicit Exercise Bank subject and detail links without scheduling the default subject', async () => {
    mocks.apiSWRFetcher.mockImplementation(async (key: string) => (
      key === '/courses/subjects'
        ? [{ id: 3, title: 'Math' }]
        : { key }
    ))
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate

    expect(preloadStudentRouteData('/exercise-bank?subject=2&exercise=10', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual([
      '/courses/subjects',
      '/exercises/subjects/2?limit=50',
      '/exercises/10',
    ])
    await Promise.all(vi.mocked(mutate).mock.calls.map(([, request]) => request))
    await Promise.resolve()

    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/exercises/subjects/2?limit=50')
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/exercises/10')
    expect(mocks.apiSWRFetcher).not.toHaveBeenCalledWith('/exercises/subjects/3?limit=50')
  })

  it('allows a failed preload key to be retried on the next intent', async () => {
    mocks.apiSWRFetcher.mockRejectedValueOnce(new Error('offline'))
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate

    expect(preloadStudentRouteData('/exam-bank', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual(['/exam-bank', '/progress/sidebar-summary'])
    await expect(vi.mocked(mutate).mock.calls[0]?.[1]).rejects.toThrow('offline')
    await vi.mocked(mutate).mock.calls[1]?.[1]

    mocks.apiSWRFetcher.mockResolvedValueOnce({ key: '/exam-bank' })
    vi.clearAllMocks()

    expect(preloadStudentRouteData('/exam-bank', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual(['/exam-bank'])
    await vi.mocked(mutate).mock.calls[0]?.[1]
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/exam-bank')
  })

  it('allows a failed dependent Exercise Bank preload to retry on the next intent', async () => {
    mocks.apiSWRFetcher.mockImplementation(async (key: string) => {
      if (key === '/courses/subjects') return [{ id: 2, title: 'Physique' }]
      if (key === '/exercises/subjects/2?limit=50') throw new Error('exercise list offline')
      return { key }
    })
    const mutate = vi.fn((_key, request) => request) as StudentRouteDataMutate

    expect(preloadStudentRouteData('/exercise-bank', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual(['/courses/subjects'])
    await vi.mocked(mutate).mock.calls[0]?.[1]
    await Promise.resolve()
    await expect(vi.mocked(mutate).mock.calls[1]?.[1]).rejects.toThrow('exercise list offline')

    clearStudentRoutePreloadState()
    mocks.apiSWRFetcher.mockImplementation(async (key: string) => (
      key === '/courses/subjects'
        ? [{ id: 2, title: 'Physique' }]
        : { key }
    ))
    vi.clearAllMocks()

    expect(preloadStudentRouteData('/exercise-bank', mutate, { fetcher: mocks.apiSWRFetcher })).toEqual(['/courses/subjects'])
    await vi.mocked(mutate).mock.calls[0]?.[1]
    await Promise.resolve()
    expect(mocks.apiSWRFetcher).toHaveBeenCalledWith('/exercises/subjects/2?limit=50')
  })
})
