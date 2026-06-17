import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildMonthGrid,
  dateForCalendarEvent,
  eventsForWeek,
  findCalendarEventById,
  formatCalendarDate,
  parseCalendarEventId,
  startOfWeek,
} from '@/lib/calendarViewModel'

describe('calendar view model helpers', () => {
  it('parses event deep-link ids defensively', () => {
    expect(parseCalendarEventId(new URLSearchParams('event=42'))).toBe(42)
    expect(parseCalendarEventId(new URLSearchParams('event=0'))).toBeNull()
    expect(parseCalendarEventId(new URLSearchParams('event=-1'))).toBeNull()
    expect(parseCalendarEventId(new URLSearchParams('event=abc'))).toBeNull()
  })

  it('finds events and derives the week for cross-week deep links', () => {
    const event = { id: 7, starts_at: '2026-05-28T10:00:00Z', ends_at: '2026-05-28T11:00:00Z' }
    const weekStart = startOfWeek(dateForCalendarEvent(event)!)

    expect(formatCalendarDate(weekStart)).toBe('2026-05-25')
    expect(findCalendarEventById([event], 7)).toBe(event)
    expect(eventsForWeek([event], weekStart)).toEqual([event])
    expect(eventsForWeek([event], new Date(2026, 5, 1))).toEqual([])
  })

  it('keeps month grids monday-aligned and fixed size', () => {
    const days = buildMonthGrid(new Date(2026, 4, 1))

    expect(days).toHaveLength(42)
    expect(formatCalendarDate(days[0].date)).toBe('2026-04-27')
    expect(formatCalendarDate(days[41].date)).toBe('2026-06-07')
  })

  it('keeps realtime subscriptions stable across week navigation', () => {
    const source = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'calendar', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n')
    const hookSource = readFileSync(join(process.cwd(), 'hooks', 'useNotificationChannelsSubscription.ts'), 'utf8')

    expect(source).toContain('const loadEventsForWeekRef = useRef(loadEventsForWeek)')
    expect(source).toContain('useEffect(() => {\n    loadEventsForWeekRef.current = loadEventsForWeek\n  }, [loadEventsForWeek])')
    expect(source).toContain('useNotificationChannelsSubscription({')
    expect(source).toContain('void loadEventsForWeekRef.current(isActive)')
    expect(source).not.toContain('listKrescoRealtimeSubscriptions')
    expect(hookSource).toContain('listKrescoRealtimeSubscriptions()')
    expect(hookSource).toContain('channelNames: [fallbackUserChannel]')
    expect(source).not.toContain('}, [loadEventsForWeek, user?.id])')
  })

  it('keeps calendar fallback UI generic and explicit', () => {
    const source = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'calendar', 'page.tsx'), 'utf8')

    expect(source).not.toContain("|| 'Khalid'")
    expect(source).not.toContain("Hello {firstName}")
    expect(source).toContain('No scheduled sessions this week')
  })
})
