export type CalendarEventLike = {
  id: number
  starts_at: string
  ends_at?: string
}

export type CalendarSearchParams = {
  get(name: string): string | null
}

export function parseCalendarEventId(params: CalendarSearchParams) {
  const raw = params.get('event')
  if (!raw || !/^\d+$/.test(raw.trim())) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function findCalendarEventById<T extends CalendarEventLike>(events: T[], eventId: number | null) {
  if (!eventId) return null
  return events.find((event) => event.id === eventId) ?? null
}

export function dateForCalendarEvent(event: CalendarEventLike) {
  const date = new Date(event.starts_at)
  if (Number.isNaN(date.getTime())) return null
  return startOfDay(date)
}

export function eventsForWeek<T extends CalendarEventLike>(events: T[], weekStart: Date) {
  const weekStartTime = weekStart.getTime()
  const weekEndTime = addDays(weekStart, 7).getTime()
  return events.filter((event) => {
    const startsTime = Date.parse(event.starts_at)
    return Number.isFinite(startsTime) && startsTime >= weekStartTime && startsTime < weekEndTime
  })
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function startOfWeek(date: Date) {
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  return startOfDay(addDays(date, mondayOffset))
}

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

export function formatCalendarDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function buildMonthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const firstDay = first.getDay()
  const mondayOffset = firstDay === 0 ? -6 : 1 - firstDay
  const start = addDays(first, mondayOffset)
  return Array.from({ length: 42 }, (_, index) => ({ date: addDays(start, index) }))
}
