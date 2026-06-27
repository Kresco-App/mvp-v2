// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  API_DATA_DEDUPING_INTERVAL_MS,
  API_DATA_FOCUS_THROTTLE_INTERVAL_MS,
  API_DATA_LOADING_TIMEOUT_MS,
  apiDataErrorMessage,
  apiErrorStatus,
  apiSWRConfig,
  liveApiSWRConfig,
  shouldRetryApiError,
} from '@/lib/apiData'
import {
  API_DATA_SESSION_CACHE_KEY_PREFIX,
  API_DATA_SESSION_CACHE_MAX_ENTRIES,
  API_DATA_SESSION_CACHE_MAX_ENTRY_BYTES,
  API_DATA_SESSION_CACHE_TTL_MS,
  apiDataSessionStorageKey,
  clearApiDataSessionCache,
  createApiDataCacheProvider,
  flushPendingApiDataSessionCacheWrites,
  isApiDataSessionCacheKey,
} from '@/lib/apiDataCache'

function cachedState(data: unknown) {
  return {
    data,
    error: undefined,
    isLoading: false,
    isValidating: false,
  }
}

beforeEach(() => {
  sessionStorage.clear()
  clearApiDataSessionCache()
})

describe('API SWR data policy', () => {
  it('retries transient failures but not auth, forbidden, validation, or not-found responses', () => {
    expect(shouldRetryApiError({ response: { status: 500 } })).toBe(true)
    expect(shouldRetryApiError({ response: { status: 503 } })).toBe(true)
    expect(shouldRetryApiError(new Error('network down'))).toBe(true)

    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetryApiError({ response: { status } })).toBe(false)
    }
  })

  it('caps retry scheduling through the shared SWR config', () => {
    vi.useFakeTimers()
    const revalidate = vi.fn()
    type RetryConfig = { errorRetryCount: number; errorRetryInterval: number }
    const config: RetryConfig = { errorRetryCount: 2, errorRetryInterval: 25 }
    const onErrorRetry = apiSWRConfig.onErrorRetry as (
      error: unknown,
      key: string,
      config: RetryConfig,
      revalidate: (options: { retryCount: number }) => void,
      opts: { retryCount: number; dedupe: boolean },
    ) => void

    onErrorRetry(
      { response: { status: 500 } },
      '/api/example',
      config,
      revalidate,
      { retryCount: 1, dedupe: true },
    )
    vi.advanceTimersByTime(25)
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 1 })

    revalidate.mockClear()
    onErrorRetry(
      { response: { status: 500 } },
      '/api/example',
      config,
      revalidate,
      { retryCount: 2, dedupe: true },
    )
    vi.advanceTimersByTime(25)
    expect(revalidate).not.toHaveBeenCalled()

    revalidate.mockClear()
    onErrorRetry(
      { response: { status: 401 } },
      '/api/example',
      config,
      revalidate,
      { retryCount: 0, dedupe: true },
    )
    vi.advanceTimersByTime(25)
    expect(revalidate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('keeps stable API data warm across focus and return navigation', () => {
    expect(apiSWRConfig.keepPreviousData).toBe(true)
    expect(apiSWRConfig.revalidateIfStale).toBe(false)
    expect(apiSWRConfig.revalidateOnFocus).toBe(false)
    expect(apiSWRConfig.revalidateOnReconnect).toBe(true)
    expect(apiSWRConfig.dedupingInterval).toBe(API_DATA_DEDUPING_INTERVAL_MS)
    expect(apiSWRConfig.focusThrottleInterval).toBe(API_DATA_FOCUS_THROTTLE_INTERVAL_MS)
    expect(apiSWRConfig.loadingTimeout).toBe(API_DATA_LOADING_TIMEOUT_MS)
  })

  it('keeps live API data fresh on focus with a short dedupe window', () => {
    expect(liveApiSWRConfig.keepPreviousData).toBe(true)
    expect(liveApiSWRConfig.revalidateIfStale).toBe(true)
    expect(liveApiSWRConfig.revalidateOnFocus).toBe(true)
    expect(liveApiSWRConfig.revalidateOnReconnect).toBe(true)
    expect(liveApiSWRConfig.dedupingInterval).toBe(2000)
    expect(liveApiSWRConfig.focusThrottleInterval).toBe(10000)
  })

  it('persists stable student discovery data in a bounded session cache', () => {
    const topics = [{ id: 1, title: 'Mechanics' }]
    const exercises = { subject_id: 2, items: [{ id: 10, title: 'Derivatives' }], total: 1 }
    const exerciseDetail = { id: 10, title: 'Derivatives', notes: 'Review later' }
    const profile = { full_name: 'Private Student' }
    const xp = { total_xp: 1800 }
    const stats = { items_completed: 8 }
    const badges = { earned_count: 3, total_count: 9 }
    const notes = [{ id: 1, body: 'Review limits' }]
    const saves = [{ id: 2, target_type: 'topic_item', target_id: 10 }]
    const scopedNotes = [{ id: 3, body: 'Topic-specific note' }]
    const scopedSaves = [{ id: 4, target_type: 'topic_item', target_id: 11 }]
    const notesQueryKey = '/interactions/notes?topic_item_id=10&limit=20'
    const savesQueryKey = '/interactions/saves?topic_item_id=10&limit=20'
    const subjectDetailKey = '/courses/subjects/2'
    const subjectTopicsKey = '/courses/subjects/2/topics'
    const subjectDetail = { id: 2, title: 'Mathematics' }
    const subjectTopics = [{ id: 7, title: 'Limits', item_count: 8 }]
    const calendarEventsKey = '/calendar/events?start=2026-05-25&end=2026-05-31&timezone=Africa%2FCasablanca'
    const calendarEventDetailKey = '/calendar/events/17'
    const calendarEvents = [{ id: 17, title: 'Functions live', starts_at: '2026-05-26T10:00:00Z' }]
    const calendarEventDetail = { id: 17, title: 'Functions live', description: 'Bring notes' }
    const leaderboardKey = '/progress/leaderboard?limit=20&offset=0&include_current=true'
    const seasonLeaderboardKey = '/progress/leaderboard/seasons?limit=20&offset=0&include_current=true&season=weekly'
    const leaderboard = [{ user_id: 12, rank: 1, full_name: 'Fast Student', total_xp: 1200 }]
    const seasonLeaderboard = { season: 'weekly', entries: leaderboard }
    const sidebar = { leaderboard_entries: [{ user_id: 1, rank: 1, total_xp: 900 }] }
    const quizDiscovery = { subjectId: '12', quiz: { id: 5, title: 'Final review', questions: [] } }
    const quizDiscoveryKey = '/quizzes/subjects/12/discovery'
    const examProblemDetailKey = '/exam-bank/problems/42'
    const examProblemDetail = { id: 42, title: 'Versioned progress detail' }
    const studentProfessorChat = { eligible: true, conversations: [{ id: 81, last_message_preview: 'Cached professor reply' }] }
    const studentProfessorMessagesKey = '@"/professor/student-chat/conversations/messages",81,'
    const studentProfessorMessages = { conversationId: 81, messages: [{ id: 1, body: 'Cached active professor reply' }] }
    const studentLiveSessions = [{ id: 71, title: 'Cached student live', status: 'scheduled' }]
    const studentLiveEmbedKey = '@"/professor/student-live-sessions/embed",7,'
    const studentLiveEmbed = { sessionId: 7, embed: { join_url: 'https://live.kresco.local/student/7' } }
    const studentLiveInteractionsKey = '@"/professor/student-live-sessions/interactions",7,'
    const studentLiveInteractions = { sessionId: 7, interactions: [{ id: 3, body: 'Cached student live question' }] }
    const professorDashboard = { active_offering: { id: 11, title: 'Cached professor dashboard' }, chat_unread_count: 2 }
    const professorOfferings = [{ id: 11, title: 'Cached professor offering' }]
    const professorLiveSessions = [{ id: 44, title: 'Cached professor live' }]
    const professorLiveProviderConfig = { provider: 'vdocipher', configured: true }
    const professorLiveEmbedKey = '@"/professor/live-sessions/embed",44,'
    const professorLiveEmbed = { sessionId: 44, embed: { join_url: 'https://live.kresco.local/professor/44' } }
    const professorLiveInteractionsKey = '@"/professor/live-sessions/interactions",44,'
    const professorLiveInteractions = { sessionId: 44, interactions: [{ id: 4, body: 'Cached professor room question' }] }
    const professorMessagesKey = '@"/professor/chat/conversations/messages",44,'
    const professorMessages = { conversationId: 44, messages: [{ id: 2, body: 'Cached active student question' }] }
    const cache = createApiDataCacheProvider()

    cache.set('/courses/topics', cachedState(topics))
    cache.set('/exercises/subjects/2?limit=50&difficulty=hard', cachedState(exercises))
    cache.set('/exercises/10', cachedState(exerciseDetail))
    cache.set('/profile/me', cachedState(profile))
    cache.set('/progress/xp', cachedState(xp))
    cache.set('/progress/stats', cachedState(stats))
    cache.set('/progress/badges', cachedState(badges))
    cache.set('/interactions/notes', cachedState(notes))
    cache.set('/interactions/saves', cachedState(saves))
    cache.set(notesQueryKey, cachedState(scopedNotes))
    cache.set(savesQueryKey, cachedState(scopedSaves))
    cache.set(subjectDetailKey, cachedState(subjectDetail))
    cache.set(subjectTopicsKey, cachedState(subjectTopics))
    cache.set(calendarEventsKey, cachedState(calendarEvents))
    cache.set(calendarEventDetailKey, cachedState(calendarEventDetail))
    cache.set(leaderboardKey, cachedState(leaderboard))
    cache.set(seasonLeaderboardKey, cachedState(seasonLeaderboard))
    cache.set('/progress/leaderboard?limit=20&offset=0&search=private', cachedState([{ full_name: 'Private Search' }]))
    cache.set('/progress/sidebar-summary', cachedState(sidebar))
    cache.set(quizDiscoveryKey, cachedState(quizDiscovery))
    cache.set(examProblemDetailKey, cachedState(examProblemDetail))
    cache.set('/professor/student-chat', cachedState(studentProfessorChat))
    cache.set(studentProfessorMessagesKey, cachedState(studentProfessorMessages))
    cache.set('/professor/student-live-sessions', cachedState(studentLiveSessions))
    cache.set(studentLiveEmbedKey, cachedState(studentLiveEmbed))
    cache.set(studentLiveInteractionsKey, cachedState(studentLiveInteractions))
    cache.set('/professor/dashboard', cachedState(professorDashboard))
    cache.set('/professor/offerings', cachedState(professorOfferings))
    cache.set('/professor/live-sessions', cachedState(professorLiveSessions))
    cache.set('/professor/live-provider-config', cachedState(professorLiveProviderConfig))
    cache.set(professorLiveEmbedKey, cachedState(professorLiveEmbed))
    cache.set(professorLiveInteractionsKey, cachedState(professorLiveInteractions))
    cache.set(professorMessagesKey, cachedState(professorMessages))
    cache.set('@"/exam-bank/problems/42",0,', cachedState({ id: 42, title: 'Legacy tuple detail' }))
    cache.set('@"/professor/student-live-sessions/attendance",7,', cachedState({ sessionId: 7 }))
    flushPendingApiDataSessionCacheWrites()

    expect(isApiDataSessionCacheKey('/courses/topics')).toBe(true)
    expect(isApiDataSessionCacheKey('/exercises/subjects/2?limit=50&difficulty=hard')).toBe(true)
    expect(isApiDataSessionCacheKey('/exercises/10')).toBe(true)
    expect(isApiDataSessionCacheKey('/profile/me')).toBe(true)
    expect(isApiDataSessionCacheKey('/progress/xp')).toBe(true)
    expect(isApiDataSessionCacheKey('/progress/stats')).toBe(true)
    expect(isApiDataSessionCacheKey('/progress/badges')).toBe(true)
    expect(isApiDataSessionCacheKey('/interactions/notes')).toBe(true)
    expect(isApiDataSessionCacheKey('/interactions/saves')).toBe(true)
    expect(isApiDataSessionCacheKey(notesQueryKey)).toBe(true)
    expect(isApiDataSessionCacheKey(savesQueryKey)).toBe(true)
    expect(isApiDataSessionCacheKey(subjectDetailKey)).toBe(true)
    expect(isApiDataSessionCacheKey(subjectTopicsKey)).toBe(true)
    expect(isApiDataSessionCacheKey(calendarEventsKey)).toBe(true)
    expect(isApiDataSessionCacheKey(calendarEventDetailKey)).toBe(true)
    expect(isApiDataSessionCacheKey(leaderboardKey)).toBe(true)
    expect(isApiDataSessionCacheKey(seasonLeaderboardKey)).toBe(true)
    expect(isApiDataSessionCacheKey('/progress/leaderboard?limit=20&offset=0&search=private')).toBe(false)
    expect(isApiDataSessionCacheKey('/progress/sidebar-summary')).toBe(true)
    expect(API_DATA_SESSION_CACHE_MAX_ENTRIES).toBeGreaterThanOrEqual(64)
    expect(API_DATA_SESSION_CACHE_MAX_ENTRY_BYTES).toBeGreaterThanOrEqual(320_000)
    expect(isApiDataSessionCacheKey(quizDiscoveryKey)).toBe(true)
    expect(isApiDataSessionCacheKey('@"exam-quiz-discovery","12",')).toBe(false)
    expect(isApiDataSessionCacheKey(examProblemDetailKey)).toBe(true)
    expect(isApiDataSessionCacheKey('/professor/student-chat')).toBe(true)
    expect(isApiDataSessionCacheKey(studentProfessorMessagesKey)).toBe(true)
    expect(isApiDataSessionCacheKey('/professor/student-live-sessions')).toBe(true)
    expect(isApiDataSessionCacheKey(studentLiveEmbedKey)).toBe(true)
    expect(isApiDataSessionCacheKey(studentLiveInteractionsKey)).toBe(true)
    expect(isApiDataSessionCacheKey('/professor/dashboard')).toBe(true)
    expect(isApiDataSessionCacheKey('/professor/offerings')).toBe(true)
    expect(isApiDataSessionCacheKey('/professor/live-sessions')).toBe(true)
    expect(isApiDataSessionCacheKey('/professor/live-provider-config')).toBe(true)
    expect(isApiDataSessionCacheKey(professorLiveEmbedKey)).toBe(true)
    expect(isApiDataSessionCacheKey(professorLiveInteractionsKey)).toBe(true)
    expect(isApiDataSessionCacheKey(professorMessagesKey)).toBe(true)
    expect(isApiDataSessionCacheKey('@"/exam-bank/problems/42",0,')).toBe(false)
    expect(isApiDataSessionCacheKey('@"/professor/student-live-sessions/attendance",7,')).toBe(false)
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/courses/topics'))).toContain('Mechanics')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/exercises/subjects/2?limit=50&difficulty=hard'))).toContain('Derivatives')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/exercises/10'))).toContain('Review later')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/profile/me'))).toContain('Private Student')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/progress/xp'))).toContain('1800')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/progress/stats'))).toContain('items_completed')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/progress/badges'))).toContain('earned_count')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/interactions/notes'))).toContain('Review limits')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/interactions/saves'))).toContain('topic_item')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(notesQueryKey))).toContain('Topic-specific note')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(savesQueryKey))).toContain('topic_item')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(subjectDetailKey))).toContain('Mathematics')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(subjectTopicsKey))).toContain('Limits')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(calendarEventsKey))).toContain('Functions live')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(calendarEventDetailKey))).toContain('Bring notes')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(leaderboardKey))).toContain('Fast Student')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(seasonLeaderboardKey))).toContain('weekly')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/progress/leaderboard?limit=20&offset=0&search=private'))).toBeNull()
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/progress/sidebar-summary'))).toContain('leaderboard_entries')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(quizDiscoveryKey))).toContain('Final review')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(examProblemDetailKey))).toContain('Versioned progress detail')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/professor/student-chat'))).toContain('Cached professor reply')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(studentProfessorMessagesKey))).toContain('Cached active professor reply')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/professor/student-live-sessions'))).toContain('Cached student live')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(studentLiveEmbedKey))).toContain('student/7')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(studentLiveInteractionsKey))).toContain('Cached student live question')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/professor/dashboard'))).toContain('Cached professor dashboard')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/professor/offerings'))).toContain('Cached professor offering')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/professor/live-sessions'))).toContain('Cached professor live')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/professor/live-provider-config'))).toContain('vdocipher')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(professorLiveEmbedKey))).toContain('professor/44')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(professorLiveInteractionsKey))).toContain('Cached professor room question')
    expect(sessionStorage.getItem(apiDataSessionStorageKey(professorMessagesKey))).toContain('Cached active student question')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('@"exam-quiz-discovery","12",'))).toBeNull()
    expect(sessionStorage.getItem(apiDataSessionStorageKey('@"/exam-bank/problems/42",0,'))).toBeNull()
    expect(sessionStorage.getItem(apiDataSessionStorageKey('@"/professor/student-live-sessions/attendance",7,'))).toBeNull()

    const hydratedCache = createApiDataCacheProvider()
    expect(hydratedCache.get('/courses/topics')?.data).toEqual(topics)
    expect(hydratedCache.get('/exercises/subjects/2?limit=50&difficulty=hard')?.data).toEqual(exercises)
    expect(hydratedCache.get('/exercises/10')?.data).toEqual(exerciseDetail)
    expect(hydratedCache.get('/profile/me')?.data).toEqual(profile)
    expect(hydratedCache.get('/progress/xp')?.data).toEqual(xp)
    expect(hydratedCache.get('/progress/stats')?.data).toEqual(stats)
    expect(hydratedCache.get('/progress/badges')?.data).toEqual(badges)
    expect(hydratedCache.get('/interactions/notes')?.data).toEqual(notes)
    expect(hydratedCache.get('/interactions/saves')?.data).toEqual(saves)
    expect(hydratedCache.get(notesQueryKey)?.data).toEqual(scopedNotes)
    expect(hydratedCache.get(savesQueryKey)?.data).toEqual(scopedSaves)
    expect(hydratedCache.get(subjectDetailKey)?.data).toEqual(subjectDetail)
    expect(hydratedCache.get(subjectTopicsKey)?.data).toEqual(subjectTopics)
    expect(hydratedCache.get(calendarEventsKey)?.data).toEqual(calendarEvents)
    expect(hydratedCache.get(calendarEventDetailKey)?.data).toEqual(calendarEventDetail)
    expect(hydratedCache.get(leaderboardKey)?.data).toEqual(leaderboard)
    expect(hydratedCache.get(seasonLeaderboardKey)?.data).toEqual(seasonLeaderboard)
    expect(hydratedCache.get('/progress/leaderboard?limit=20&offset=0&search=private')).toBeUndefined()
    expect(hydratedCache.get('/progress/sidebar-summary')?.data).toEqual(sidebar)
    expect(hydratedCache.get(quizDiscoveryKey)?.data).toEqual(quizDiscovery)
    expect(hydratedCache.get(examProblemDetailKey)?.data).toEqual(examProblemDetail)
    expect(hydratedCache.get('/professor/student-chat')?.data).toEqual(studentProfessorChat)
    expect(hydratedCache.get(studentProfessorMessagesKey)?.data).toEqual(studentProfessorMessages)
    expect(hydratedCache.get('/professor/student-live-sessions')?.data).toEqual(studentLiveSessions)
    expect(hydratedCache.get(studentLiveEmbedKey)?.data).toEqual(studentLiveEmbed)
    expect(hydratedCache.get(studentLiveInteractionsKey)?.data).toEqual(studentLiveInteractions)
    expect(hydratedCache.get('/professor/dashboard')?.data).toEqual(professorDashboard)
    expect(hydratedCache.get('/professor/offerings')?.data).toEqual(professorOfferings)
    expect(hydratedCache.get('/professor/live-sessions')?.data).toEqual(professorLiveSessions)
    expect(hydratedCache.get('/professor/live-provider-config')?.data).toEqual(professorLiveProviderConfig)
    expect(hydratedCache.get(professorLiveEmbedKey)?.data).toEqual(professorLiveEmbed)
    expect(hydratedCache.get(professorLiveInteractionsKey)?.data).toEqual(professorLiveInteractions)
    expect(hydratedCache.get(professorMessagesKey)?.data).toEqual(professorMessages)
  })

  it('defers API session storage writes off the cache mutation path and flushes on pagehide', () => {
    const cache = createApiDataCacheProvider()
    const topics = [{ id: 1, title: 'Fast return topic' }]

    cache.set('/courses/topics', cachedState(topics))

    expect(cache.get('/courses/topics')?.data).toEqual(topics)
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/courses/topics'))).toBeNull()

    window.dispatchEvent(new Event('pagehide'))

    expect(sessionStorage.getItem(apiDataSessionStorageKey('/courses/topics'))).toContain('Fast return topic')
  })

  it('keeps persisted API data through loading and transient error states', () => {
    const cache = createApiDataCacheProvider()
    const topics = [{ id: 1, title: 'Resilient topic' }]
    const storageKey = apiDataSessionStorageKey('/courses/topics')

    cache.set('/courses/topics', cachedState(topics))
    flushPendingApiDataSessionCacheWrites()
    expect(sessionStorage.getItem(storageKey)).toContain('Resilient topic')

    cache.set('/courses/topics', {
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: true,
    })
    flushPendingApiDataSessionCacheWrites()
    expect(sessionStorage.getItem(storageKey)).toContain('Resilient topic')

    cache.set('/courses/topics', {
      data: topics,
      error: new Error('temporary offline'),
      isLoading: false,
      isValidating: false,
    })
    flushPendingApiDataSessionCacheWrites()
    expect(sessionStorage.getItem(storageKey)).toContain('Resilient topic')

    cache.set('/courses/topics', {
      data: undefined,
      error: new Error('no cached data'),
      isLoading: false,
      isValidating: false,
    })
    flushPendingApiDataSessionCacheWrites()
    expect(sessionStorage.getItem(storageKey)).toBeNull()
  })

  it('skips parsing cached API payloads while the session cache is under the entry limit', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')

    try {
      const cache = createApiDataCacheProvider()

      cache.set('/courses/topics', cachedState([{ id: 1, title: 'Cheap cache write' }]))
      flushPendingApiDataSessionCacheWrites()

      expect(parseSpy).not.toHaveBeenCalled()
      expect(sessionStorage.getItem(apiDataSessionStorageKey('/courses/topics'))).toContain('Cheap cache write')
    } finally {
      parseSpy.mockRestore()
    }
  })

  it('reuses an in-memory API session cache key index across repeated flushes', () => {
    const keySpy = vi.spyOn(Storage.prototype, 'key')

    try {
      const cache = createApiDataCacheProvider()

      cache.set('/courses/topics', cachedState([{ id: 1, title: 'First indexed write' }]))
      flushPendingApiDataSessionCacheWrites()
      const keyReadsAfterFirstFlush = keySpy.mock.calls.length

      expect(keyReadsAfterFirstFlush).toBeGreaterThan(0)

      cache.set('/profile/me', cachedState({ full_name: 'Indexed Student' }))
      flushPendingApiDataSessionCacheWrites()

      expect(keySpy).toHaveBeenCalledTimes(keyReadsAfterFirstFlush)
      expect(sessionStorage.getItem(apiDataSessionStorageKey('/profile/me'))).toContain('Indexed Student')
    } finally {
      keySpy.mockRestore()
    }
  })

  it('prunes oldest API session cache entries only after exceeding the entry limit', () => {
    const now = Date.now()
    for (let index = 0; index < API_DATA_SESSION_CACHE_MAX_ENTRIES; index += 1) {
      sessionStorage.setItem(apiDataSessionStorageKey(`/calendar/events/${index + 1}`), JSON.stringify({
        cachedAt: now - (API_DATA_SESSION_CACHE_MAX_ENTRIES - index),
        data: { id: index + 1 },
      }))
    }

    const cache = createApiDataCacheProvider()
    cache.set('/courses/topics', cachedState([{ id: 99, title: 'Newest topic' }]))
    flushPendingApiDataSessionCacheWrites()

    const versionedKeys: string[] = []
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(API_DATA_SESSION_CACHE_KEY_PREFIX)) versionedKeys.push(key)
    }

    expect(versionedKeys).toHaveLength(API_DATA_SESSION_CACHE_MAX_ENTRIES)
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/calendar/events/1'))).toBeNull()
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/calendar/events/2'))).toContain('"id":2')
    expect(sessionStorage.getItem(apiDataSessionStorageKey('/courses/topics'))).toContain('Newest topic')
  })

  it('lazily hydrates session-backed API data only when a key is requested', () => {
    const topicsKey = apiDataSessionStorageKey('/courses/topics')
    const profileKey = apiDataSessionStorageKey('/profile/me')
    const topics = [{ id: 9, title: 'Lazy topic' }]

    sessionStorage.setItem(topicsKey, JSON.stringify({
      cachedAt: Date.now(),
      data: topics,
    }))
    sessionStorage.setItem(profileKey, JSON.stringify({
      cachedAt: Date.now() - API_DATA_SESSION_CACHE_TTL_MS - 1,
      data: { full_name: 'Expired Student' },
    }))

    const cache = createApiDataCacheProvider()

    expect(Array.from(cache.keys())).toEqual([])
    expect(sessionStorage.getItem(profileKey)).toContain('Expired Student')

    expect(cache.get('/courses/topics')?.data).toEqual(topics)
    expect(Array.from(cache.keys())).toEqual(['/courses/topics'])
    expect(sessionStorage.getItem(profileKey)).toContain('Expired Student')

    expect(cache.get('/profile/me')).toBeUndefined()
    expect(sessionStorage.getItem(profileKey)).toBeNull()
  })

  it('expires stale session-backed API data before hydrating SWR', () => {
    const key = apiDataSessionStorageKey('/courses/subjects')
    sessionStorage.setItem(key, JSON.stringify({
      cachedAt: Date.now() - API_DATA_SESSION_CACHE_TTL_MS - 1,
      data: [{ id: 7, title: 'Physics' }],
    }))

    const cache = createApiDataCacheProvider()

    expect(cache.get('/courses/subjects')).toBeUndefined()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('clears only versioned API session cache entries', () => {
    sessionStorage.setItem(apiDataSessionStorageKey('/courses/topics'), JSON.stringify({
      cachedAt: Date.now(),
      data: [{ id: 1 }],
    }))
    sessionStorage.setItem('kresco:other-cache:v1:/courses/topics', 'keep')

    clearApiDataSessionCache()

    expect(sessionStorage.getItem(apiDataSessionStorageKey('/courses/topics'))).toBeNull()
    expect(sessionStorage.getItem('kresco:other-cache:v1:/courses/topics')).toBe('keep')
  })

  it('formats API data errors without leaking implementation details', () => {
    expect(apiErrorStatus({ response: { status: 503 } })).toBe(503)
    expect(apiDataErrorMessage({ response: { data: { detail: 'Controlled failure' }, status: 500 } }, 'Fallback')).toBe('Controlled failure')
    expect(apiDataErrorMessage({ response: { status: 500 } }, 'Fallback')).toBe('Fallback (500)')
    expect(apiDataErrorMessage(new Error('Network failed'), 'Fallback')).toBe('Network failed')
  })
})
