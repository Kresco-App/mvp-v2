import useSWR from 'swr'
import { apiSWRFetcher } from '@/lib/apiData'
import { formatCalendarDate } from '@/lib/calendarViewModel'

export type CalendarEvent = {
  id: number
  event_type: 'live_session' | 'study_block'
  title: string
  subtitle: string
  teacher_name: string
  subject_id?: number | null
  subject_title: string
  topic_id?: number | null
  topic_title: string
  starts_at: string
  ends_at: string
  description: string
  preparation_href: string
  join_url: string
  status: string
  color: string
}

export type CalendarEventsRange = {
  start: Date
  end: Date
  timezone: string
}

export function calendarEventsSWRKey(range: CalendarEventsRange | null | undefined) {
  if (!range) return null
  const params = new URLSearchParams()
  params.set('start', formatCalendarDate(range.start))
  params.set('end', formatCalendarDate(range.end))
  params.set('timezone', range.timezone || 'UTC')
  return `/calendar/events?${params.toString()}`
}

export function calendarEventDetailSWRKey(eventId: number | string | null | undefined) {
  const normalized = positiveCalendarEventId(eventId)
  return normalized ? `/calendar/events/${normalized}` : null
}

export function useCalendarEventsData(range: CalendarEventsRange | null | undefined) {
  const query = useSWR<CalendarEvent[]>(calendarEventsSWRKey(range), apiSWRFetcher, {
    keepPreviousData: true,
  })
  const events = Array.isArray(query.data) ? query.data : []

  return {
    events,
    loading: query.isLoading && !query.data,
    error: query.error ?? null,
    isValidating: query.isValidating,
    retry: query.mutate,
  }
}

export function useCalendarEventDetailData(eventId: number | string | null | undefined) {
  const normalized = positiveCalendarEventId(eventId)
  const query = useSWR<CalendarEvent>(calendarEventDetailSWRKey(normalized), apiSWRFetcher, {
    keepPreviousData: true,
  })
  const event = query.data?.id === normalized ? query.data : null

  return {
    event,
    loading: Boolean(normalized) && query.isLoading && !event,
    error: query.error ?? null,
    isValidating: query.isValidating,
    retry: query.mutate,
  }
}

function positiveCalendarEventId(eventId: number | string | null | undefined) {
  const numeric = typeof eventId === 'number' ? eventId : Number(eventId)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}
