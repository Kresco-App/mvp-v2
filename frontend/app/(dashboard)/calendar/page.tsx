'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { ChevronLeft, ChevronRight, ExternalLink, Video } from 'lucide-react'
import { useNotificationChannelsSubscription } from '@/hooks/useNotificationChannelsSubscription'
import { apiDataErrorMessage, apiSWRFetcher } from '@/lib/apiData'
import { calendarEventsSWRKey, useCalendarEventDetailData, useCalendarEventsData, type CalendarEvent } from '@/lib/calendarData'
import { showToastError } from '@/lib/lazyToast'
import { hasSuccessfulSWRCacheData } from '@/lib/swrCache'
import {
  addDays,
  addMonths,
  buildMonthGrid,
  dateForCalendarEvent,
  eventsForWeek,
  findCalendarEventById,
  formatCalendarDate,
  isSameCalendarDay,
  parseCalendarEventId,
  startOfDay,
  startOfWeek,
} from '@/lib/calendarViewModel'
import { useAuthStore } from '@/lib/store'
import { PermanentSidebarPanelTitle } from '@/components/figma/permanent-sidebar-title'
import { CalendarPageSkeleton } from '@/components/figma/skeletons'
import { sanitizeNavigationUrl } from '@/lib/urlSafety'

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const miniDayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const hours = Array.from({ length: 24 }, (_, index) => index)
const hourLabels = hours.map((hour) => `${String(hour).padStart(2, '0')}:00`)
const hourHeight = 80
const calendarColumnWidth = 100 / 7
const calendarTimeFormatter = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' })
const calendarEventDateFormatter = new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' })
const calendarMonthFormatter = new Intl.DateTimeFormat([], { month: 'short', year: 'numeric' })
const calendarWeekStartFormatter = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' })
const calendarWeekEndFormatter = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', year: 'numeric' })
const calendarDayLabelFormatter = new Intl.DateTimeFormat([], {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})
const calendarEventControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'

