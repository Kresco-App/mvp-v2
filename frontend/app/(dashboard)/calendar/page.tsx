'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Video } from 'lucide-react'
import { toast } from 'sonner'
import { getJson } from '@/lib/apiClient'
import { useNotificationChannelsSubscription } from '@/hooks/useNotificationChannelsSubscription'
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
import { PermanentSidebarPanelTitle } from '@/components/figma'
import { CalendarPageSkeleton } from '@/components/figma/skeletons'

type CalendarEvent = {
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

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const miniDayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const hours = Array.from({ length: 24 }, (_, index) => index)
const hourHeight = 80
const calendarColumnWidth = 100 / 7
const miniCalendarSelectionTransition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 } as const

export default function CalendarPage() {
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const requestedEventId = useMemo(() => parseCalendarEventId(new URLSearchParams(searchKey)), [searchKey])
  const user = useAuthStore((state) => state.user)
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const calendarScrollRef = useRef<HTMLDivElement | null>(null)

  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)), [selectedWeekStart])
  const weekEvents = useMemo(() => eventsForWeek(events, selectedWeekStart), [events, selectedWeekStart])
  const calendarTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const weekRangeLabel = useMemo(() => formatWeekRange(weekDays), [weekDays])
  const weekSummary = weekEvents.length === 1 ? '1 scheduled item' : `${weekEvents.length} scheduled items`

  function jumpToToday() {
    setSelectedDate(startOfDay(new Date()))
  }

  useEffect(() => {
    if (!requestedEventId) return
    let alive = true

    getJson<CalendarEvent>(`/calendar/events/${requestedEventId}`)
      .then((event) => {
        if (!alive) return
        setSelectedEvent(event)
        const eventDate = dateForCalendarEvent(event)
        if (eventDate) setSelectedDate(eventDate)
      })
      .catch(() => {
        if (!alive) return
        setSelectedEvent(null)
        toast.error('Unable to load event details. Please try again.')
      })

    return () => {
      alive = false
    }
  }, [requestedEventId])

  const loadEventsForWeek = useCallback(async (alive: () => boolean) => {
    setLoading(true)
    try {
      const data = await getJson<CalendarEvent[]>('/calendar/events', {
        params: {
          start: formatCalendarDate(selectedWeekStart),
          end: formatCalendarDate(addDays(selectedWeekStart, 6)),
          timezone: calendarTimeZone,
        },
      })
      if (!alive()) return
      const nextEvents = Array.isArray(data) ? data : []
      setEvents(nextEvents)
      if (requestedEventId) {
        setSelectedEvent(findCalendarEventById(nextEvents, requestedEventId))
      }
    } catch {
      toast.error('Could not load calendar events.')
    } finally {
      if (alive()) setLoading(false)
    }
  }, [calendarTimeZone, requestedEventId, selectedWeekStart])
  const loadEventsForWeekRef = useRef(loadEventsForWeek)

  useEffect(() => {
    loadEventsForWeekRef.current = loadEventsForWeek
  }, [loadEventsForWeek])

  useEffect(() => {
    let alive = true
    void loadEventsForWeek(() => alive)
    return () => { alive = false }
  }, [loadEventsForWeek])

  useEffect(() => {
    if (loading) return
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
  }, [loading, weekEvents])

  const refreshSubscribedEvents = useCallback((isActive: () => boolean) => {
    void loadEventsForWeekRef.current(isActive)
  }, [])

  useNotificationChannelsSubscription({
    userId: user?.id,
    onMessage: refreshSubscribedEvents,
  })

  function moveWeek(direction: -1 | 1) {
    setSelectedDate((current) => addDays(current, direction * 7))
  }

  if (loading && events.length === 0) {
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
                <button type="button" onClick={() => moveWeek(-1)} className="grid h-10 w-10 place-items-center rounded-[12px] border border-[#e4e4e7] bg-white text-[#52525c] transition-[background-color,border-color,color,transform] active:scale-[0.96] hover:bg-[#f7f8fb]">
                  <ChevronLeft size={18} strokeWidth={2.6} />
                </button>
                <button type="button" onClick={jumpToToday} className="h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-bold text-[#52525c] transition-[background-color,border-color,color,transform] active:scale-[0.96] hover:bg-[#f7f8fb]">
                  Today
                </button>
                <button type="button" onClick={() => moveWeek(1)} className="grid h-10 w-10 place-items-center rounded-[12px] border border-[#e4e4e7] bg-white text-[#52525c] transition-[background-color,border-color,color,transform] active:scale-[0.96] hover:bg-[#f7f8fb]">
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

                <div ref={calendarScrollRef} className="relative flex max-h-[calc(100vh-260px)] min-h-[420px] overflow-y-auto overflow-x-hidden max-[760px]:max-h-[560px] max-[480px]:min-h-[360px]">
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
                    {!loading && weekEvents.length === 0 && (
                      <div className="absolute inset-x-4 top-16 z-10 rounded-[14px] border border-[#dfe2ea] bg-white px-5 py-4 text-left shadow-[0_14px_35px_rgba(24,24,27,0.08)] max-[640px]:inset-x-2 max-[640px]:top-10">
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#eef2ff] text-[#5b60f9]">
                            <CalendarDays size={20} strokeWidth={2.6} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-[15px] font-black leading-[1.25] text-[#3f3f46]">No scheduled sessions this week</p>
                            <p className="m-0 mt-1 max-w-[420px] text-[12px] font-bold leading-[1.35] text-[#71717b]">
                              Your calendar is clear for this range. Jump back to today or browse nearby weeks for live sessions and study blocks.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={jumpToToday} className="h-10 rounded-[12px] border border-[#e4e4e7] bg-[#5b60f9] px-3 text-[12px] font-black text-white transition-[background-color,border-color,color,transform] active:scale-[0.96] hover:bg-[#484cf0]">
                                Today
                              </button>
                              <button type="button" onClick={() => moveWeek(1)} className="h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#52525c] transition-[background-color,border-color,color,transform] active:scale-[0.96] hover:bg-[#f7f8fb]">
                                Next week
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {loading && (
                      <div className="absolute inset-0 grid place-items-center bg-white/60">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5b60f9] border-t-transparent" />
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
  const [monthDirection, setMonthDirection] = useState(0)
  const days = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth])
  const today = useMemo(() => startOfDay(new Date()), [])
  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const visibleMonthKey = `${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}`
  const eventDayKeys = useMemo(() => {
    return new Set(
      events
        .map((event) => dateForCalendarEvent(event))
        .filter((date): date is Date => Boolean(date))
        .map((date) => formatCalendarDate(date)),
    )
  }, [events])

  useEffect(() => {
    const nextMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    setVisibleMonth((currentMonth) => {
      if (currentMonth.getFullYear() === nextMonth.getFullYear() && currentMonth.getMonth() === nextMonth.getMonth()) {
        return currentMonth
      }
      setMonthDirection(nextMonth.getTime() > currentMonth.getTime() ? 1 : -1)
      return nextMonth
    })
  }, [selectedDate])

  function moveVisibleMonth(direction: -1 | 1) {
    setMonthDirection(direction)
    setVisibleMonth((currentMonth) => addMonths(currentMonth, direction))
  }

  return (
    <section className="w-[351px] rounded-2xl border-2 border-[#e4e4e7] bg-white px-[18px] pb-6 pt-[18px] shadow-none max-[1180px]:w-full">
      <PermanentSidebarPanelTitle title="Calendar" subtitle="Stay up to date with everything!" />
      <div className="mt-6 flex items-start py-1.5">
        <div className="flex min-w-0 flex-1 items-center overflow-hidden px-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.strong
              key={visibleMonthKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#3f3f46]"
            >
              {formatMonth(visibleMonth)}
            </motion.strong>
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 gap-1">
          <motion.button
            type="button"
            onClick={() => moveVisibleMonth(-1)}
            className="grid h-10 w-10 place-items-center rounded-[12px] border-0 bg-transparent text-[#3f3f46] outline-none transition-colors hover:bg-[#f4f4f5] focus-visible:ring-2 focus-visible:ring-[#c7c8ff]"
            whileTap={{ scale: 0.96 }}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} strokeWidth={3} />
          </motion.button>
          <motion.button
            type="button"
            onClick={() => moveVisibleMonth(1)}
            className="grid h-10 w-10 place-items-center rounded-[12px] border-0 bg-transparent text-[#3f3f46] outline-none transition-colors hover:bg-[#f4f4f5] focus-visible:ring-2 focus-visible:ring-[#c7c8ff]"
            whileTap={{ scale: 0.96 }}
            aria-label="Next month"
          >
            <ChevronRight size={18} strokeWidth={3} />
          </motion.button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7">
        {miniDayNames.map((day) => (
          <div key={day} className="grid h-9 place-items-center p-1">
            <span className="text-center text-[15px] font-bold leading-[1.2] tracking-[0.15px] text-[#9f9fa9]">{day}</span>
          </div>
        ))}
      </div>
      <LayoutGroup id="mini-calendar">
        <div className="relative mt-1 min-h-[270px] overflow-hidden">
          <AnimatePresence initial={false} custom={monthDirection} mode="wait">
            <motion.div
              key={visibleMonthKey}
              custom={monthDirection}
              initial={{ opacity: 0, x: monthDirection >= 0 ? 14 : -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: monthDirection >= 0 ? -14 : 14 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-0 grid grid-cols-7 gap-y-1"
            >
              {days.map((day) => {
                const isSelected = isSameCalendarDay(day.date, selectedDate)
                const isCurrentMonth = day.date.getMonth() === visibleMonth.getMonth()
                const isToday = isSameCalendarDay(day.date, today)
                const isSelectedWeek = isSameCalendarDay(startOfWeek(day.date), selectedWeekStart)
                const hasEvents = eventDayKeys.has(formatCalendarDate(day.date))
                const dayLabel = day.date.toLocaleDateString([], {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })

                return (
                  <div key={day.date.toISOString()} className="grid h-11 place-items-center">
                    <motion.button
                      type="button"
                      onClick={() => onSelectDate(startOfDay(day.date))}
                      className={`relative grid h-10 w-10 place-items-center overflow-hidden rounded-[11px] border-0 bg-transparent p-0 text-[16px] font-bold leading-[1.2] tracking-[0.16px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#c7c8ff] ${
                        isSelected
                          ? 'text-white'
                          : isCurrentMonth
                            ? 'text-[#3f3f46] hover:bg-[#f7f7ff]'
                            : 'text-[#a1a1aa] hover:bg-[#fafafa]'
                      }`}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      transition={miniCalendarSelectionTransition}
                      aria-current={isToday ? 'date' : undefined}
                      aria-pressed={isSelected}
                      aria-label={`${dayLabel}${isToday ? ', today' : ''}${hasEvents ? ', scheduled items' : ''}`}
                    >
                      {isSelectedWeek && !isSelected && (
                        <motion.span
                          layout
                          className="absolute inset-1 rounded-[9px] bg-[#f7f7ff]"
                          transition={miniCalendarSelectionTransition}
                        />
                      )}
                      {isToday && !isSelected && (
                        <span className="absolute inset-[3px] rounded-[9px] ring-2 ring-[#d4d4ff]" />
                      )}
                      {isSelected && (
                        <motion.span
                          layoutId="mini-calendar-selected-day"
                          className="absolute inset-0 rounded-[11px] bg-[#4f46f8] shadow-[0_10px_20px_rgba(79,70,248,0.25)]"
                          transition={miniCalendarSelectionTransition}
                        />
                      )}
                      <span className="relative z-10">{day.date.getDate()}</span>
                      {(isToday || hasEvents) && (
                        <span
                          className={`absolute bottom-1.5 z-10 h-1 w-1 rounded-full ${
                            isSelected ? 'bg-white' : hasEvents ? 'bg-[#5b60f9]' : 'bg-[#4f46f8]'
                          }`}
                        />
                      )}
                    </motion.button>
                  </div>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </section>
  )
}

function EventDetailCard({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return (
    <motion.section
      key={event.id}
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="w-[351px] rounded-2xl border-2 border-[#e4e4e7] bg-white px-[18px] pb-6 pt-[18px] shadow-none max-[1180px]:w-full"
    >
      <div className="flex items-start justify-between gap-3">
        <PermanentSidebarPanelTitle title="Event Details" subtitle={event.event_type === 'live_session' ? 'Live preparation' : 'Study block'} />
        <motion.button type="button" onClick={onClose} className="h-10 rounded-[10px] border-0 bg-[#f4f4f5] px-3 text-[12px] font-bold text-[#71717b]" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
          Close
        </motion.button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.04, ease: [0.2, 0.8, 0.2, 1] }}
        className={`mt-6 rounded-lg p-3 text-white ${calendarEventToneClass(event)}`}
      >
        <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-[#c4d1ff]">
          <Video size={14} />
          {event.status}
        </div>
        <h2 className="m-0 text-[16px] font-bold leading-[1.2] tracking-[0.16px]">{event.title}</h2>
        <p className="m-0 mt-3 text-[12px] font-bold leading-[1.2] tracking-[0.12px] text-[#c4d1ff]">{event.teacher_name || event.subtitle}</p>
      </motion.div>
      <div className="mt-5 grid gap-3 text-[14px] font-bold leading-[1.2] tracking-[0.14px]">
        <InfoRow index={0} label="Time" value={`${formatEventDate(new Date(event.starts_at))} - ${formatTime(new Date(event.ends_at))}`} />
        <InfoRow index={1} label="Subject" value={event.subject_title || event.subtitle || '-'} />
        <InfoRow index={2} label="Topic" value={event.topic_title || '-'} />
      </div>
      {event.description && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
          className="m-0 mt-5 text-[14px] font-semibold leading-[1.35] tracking-[0.14px] text-[#71717b]"
        >
          {event.description}
        </motion.p>
      )}
      <div className="mt-5 grid gap-2">
        {event.preparation_href && (
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
            <Link href={event.preparation_href} className="figma-button h-11 w-full shadow-none">
            Prepare
            <ExternalLink size={15} />
            </Link>
          </motion.div>
        )}
        {event.join_url ? (
          <motion.a href={event.join_url} className="figma-button secondary h-11" target="_blank" rel="noreferrer" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
              Join session
          </motion.a>
        ) : (
          <button type="button" disabled className="h-11 rounded-[14px] border-0 bg-[#f4f4f5] text-[13px] font-black text-[#9f9fa9]">
            Join unavailable
          </button>
        )}
      </div>
    </motion.section>
  )
}

function calendarEventToneClass(event: CalendarEvent) {
  const color = event.color?.toLowerCase()
  if (event.event_type === 'study_block' || color === '#29aee4') return 'calendar-event-tone-sky'
  if (event.status === 'live') return 'calendar-event-tone-amber'
  return 'calendar-event-tone-purple'
}

function InfoRow({ label, value, index = 0 }: { label: string; value: string; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, delay: 0.08 + index * 0.035, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f4f5] px-3 py-2"
    >
      <span className="text-[#9f9fa9]">{label}</span>
      <span className="min-w-0 truncate text-right text-[#3f3f46] tabular-nums">{value}</span>
    </motion.div>
  )
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatEventDate(date: Date) {
  return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${formatTime(date)}`
}

function formatMonth(date: Date) {
  return date.toLocaleDateString([], { month: 'short', year: 'numeric' })
}

function formatWeekRange(days: Date[]) {
  const first = days[0]
  const last = days[days.length - 1]
  return `${first.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${last.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
}

