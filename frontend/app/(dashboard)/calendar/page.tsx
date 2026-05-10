'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, ExternalLink, Video } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/lib/store'
import { PermanentSidebarPanelTitle } from '@/components/figma'

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
const dayWidth = 220
const timeWidth = 100

export default function CalendarPage() {
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [loading, setLoading] = useState(true)

  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)), [selectedWeekStart])
  const firstName = user?.full_name?.split(' ')?.[0] || 'Khalid'

  useEffect(() => { document.title = 'Calendar - Kresco' }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get('/calendar/events', {
      params: {
        start: formatDate(selectedWeekStart),
        end: formatDate(addDays(selectedWeekStart, 6)),
      },
    })
      .then((res) => {
        if (!alive) return
        setEvents(res.data)
        const eventId = Number(searchParams.get('event'))
        if (eventId) {
          const match = res.data.find((event: CalendarEvent) => event.id === eventId)
          if (match) setSelectedEvent(match)
        }
      })
      .catch(() => toast.error('Could not load calendar events.'))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [selectedWeekStart, searchParams])

  function moveWeek(direction: -1 | 1) {
    setSelectedDate((current) => addDays(current, direction * 7))
  }

  return (
    <div className="figma-container pb-[120px]">
      <div className="figma-dashboard-grid">
        <main className="min-w-0 pt-11">
          <header className="mb-8">
            <h1 className="m-0 text-[24px] font-bold leading-[1.4] tracking-[0.24px] text-[#3f3f46]">
              Hello {firstName}!
            </h1>
            <p className="m-0 text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">
              Wanna complete where we left off last time?
            </p>
          </header>

          <section className="w-full overflow-hidden bg-white" aria-label="Weekly calendar">
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

            <div className="w-full overflow-x-auto overflow-y-hidden">
              <div className="relative" style={{ width: timeWidth + dayWidth * 7 }}>
                <div className="sticky top-0 z-10 flex bg-white">
                  <div className="h-11 shrink-0 border-2 border-[#e4e4e7]" style={{ width: timeWidth }} />
                  {dayNames.map((day) => (
                    <div key={day} className="-ml-0.5 flex h-11 shrink-0 items-center justify-center border-2 border-[#e4e4e7] px-3 py-1.5" style={{ width: dayWidth }}>
                      <span className="text-center text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#71717b]">{day}</span>
                    </div>
                  ))}
                </div>

                <div className="relative flex">
                  <div className="shrink-0" style={{ width: timeWidth }}>
                    {hours.map((hour) => (
                      <div key={hour} className="-mt-0.5 flex h-20 items-end border-2 border-[#e4e4e7] px-3 pb-1.5">
                        <span className="text-[14px] font-bold leading-[1.2] tracking-[0.14px] text-[#71717b]">{formatHour(hour)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="relative flex">
                    {weekDays.map((day) => (
                      <div key={day.toISOString()} className="-ml-0.5 shrink-0" style={{ width: dayWidth }}>
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

        <aside className="flex w-[351px] shrink-0 flex-col gap-[14px] pb-[120px] pt-32 max-[1180px]:mt-8 max-[1180px]:w-full max-[1180px]:pt-0">
          <MiniCalendarCard selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          {selectedEvent && <EventDetailCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
        </aside>
      </div>
    </div>
  )
}

function CalendarEventBlock({ event, weekStart, onSelect }: { event: CalendarEvent; weekStart: Date; onSelect: (event: CalendarEvent) => void }) {
  const start = new Date(event.starts_at)
  const end = new Date(event.ends_at)
  const dayIndex = Math.max(0, Math.min(6, Math.floor((startOfDay(start).getTime() - weekStart.getTime()) / 86400000)))
  const minutesFromStart = start.getHours() * 60 + start.getMinutes()
  const durationMinutes = Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000))
  const top = (minutesFromStart / 60) * hourHeight
  const height = Math.max(62, (durationMinutes / 60) * hourHeight - 2)
  const color = event.color || (event.event_type === 'study_block' ? '#29aee4' : '#5b60f9')

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="absolute z-20 flex flex-col items-start justify-between overflow-hidden rounded-[6px] border-0 px-2 py-1.5 text-left font-bold leading-[1.2] shadow-none"
      style={{ left: dayIndex * dayWidth + 2, top, width: dayWidth - 4, height, background: color }}
    >
      <span className="line-clamp-2 w-full text-[14px] tracking-[0.14px] text-white">{event.title}</span>
      <span className="w-full truncate text-[12px] tracking-[0.12px] text-[#c4d1ff]">{event.teacher_name || event.subtitle}</span>
    </button>
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
          const isSelected = isSameDay(day.date, selectedDate)
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
    <section className="w-[351px] rounded-2xl border-2 border-[#e4e4e7] bg-white px-[18px] pb-6 pt-[18px] shadow-none max-[1180px]:w-full">
      <div className="flex items-start justify-between gap-3">
        <PermanentSidebarPanelTitle title="Event Details" subtitle={event.event_type === 'live_session' ? 'Live preparation' : 'Study block'} />
        <button type="button" onClick={onClose} className="h-8 rounded-md border-0 bg-[#f4f4f5] px-3 text-[12px] font-bold text-[#71717b]">Close</button>
      </div>
      <div className="mt-6 rounded-lg p-3 text-white" style={{ background: event.color || '#5b60f9' }}>
        <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-[#c4d1ff]">
          <Video size={14} />
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
      {event.description && <p className="m-0 mt-5 text-[14px] font-semibold leading-[1.35] tracking-[0.14px] text-[#71717b]">{event.description}</p>}
      <div className="mt-5 grid gap-2">
        {event.preparation_href && (
          <Link href={event.preparation_href} className="figma-button h-11 shadow-none">
            Prepare
            <ExternalLink size={15} />
          </Link>
        )}
        {event.join_url ? (
          <a href={event.join_url} className="figma-button secondary h-11" target="_blank" rel="noreferrer">
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f4f5] px-3 py-2">
      <span className="text-[#9f9fa9]">{label}</span>
      <span className="min-w-0 truncate text-right text-[#3f3f46]">{value}</span>
    </div>
  )
}

function eventsForWeek(events: CalendarEvent[], weekStart: Date) {
  const weekEnd = addDays(weekStart, 7)
  return events.filter((event) => {
    const starts = new Date(event.starts_at)
    return starts >= weekStart && starts < weekEnd
  })
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

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function formatDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const firstDay = first.getDay()
  const mondayOffset = firstDay === 0 ? -6 : 1 - firstDay
  const start = addDays(first, mondayOffset)
  return Array.from({ length: 42 }, (_, index) => ({ date: addDays(start, index) }))
}
