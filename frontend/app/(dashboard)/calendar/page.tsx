'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ExternalLink, Video } from 'lucide-react'
import { toast } from 'sonner'
import { listKrescoRealtimeSubscriptions, subscribeKrescoRealtimeChannels, userNotificationsChannelName } from '@/lib/ably'
import { getJson } from '@/lib/apiClient'
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
  const calendarTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const firstName = user?.full_name?.split(' ')?.[0] || 'Khalid'

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

  useEffect(() => {
    let alive = true
    void loadEventsForWeek(() => alive)
    return () => { alive = false }
  }, [loadEventsForWeek])

  useEffect(() => {
    if (loading) return
    const scrollContainer = calendarScrollRef.current
    if (!scrollContainer) return
    const weekEvents = eventsForWeek(events, selectedWeekStart)
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
  }, [events, loading, selectedWeekStart])

  useEffect(() => {
    if (!user?.id) return
    const userId = user.id
    let cleanup = () => {}
    let stopped = false
    const refresh = () => void loadEventsForWeek(() => true)
    void listKrescoRealtimeSubscriptions()
      .then(({ notification_channels }) => {
        if (stopped) return
        cleanup = subscribeKrescoRealtimeChannels({
          channelNames: notification_channels,
          onMessage: refresh,
        })
      })
      .catch(() => {
        if (stopped) return
        cleanup = subscribeKrescoRealtimeChannels({
          channelNames: [userNotificationsChannelName(userId)],
          onMessage: refresh,
        })
      })
    return () => {
      stopped = true
      cleanup()
    }
  }, [loadEventsForWeek, user?.id])

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
          <header className="mb-8">
            <h1 className="m-0 text-[24px] font-bold leading-[1.4] tracking-[0.24px] text-[#3f3f46]">
              Hello {firstName}!
            </h1>
            <p className="m-0 text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">
              Wanna complete where we left off last time?
            </p>
          </header>

          <section className="w-full bg-white" aria-label="Weekly calendar">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#71717b]">
                {formatWeekRange(weekDays)}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveWeek(-1)} className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#52525c]">
                  <ChevronLeft size={18} strokeWidth={2.6} />
                </button>
                <button type="button" onClick={() => setSelectedDate(startOfDay(new Date()))} className="h-9 rounded-[10px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-bold text-[#52525c]">
                  Today
                </button>
                <button type="button" onClick={() => moveWeek(1)} className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#52525c]">
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
                        <span className="text-[14px] font-bold leading-[1.2] tracking-[0.14px] text-[#71717b] max-[480px]:text-[11px]">{formatHour(hour)}</span>
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
                    {eventsForWeek(events, selectedWeekStart).map((event) => (
                      <CalendarEventBlock
                        key={event.id}
                        event={event}
                        weekStart={selectedWeekStart}
                        onSelect={setSelectedEvent}
                      />
                    ))}
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
          <MiniCalendarCard selectedDate={selectedDate} onSelectDate={setSelectedDate} />
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

function MiniCalendarCard({ selectedDate, onSelectDate }: { selectedDate: Date; onSelectDate: (date: Date) => void }) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const days = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth])

  useEffect(() => {
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [selectedDate])

  return (
    <section className="w-[351px] rounded-2xl border-2 border-[#e4e4e7] bg-white px-[18px] pb-6 pt-[18px] shadow-none max-[1180px]:w-full">
      <PermanentSidebarPanelTitle title="Calendar" subtitle="Stay up to date with everything!" />
      <div className="mt-6 flex items-start py-2">
        <div className="flex min-w-0 flex-1 items-center px-3">
          <strong className="text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#3f3f46]">{formatMonth(visibleMonth)}</strong>
        </div>
        <div className="flex shrink-0">
          <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} className="grid h-8 w-8 place-items-center rounded-md border-0 bg-transparent text-[#3f3f46]">
            <ChevronLeft size={18} strokeWidth={3} />
          </button>
          <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} className="grid h-8 w-8 place-items-center rounded-md border-0 bg-transparent text-[#3f3f46]">
            <ChevronRight size={18} strokeWidth={3} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7">
        {miniDayNames.map((day) => (
          <div key={day} className="grid h-[45px] place-items-center p-2">
            <span className="text-center text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#9f9fa9]">{day}</span>
          </div>
        ))}
        {days.map((day) => {
          const isSelected = isSameCalendarDay(day.date, selectedDate)
          const isCurrentMonth = day.date.getMonth() === visibleMonth.getMonth()
          return (
            <button
              type="button"
              key={day.date.toISOString()}
              onClick={() => onSelectDate(startOfDay(day.date))}
              className={`grid h-[45px] place-items-center rounded-md border-0 p-1 text-[16px] font-bold leading-[1.2] tracking-[0.16px] ${
                isSelected ? 'bg-[#453dee] text-white' : isCurrentMonth ? 'bg-transparent text-[#3f3f46]' : 'bg-transparent text-[#9f9fa9]'
              }`}
            >
              {day.date.getDate()}
            </button>
          )
        })}
      </div>
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
        <motion.button type="button" onClick={onClose} className="h-8 rounded-md border-0 bg-[#f4f4f5] px-3 text-[12px] font-bold text-[#71717b]" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
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
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }}>
            <Link href={event.preparation_href} className="figma-button h-11 w-full shadow-none">
            Prepare
            <ExternalLink size={15} />
            </Link>
          </motion.div>
        )}
        {event.join_url ? (
          <motion.a href={event.join_url} className="figma-button secondary h-11" target="_blank" rel="noreferrer" whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }}>
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
      <span className="min-w-0 truncate text-right text-[#3f3f46]">{value}</span>
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

