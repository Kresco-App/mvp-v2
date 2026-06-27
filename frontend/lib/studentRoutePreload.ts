import { hasSuccessfulSWRCacheData, readSuccessfulSWRCacheData, type ReadableSWRCache } from '@/lib/swrCache'

export type StudentRoutePreloadOptions = {
  cache?: ReadableSWRCache
  fetcher?: (key: string) => Promise<unknown>
  now?: Date
  timezone?: string
}

export type StudentRouteDataMutate = (
  key: string,
  data: Promise<unknown>,
  options: { populateCache: true; revalidate: false },
) => Promise<unknown> | unknown

const preloadedStudentRouteKeys = new Set<string>()
const SIDEBAR_SUMMARY_KEY = '/progress/sidebar-summary'

export function studentRoutePreloadKeys(href: string, options: StudentRoutePreloadOptions = {}) {
  const pathname = normalizedPathname(href)

  if (pathname === '/home') return ['/courses/topics', '/courses/subjects', SIDEBAR_SUMMARY_KEY]
  if (pathname.startsWith('/home/')) {
    const subjectId = homeSubjectIdFromPathname(pathname)
    if (!subjectId) return [SIDEBAR_SUMMARY_KEY]
    return [
      `/courses/subjects/${subjectId}`,
      `/courses/subjects/${subjectId}/topics`,
      SIDEBAR_SUMMARY_KEY,
    ]
  }
  if (pathname === '/courses') return ['/courses/topics', SIDEBAR_SUMMARY_KEY]
  if (pathname.startsWith('/topics/')) {
    const topicWorkspaceKey = topicWorkspaceKeyFromHref(href, pathname)
    return topicWorkspaceKey ? [topicWorkspaceKey] : []
  }
  if (pathname.startsWith('/exam/')) {
    const subjectId = routeSegmentFromPathname(pathname, '/exam/')
    return subjectId ? [`/quizzes/subjects/${subjectId}/discovery`] : []
  }
  if (pathname === '/exam-bank') {
    const keys = ['/exam-bank']
    const detailKey = examBankProblemDetailKeyFromHref(href)
    if (detailKey) keys.push(detailKey)
    keys.push(SIDEBAR_SUMMARY_KEY)
    return keys
  }
  if (pathname === '/exercise-bank') return exerciseBankPreloadKeysFromHref(href)
  if (pathname === '/calendar') {
    const eventDetailKey = calendarEventDetailKeyFromHref(href)
    const keys = [calendarEventsKeyForCurrentWeek(options)]
    if (eventDetailKey) keys.push(eventDetailKey)
    return keys
  }
  if (pathname === '/classement') {
    return [
      '/progress/leaderboard?limit=20&offset=0&include_current=true',
      '/progress/leaderboard/seasons?limit=20&offset=0&include_current=true&season=weekly',
    ]
  }
  if (pathname === '/live') return ['/professor/student-live-sessions', SIDEBAR_SUMMARY_KEY]
  if (pathname === '/professor-chat') return ['/professor/student-chat']
  if (pathname === '/profile') {
    return [
      '/profile/me',
      '/progress/xp',
      '/progress/stats',
      '/progress/badges',
      '/courses/subjects',
      '/courses/topics',
      '/interactions/notes',
      '/interactions/saves',
      SIDEBAR_SUMMARY_KEY,
    ]
  }

  return []
}

export function preloadStudentRouteData(
  href: string,
  mutate: StudentRouteDataMutate,
  options: StudentRoutePreloadOptions = {},
) {
  const scheduledKeys: string[] = []
  const pathname = normalizedPathname(href)
  const scheduledRequests = new Map<string, Promise<unknown>>()
  const fetcher = options.fetcher ?? fetchStudentRouteData

  for (const key of studentRoutePreloadKeys(href, options)) {
    if (hasSuccessfulSWRCacheData(key, options.cache)) continue
    if (preloadedStudentRouteKeys.has(key)) continue

    preloadedStudentRouteKeys.add(key)
    scheduledKeys.push(key)
    const request = fetcher(key)
    scheduledRequests.set(key, request)
    void request.catch(() => {
      preloadedStudentRouteKeys.delete(key)
    })

    try {
      void Promise.resolve(mutate(key, request, { populateCache: true, revalidate: false }))
        .then(() => {
          if (options.cache) preloadedStudentRouteKeys.delete(key)
        })
        .catch(() => {
          preloadedStudentRouteKeys.delete(key)
        })
    } catch {
      preloadedStudentRouteKeys.delete(key)
    }
  }

  if (pathname === '/exercise-bank' && !exerciseBankListKeyFromHref(href)) {
    const subjectsRequest = scheduledRequests.get('/courses/subjects') ?? cachedStudentRouteDataRequest('/courses/subjects', options.cache)
    preloadDefaultExerciseBankList(subjectsRequest, mutate, fetcher, options.cache)
  }

  return scheduledKeys
}

export function clearStudentRoutePreloadState() {
  preloadedStudentRouteKeys.clear()
}

async function fetchStudentRouteData(key: string) {
  const { apiSWRFetcher } = await import('@/lib/apiData')
  return apiSWRFetcher(key)
}