export default function CalendarPage() {
  const searchParams = useSearchParams()
  const { cache: swrCache, mutate: mutateSWRCache } = useSWRConfig()
  const searchKey = searchParams.toString()
  const requestedEventId = useMemo(() => parseCalendarEventId(new URLSearchParams(searchKey)), [searchKey])
  const user = useAuthStore((state) => state.user)
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const calendarScrollRef = useRef<HTMLDivElement | null>(null)
  const preloadedWeekKeysRef = useRef<Set<string>>(new Set())

  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)), [selectedWeekStart])
  const calendarTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const calendarRange = useMemo(() => ({
    start: selectedWeekStart,
    end: selectedWeekEnd,
    timezone: calendarTimeZone,
  }), [calendarTimeZone, selectedWeekEnd, selectedWeekStart])
  const {
    events,
    loading: eventsLoading,
    error: eventsError,
    isValidating: eventsValidating,
    retry: retryEvents,
  } = useCalendarEventsData(calendarRange)
  const {
    event: requestedEvent,
    error: requestedEventError,
  } = useCalendarEventDetailData(requestedEventId)
  const weekEvents = useMemo(() => eventsForWeek(events, selectedWeekStart), [events, selectedWeekStart])
  const weekRangeLabel = useMemo(() => formatWeekRange(weekDays), [weekDays])
  const weekSummary = weekEvents.length === 1 ? '1 scheduled item' : `${weekEvents.length} scheduled items`
  const calendarBusy = eventsLoading || eventsValidating

  useEffect(() => {
    if (!requestedEventId || !requestedEvent) return
    setSelectedEvent(requestedEvent)
    const eventDate = dateForCalendarEvent(requestedEvent)
    if (eventDate) {
      setSelectedDate((current) => (
        isSameCalendarDay(current, eventDate) ? current : eventDate
      ))
    }
  }, [requestedEvent, requestedEventId])

  useEffect(() => {
    if (!requestedEventId) return
    const matchingEvent = findCalendarEventById(events, requestedEventId)
    if (matchingEvent) setSelectedEvent(matchingEvent)
  }, [events, requestedEventId])

  useEffect(() => {
    if (!eventsError) return
    showToastError(apiDataErrorMessage(eventsError, 'Could not load calendar events.'))
  }, [eventsError])

  useEffect(() => {
    if (!requestedEventError) return
    setSelectedEvent(null)
    showToastError(apiDataErrorMessage(requestedEventError, 'Unable to load event details. Please try again.'))
  }, [requestedEventError])

  useEffect(() => {
    if (calendarBusy) return
    const scrollContainer = calendarScrollRef.current
    if (!scrollContainer) return
    if (weekEvents.length === 0) {
      scrollContainer.scrollTop = 0
      return
    }
    const earliest = weekEvents.reduce((current, event) => {
      const startsAt = new Date(event.starts_at)
      if (Number.isNaN(startsAt.getTime())) return current
      return Math.min(current, startsAt.getHours() * 60 + startsAt.getMinutes())
    }, 24 * 60)
    scrollContainer.scrollTop = Math.max(0, (earliest / 60) * hourHeight - hourHeight)
  }, [calendarBusy, weekEvents])

  const retryEventsRef = useRef(retryEvents)

  useEffect(() => {
    retryEventsRef.current = retryEvents
  }, [retryEvents])

  const refreshSubscribedEvents = useCallback((isActive: () => boolean) => {
    if (!isActive()) return
    void retryEventsRef.current().catch(() => undefined)
  }, [])

  useNotificationChannelsSubscription({
    userId: user?.id,
    onMessage: refreshSubscribedEvents,
  })

  function moveWeek(direction: -1 | 1) {
    setSelectedDate((current) => addDays(current, direction * 7))
  }

  function preloadAdjacentWeek(direction: -1 | 1) {
    const start = addDays(selectedWeekStart, direction * 7)
    const key = calendarEventsSWRKey({
      start,
      end: addDays(start, 6),
      timezone: calendarTimeZone,
    })
    if (key && hasSuccessfulSWRCacheData(key, swrCache)) return
    if (!key || preloadedWeekKeysRef.current.has(key)) return

    preloadedWeekKeysRef.current.add(key)
    const request = apiSWRFetcher<CalendarEvent[]>(key)
    void request.catch(() => {
      preloadedWeekKeysRef.current.delete(key)
    })
    void mutateSWRCache(key, request, {
      populateCache: true,
      revalidate: false,
    })
  }

  function jumpToToday() {
    setSelectedDate(startOfDay(new Date()))
  }

  if (eventsLoading && events.length === 0) {
    return <CalendarPageSkeleton />
  }

  return (
    <div className="figma-container pb-[120px]">
      <div className="figma-dashboard-grid calendar-page-grid">
        <main className="min-w-0 pt-11">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="m-0 mb-1 text-[12px] font-black uppercase tracking-[0.12em] text-[#5b60f9]">Schedule</p>
              <h1 className="m-0 text-[24px] font-bold leading-[1.25] tracking-[0.24px] text-[#3f3f46]">
                Your week at a glance
              </h1>
              <p className="m-0 mt-1 text-[15px] font-bold leading-[1.3] tracking-[0.12px] text-[#9f9fa9]">
                {weekRangeLabel} - {weekSummary}
              </p>
            </div>
          </header>

          <section className="w-full bg-white" aria-label="Weekly calendar">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#71717b]">
                {weekRangeLabel}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous week"
                  onClick={() => moveWeek(-1)}
                  onFocus={() => preloadAdjacentWeek(-1)}
                  onMouseOver={() => preloadAdjacentWeek(-1)}
                  onPointerEnter={() => preloadAdjacentWeek(-1)}
                  className={`grid h-10 w-10 place-items-center rounded-[12px] border border-[#e4e4e7] bg-white text-[#52525c] hover:bg-[#f7f8fb] ${calendarEventControlMotionClass}`}
                >
                  <ChevronLeft size={18} strokeWidth={2.6} />
                </button>
                <button type="button" onClick={jumpToToday} className={`h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-bold text-[#52525c] hover:bg-[#f7f8fb] ${calendarEventControlMotionClass}`}>
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Next week"
                  onClick={() => moveWeek(1)}
                  onFocus={() => preloadAdjacentWeek(1)}
                  onMouseOver={() => preloadAdjacentWeek(1)}
                  onPointerEnter={() => preloadAdjacentWeek(1)}
                  className={`grid h-10 w-10 place-items-center rounded-[12px] border border-[#e4e4e7] bg-white text-[#52525c] hover:bg-[#f7f8fb] ${calendarEventControlMotionClass}`}
                >
                  <ChevronRight size={18} strokeWidth={2.6} />
                </button>
              </div>
            </div>

            <div className="w-full overflow-hidden">
              <div className="relative w-full min-w-0">
                <div className="sticky top-0 z-10 flex bg-white">
                  <div className="h-11 w-14 shrink-0 border-2 border-[#e4e4e7]" />
                  {dayNames.map((day) => (
                    <div key={day} className="-ml-0.5 flex h-11 w-[calc((100%_-_56px)_/_7)] shrink-0 items-center justify-center border-2 border-[#e4e4e7] px-1 py-1.5">
                      <span className="text-center text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#71717b] max-[480px]:text-[12px]">{day.slice(0, 3)}</span>
                    </div>
                  ))}
                </div>

                <div ref={calendarScrollRef} className="relative flex max-h-[calc(100vh-260px)] min-h-[420px] overflow-y-auto overflow-x-hidden [contain:layout_paint] max-[760px]:max-h-[560px] max-[480px]:min-h-[360px]">
                  <div className="w-14 shrink-0">
                    {hours.map((hour) => (
                      <div key={hour} className="-mt-0.5 flex h-20 items-end border-2 border-[#e4e4e7] px-1.5 pb-1.5">
                        <span className="text-[14px] font-bold leading-[1.2] tracking-[0.14px] text-[#71717b] tabular-nums max-[480px]:text-[11px]">{formatHour(hour)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="relative flex min-w-0 flex-1">
                    {weekDays.map((day) => (
                      <div key={day.toISOString()} className="-ml-0.5 w-[calc(100%_/_7)] shrink-0">
                        {hours.map((hour) => (
                          <div key={hour} className="-mt-0.5 h-20 border-2 border-[#e4e4e7]" />
                        ))}
                      </div>
                    ))}
                    {weekEvents.map((event) => (
                      <CalendarEventBlock
                        key={event.id}
                        event={event}
                        weekStart={selectedWeekStart}
                        onSelect={setSelectedEvent}
                      />
                    ))}
                    {!calendarBusy && weekEvents.length === 0 && (
                      <div className="absolute inset-x-4 top-16 z-10 rounded-[14px] bg-white px-4 py-3 text-left shadow-[0_12px_28px_rgba(24,24,27,0.08),0_0_0_1px_rgba(24,24,27,0.08)] max-[640px]:inset-x-2 max-[640px]:top-10">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="m-0 text-[14px] font-black leading-[1.2] text-[#3f3f46]">No sessions this week</p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={jumpToToday} className={`h-10 rounded-[12px] bg-[#5b60f9] px-4 text-[12px] font-black text-white shadow-[0_8px_18px_rgba(91,96,249,0.22)] hover:bg-[#484cf0] ${calendarEventControlMotionClass}`}>
                              Go to today
                            </button>
                            <button
                              type="button"
                              onClick={() => moveWeek(1)}
                              onFocus={() => preloadAdjacentWeek(1)}
                              onMouseOver={() => preloadAdjacentWeek(1)}
                              onPointerEnter={() => preloadAdjacentWeek(1)}
                              className={`h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[12px] font-black text-[#52525c] hover:bg-[#f7f8fb] ${calendarEventControlMotionClass}`}
                            >
                              Next week
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {calendarBusy && (
                      <div className="absolute inset-0 grid place-items-center bg-white/60">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5b60f9] border-t-transparent motion-reduce:animate-none" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside className="flex w-[351px] shrink-0 flex-col gap-[14px] pb-[120px] pt-32 max-[1440px]:mt-8 max-[1440px]:w-full max-[1440px]:pt-0">
          <MiniCalendarCard selectedDate={selectedDate} events={events} onSelectDate={setSelectedDate} />
          {selectedEvent && <EventDetailCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
        </aside>
      </div>
    </div>
  )
}

function CalendarEventBlock({
  event,
  weekStart,
  onSelect,
}: {
  event: CalendarEvent
  weekStart: Date
  onSelect: (event: CalendarEvent) => void
}) {
  const start = new Date(event.starts_at)
  const end = new Date(event.ends_at)
  const dayIndex = Math.max(0, Math.min(6, Math.floor((startOfDay(start).getTime() - weekStart.getTime()) / 86400000)))
  const minutesFromStart = start.getHours() * 60 + start.getMinutes()
  const durationMinutes = Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000))
  const top = (minutesFromStart / 60) * hourHeight
  const height = Math.max(62, (durationMinutes / 60) * hourHeight - 2)
  const left = `${dayIndex * calendarColumnWidth}%`

  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
      <foreignObject x={left} y={top} width={`${calendarColumnWidth}%`} height={height} className="pointer-events-none overflow-visible">
        <button
          type="button"
          onClick={() => onSelect(event)}
          className={`pointer-events-auto mx-0.5 flex h-full w-[calc(100%-4px)] flex-col items-start justify-between overflow-hidden rounded-[6px] border-0 px-2 py-1.5 text-left font-bold leading-[1.2] shadow-none ${calendarEventToneClass(event)}`}
        >
          <span className="line-clamp-2 w-full text-[14px] tracking-[0.14px] text-white">{event.title}</span>
          <span className="w-full truncate text-[12px] tracking-[0.12px] text-[#c4d1ff]">{event.teacher_name || event.subtitle}</span>
        </button>
      </foreignObject>
    </svg>
  )
}

function MiniCalendarCard({
  selectedDate,
  events,
  onSelectDate,
}: {
  selectedDate: Date
  events: CalendarEvent[]
  onSelectDate: (date: Date) => void
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const days = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth])
  const today = useMemo(() => startOfDay(new Date()), [])
  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const eventDayKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const event of events) {
      const date = dateForCalendarEvent(event)
      if (date) keys.add(formatCalendarDate(date))
    }
    return keys
  }, [events])

  useEffect(() => {
    const nextMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    setVisibleMonth((currentMonth) => {
      if (currentMonth.getFullYear() === nextMonth.getFullYear() && currentMonth.getMonth() === nextMonth.getMonth()) {
        return currentMonth
      }
      return nextMonth
    })
  }, [selectedDate])

  function moveVisibleMonth(direction: -1 | 1) {
    setVisibleMonth((currentMonth) => addMonths(currentMonth, direction))
  }

  return (
    <section className="w-[351px] rounded-2xl border-2 border-[#e4e4e7] bg-white px-[18px] pb-6 pt-[18px] shadow-none max-[1180px]:w-full">
      <PermanentSidebarPanelTitle title="Calendar" subtitle="Stay up to date with everything!" />
      <div className="mt-6 flex items-start py-1.5">
        <div className="flex min-w-0 flex-1 items-center overflow-hidden px-3">
          <strong className="text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#3f3f46]">
            {formatMonth(visibleMonth)}
          </strong>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => moveVisibleMonth(-1)}
            className={`grid h-10 w-10 place-items-center rounded-[12px] border-0 bg-transparent text-[#3f3f46] hover:bg-[#f4f4f5] ${calendarEventControlMotionClass}`}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => moveVisibleMonth(1)}
            className={`grid h-10 w-10 place-items-center rounded-[12px] border-0 bg-transparent text-[#3f3f46] hover:bg-[#f4f4f5] ${calendarEventControlMotionClass}`}
            aria-label="Next month"
          >
            <ChevronRight size={18} strokeWidth={3} />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7">
        {miniDayNames.map((day) => (
          <div key={day} className="grid h-9 place-items-center p-1">
            <span className="text-center text-[15px] font-bold leading-[1.2] tracking-[0.15px] text-[#9f9fa9]">{day}</span>
          </div>
        ))}
      </div>
      <div className="relative mt-1 grid min-h-[270px] grid-cols-7 gap-y-1 overflow-hidden">
        {days.map((day) => {
          const isSelected = isSameCalendarDay(day.date, selectedDate)
          const isCurrentMonth = day.date.getMonth() === visibleMonth.getMonth()
          const isToday = isSameCalendarDay(day.date, today)
          const isSelectedWeek = isSameCalendarDay(startOfWeek(day.date), selectedWeekStart)
          const hasEvents = eventDayKeys.has(formatCalendarDate(day.date))
          const dayLabel = calendarDayLabelFormatter.format(day.date)

          return (
            <div key={day.date.toISOString()} className="grid h-11 place-items-center">
              <button
                type="button"
                onClick={() => onSelectDate(startOfDay(day.date))}
                className={`relative grid h-10 w-10 place-items-center overflow-hidden rounded-[11px] border-0 p-0 text-[16px] font-bold leading-[1.2] tracking-[0.16px] hover:-translate-y-px motion-reduce:hover:translate-y-0 ${calendarEventControlMotionClass} ${
                  isSelected
                    ? 'bg-[#4f46f8] text-white shadow-[0_10px_20px_rgba(79,70,248,0.25)]'
                    : isSelectedWeek
                      ? 'bg-[#f7f7ff] text-[#3f3f46] hover:bg-[#eeeeff]'
                      : isCurrentMonth
                        ? 'bg-transparent text-[#3f3f46] hover:bg-[#f7f7ff]'
                        : 'bg-transparent text-[#a1a1aa] hover:bg-[#fafafa]'
                }`}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected}
                aria-label={`${dayLabel}${isToday ? ', today' : ''}${hasEvents ? ', scheduled items' : ''}`}
              >
                {isToday && !isSelected && (
                  <span className="absolute inset-[3px] rounded-[9px] ring-2 ring-[#d4d4ff]" />
                )}
                <span className="relative z-10">{day.date.getDate()}</span>
                {(isToday || hasEvents) && (
                  <span
                    className={`absolute bottom-1.5 z-10 h-1 w-1 rounded-full ${
                      isSelected ? 'bg-white' : hasEvents ? 'bg-[#5b60f9]' : 'bg-[#4f46f8]'
                    }`}
                  />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EventDetailCard({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const preparationHref = sanitizeRelativeAppHref(event.preparation_href)
  const joinUrl = sanitizeNavigationUrl(event.join_url, { allowRelative: false })

  return (
    <section
      key={event.id}
      className="w-[351px] rounded-2xl border-2 border-[#e4e4e7] bg-white px-[18px] pb-6 pt-[18px] shadow-none max-[1180px]:w-full"
    >
      <div className="flex items-start justify-between gap-3">
        <PermanentSidebarPanelTitle title="Event Details" subtitle={event.event_type === 'live_session' ? 'Live preparation' : 'Study block'} />
        <button type="button" onClick={onClose} className={`h-10 rounded-[10px] border-0 bg-[#f4f4f5] px-3 text-[12px] font-bold text-[#71717b] hover:bg-[#e9e9ef] ${calendarEventControlMotionClass}`}>
          Close
        </button>
      </div>
      <div className={`mt-6 rounded-lg p-3 text-white ${calendarEventToneClass(event)}`}>
        <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-[#c4d1ff]">
          <Video size={14} aria-hidden="true" />
          {event.status}
        </div>
        <h2 className="m-0 text-[16px] font-bold leading-[1.2] tracking-[0.16px]">{event.title}</h2>
        <p className="m-0 mt-3 text-[12px] font-bold leading-[1.2] tracking-[0.12px] text-[#c4d1ff]">{event.teacher_name || event.subtitle}</p>
      </div>
      <div className="mt-5 grid gap-3 text-[14px] font-bold leading-[1.2] tracking-[0.14px]">
        <InfoRow label="Time" value={`${formatEventDate(new Date(event.starts_at))} - ${formatTime(new Date(event.ends_at))}`} />
        <InfoRow label="Subject" value={event.subject_title || event.subtitle || '-'} />
        <InfoRow label="Topic" value={event.topic_title || '-'} />
      </div>
      {event.description && (
        <p className="m-0 mt-5 text-[14px] font-semibold leading-[1.35] tracking-[0.14px] text-[#71717b]">
          {event.description}
        </p>
      )}
      <div className="mt-5 grid gap-2">
        {preparationHref && (
          <Link href={preparationHref} className={`figma-button h-11 w-full shadow-none ${calendarEventControlMotionClass}`}>
            Prepare
            <ExternalLink size={15} aria-hidden="true" />
          </Link>
        )}
        {joinUrl ? (
          <a href={joinUrl} className={`figma-button secondary h-11 ${calendarEventControlMotionClass}`} target="_blank" rel="noopener noreferrer">
            Join session
          </a>
        ) : (
          <button type="button" disabled className="h-11 rounded-[14px] border-0 bg-[#f4f4f5] text-[13px] font-black text-[#9f9fa9]">
            Join unavailable
          </button>
        )}
      </div>
    </section>
  )
}

function sanitizeRelativeAppHref(value?: string | null) {
  const href = sanitizeNavigationUrl(value, { allowRelative: true })
  return href.startsWith('/') ? href : ''
}

function calendarEventToneClass(event: CalendarEvent) {
  const color = event.color?.toLowerCase()
  if (event.event_type === 'study_block' || color === '#29aee4') return 'calendar-event-tone-sky'
  if (event.status === 'live') return 'calendar-event-tone-amber'
  return 'calendar-event-tone-purple'
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f4f5] px-3 py-2">
      <span className="text-[#9f9fa9]">{label}</span>
      <span className="min-w-0 truncate text-right text-[#3f3f46] tabular-nums">{value}</span>
    </div>
  )
}

function formatHour(hour: number) {
  return hourLabels[hour] ?? `${String(hour).padStart(2, '0')}:00`
}

function formatTime(date: Date) {
  return calendarTimeFormatter.format(date)
}

function formatEventDate(date: Date) {
  return `${calendarEventDateFormatter.format(date)} ${formatTime(date)}`
}

function formatMonth(date: Date) {
  return calendarMonthFormatter.format(date)
}

function formatWeekRange(days: Date[]) {
  const first = days[0]
  const last = days[days.length - 1]
  return `${calendarWeekStartFormatter.format(first)} - ${calendarWeekEndFormatter.format(last)}`
}