function preloadDefaultExerciseBankList(
  subjectsRequest: Promise<unknown> | undefined,
  mutate: StudentRouteDataMutate,
  fetcher: NonNullable<StudentRoutePreloadOptions['fetcher']>,
  cache: StudentRoutePreloadOptions['cache'],
) {
  if (!subjectsRequest) return

  void subjectsRequest.then((subjects) => {
    const subjectId = firstSubjectId(subjects)
    if (!subjectId) return

    const key = `/exercises/subjects/${subjectId}?limit=50`
    if (hasSuccessfulSWRCacheData(key, cache)) return
    if (preloadedStudentRouteKeys.has(key)) return

    preloadedStudentRouteKeys.add(key)
    const request = fetcher(key)
    void request.catch(() => {
      preloadedStudentRouteKeys.delete(key)
    })

    try {
      void Promise.resolve(mutate(key, request, { populateCache: true, revalidate: false }))
        .then(() => {
          if (cache) preloadedStudentRouteKeys.delete(key)
        })
        .catch(() => {
          preloadedStudentRouteKeys.delete(key)
        })
    } catch {
      preloadedStudentRouteKeys.delete(key)
    }
  }).catch(() => undefined)
}

function cachedStudentRouteDataRequest(key: string, cache: StudentRoutePreloadOptions['cache']) {
  const data = readSuccessfulSWRCacheData(key, cache)
  return data === undefined ? undefined : Promise.resolve(data)
}

function firstSubjectId(subjects: unknown) {
  const subjectList = Array.isArray(subjects) ? subjects : []
  for (const subject of subjectList) {
    if (!subject || typeof subject !== 'object' || !('id' in subject)) continue
    const parsed = Number(subject.id)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

function exerciseBankPreloadKeysFromHref(href: string) {
  const keys = ['/courses/subjects']
  const listKey = exerciseBankListKeyFromHref(href)
  const detailKey = exerciseBankDetailKeyFromHref(href)
  if (listKey) keys.push(listKey)
  if (detailKey) keys.push(detailKey)
  return keys
}

function exerciseBankListKeyFromHref(href: string) {
  const params = searchParamsFromHref(href)
  const subjectId = positiveIntegerParam(params.get('subject'))
  if (!subjectId) return null

  const listParams = new URLSearchParams()
  listParams.set('limit', '50')

  const difficulty = params.get('difficulty')?.trim()
  if (difficulty) listParams.set('difficulty', difficulty)

  const selfGrade = params.get('self_grade')?.trim()
  if (selfGrade) listParams.set('self_grade', selfGrade)

  if (params.get('saved') === 'true') listParams.set('saved', 'true')

  return `/exercises/subjects/${subjectId}?${listParams.toString()}`
}

function exerciseBankDetailKeyFromHref(href: string) {
  const exerciseId = positiveIntegerParam(searchParamsFromHref(href).get('exercise'))
  return exerciseId ? `/exercises/${exerciseId}` : null
}

function examBankProblemDetailKeyFromHref(href: string) {
  const problemId = positiveIntegerParam(searchParamsFromHref(href).get('problem'))
  return problemId ? `/exam-bank/problems/${problemId}` : null
}

function topicWorkspaceKeyFromHref(href: string, pathname: string) {
  const topicId = routeSegmentFromPathname(pathname, '/topics/')
  if (!topicId) return null

  const params = searchParamsFromHref(href)
  const itemId = positiveIntegerParam(params.get('item') ?? params.get('item_id'))
  return `/courses/topics/${topicId}/workspace${itemId ? `?item_id=${itemId}` : ''}`
}

function searchParamsFromHref(href: string) {
  try {
    return new URL(href, 'https://kresco.local').searchParams
  } catch {
    const query = href.split('?')[1]?.split('#')[0]
    return new URLSearchParams(query ?? '')
  }
}

function positiveIntegerParam(value: string | null) {
  if (!value || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizedPathname(href: string) {
  try {
    return new URL(href, 'https://kresco.local').pathname.replace(/\/+$/, '') || '/'
  } catch {
    return href.split('?')[0]?.split('#')[0]?.replace(/\/+$/, '') || '/'
  }
}

function homeSubjectIdFromPathname(pathname: string) {
  return routeSegmentFromPathname(pathname, '/home/')
}

function routeSegmentFromPathname(pathname: string, prefix: string) {
  const rawSegment = pathname.slice(prefix.length).split('/')[0]?.trim()
  if (!rawSegment) return ''

  try {
    return encodeURIComponent(decodeURIComponent(rawSegment))
  } catch {
    return encodeURIComponent(rawSegment)
  }
}

function calendarEventsKeyForCurrentWeek(options: StudentRoutePreloadOptions) {
  const today = startOfDay(options.now ?? new Date())
  const start = startOfWeek(today)
  const end = addDays(start, 6)
  const timezone = options.timezone ?? browserTimeZone()
  const params = new URLSearchParams()
  params.set('start', formatCalendarDate(start))
  params.set('end', formatCalendarDate(end))
  params.set('timezone', timezone)
  return `/calendar/events?${params.toString()}`
}

function calendarEventDetailKeyFromHref(href: string) {
  try {
    return calendarEventDetailKey(new URL(href, 'https://kresco.local').searchParams.get('event'))
  } catch {
    const query = href.split('?')[1]?.split('#')[0]
    return calendarEventDetailKey(query ? new URLSearchParams(query).get('event') : null)
  }
}

function calendarEventDetailKey(value: string | null) {
  if (!value || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? `/calendar/events/${parsed}` : null
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date: Date) {
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  return startOfDay(addDays(date, mondayOffset))
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatCalendarDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
