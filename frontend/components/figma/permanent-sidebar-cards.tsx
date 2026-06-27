'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getCalendarDayKey,
  getCalendarStart,
  getCalendarWindow,
  permanentSidebarCalendarDefaults,
  permanentSidebarCountdownDefaults,
  permanentSidebarLiveEventDefaults,
  wrapIndex,
  type PermanentSidebarCalendarDay,
  type PermanentSidebarCountdownUnit,
  type PermanentSidebarLiveEvent,
} from '@/lib/permanentSidebarViewModel'
import { PermanentSidebarPanelTitle } from './permanent-sidebar-title'

export function PermanentSidebarCard({
  title,
  subtitle,
  height,
  children,
}: {
  title: string
  subtitle: string
  height: number
  children: ReactNode
}) {
  return (
    <section className={`kresco-enter w-[351px] rounded-2xl border-2 border-[#e4e4e7] bg-white px-[18px] pb-6 pt-[18px] shadow-none ${sidebarCardHeightClass(height)}`}>
      <PermanentSidebarPanelTitle title={title} subtitle={subtitle} />
      {children}
    </section>
  )
}

export function sidebarCardHeightClass(height: number) {
  if (height === 157) return 'h-[157px]'
  if (height === 305) return 'h-[305px]'
  if (height === 330) return 'h-[330px]'
  if (height === 360) return 'h-[360px]'
  if (height === 390) return 'h-[390px]'
  if (height === 415) return 'h-[415px]'
  if (height === 430) return 'h-[430px]'
  if (height === 455) return 'min-h-[455px]'
  if (height === 663) return 'h-[663px]'
  return 'min-h-[157px]'
}

export function ChronoCard({
  units = permanentSidebarCountdownDefaults,
  title = 'Chrono',
  subtitle = 'Counting the days for the future!',
}: {
  units?: PermanentSidebarCountdownUnit[]
  title?: string
  subtitle?: string
}) {
  return (
    <PermanentSidebarCard title={title} subtitle={subtitle} height={157}>
      <div className="mt-6 flex h-[54px] w-full items-center justify-center gap-1.5 text-center text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#52525c]">
        {units.map((item) => (
          <div className="kresco-hover-lift flex h-[54px] w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg bg-[#f4f4f5] px-2 hover:bg-[#eceef2]" key={item.label}>
            <span className="tabular-nums">{item.value}</span>
            <span className="whitespace-nowrap">{item.label}</span>
          </div>
        ))}
      </div>
    </PermanentSidebarCard>
  )
}

export function CalendarCard({
  days = permanentSidebarCalendarDefaults,
  events = permanentSidebarLiveEventDefaults,
  windowSize = 5,
  liveHref = '/live',
  title = 'Calendar',
  subtitle = 'Stay up to date with everything!',
  onDaySelect,
  onWindowChange,
}: {
  days?: PermanentSidebarCalendarDay[]
  events?: PermanentSidebarLiveEvent[]
  windowSize?: number
  liveHref?: string
  title?: string
  subtitle?: string
  onDaySelect?: (day: PermanentSidebarCalendarDay) => void
  onWindowChange?: (days: PermanentSidebarCalendarDay[]) => void
}) {
  const safeDays = days.length > 0 ? days : permanentSidebarCalendarDefaults
  const initialActiveIndex = Math.max(0, safeDays.findIndex((day) => day.active))
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex)
  const [windowStart, setWindowStart] = useState(() => getCalendarStart(initialActiveIndex, safeDays.length, windowSize))
  const visibleDays = useMemo(() => getCalendarWindow(safeDays, windowStart, windowSize), [safeDays, windowSize, windowStart])
  const visibleDayKey = useMemo(() => visibleDays.map(getCalendarDayKey).join('|'), [visibleDays])
  const activeDayKey = safeDays[activeIndex] ? getCalendarDayKey(safeDays[activeIndex]) : ''

  useEffect(() => {
    const nextActiveIndex = Math.max(0, safeDays.findIndex((day) => day.active))
    const nextStart = getCalendarStart(nextActiveIndex, safeDays.length, windowSize)
    setActiveIndex(nextActiveIndex)
    setWindowStart(nextStart)
    onWindowChange?.(getCalendarWindow(safeDays, nextStart, windowSize))
  }, [days, onWindowChange, safeDays, windowSize])

  function moveWindow(direction: -1 | 1) {
    setWindowStart((current) => {
      const next = wrapIndex(current + direction, safeDays.length)
      onWindowChange?.(getCalendarWindow(safeDays, next, windowSize))
      return next
    })
  }

  function selectDay(day: PermanentSidebarCalendarDay) {
    const nextIndex = safeDays.findIndex((item) => getCalendarDayKey(item) === getCalendarDayKey(day))
    if (nextIndex >= 0) setActiveIndex(nextIndex)
    onDaySelect?.(day)
  }

  return (
    <PermanentSidebarCard title={title} subtitle={subtitle} height={415}>
      <div className="mt-6 flex w-full items-center gap-2">
        <CalendarArrow direction="left" onClick={() => moveWindow(-1)} />
        <div className="relative h-12 min-w-0 flex-1 overflow-hidden text-center text-[14px] font-bold leading-[1.1] tracking-[0.21px]">
          <div key={visibleDayKey} className="absolute inset-0 flex items-center gap-1.5">
            {visibleDays.map((day) => {
              const dayKey = getCalendarDayKey(day)
              const isActive = activeDayKey === dayKey
              return (
                <button
                  className={`relative flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg bg-[#f4f4f5] transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                    isActive ? 'text-[#edf1ff] shadow-[0_8px_16px_rgba(91,96,249,0.16)]' : 'text-[#52525c] hover:-translate-y-px hover:bg-[#eceef2] hover:shadow-[var(--shadow-border)] motion-reduce:hover:translate-y-0'
                  }`}
                  key={dayKey}
                  type="button"
                  aria-label={`${day.label} ${day.value}${isActive ? ', selected' : ''}`}
                  onClick={() => selectDay(day)}
                >
                  {isActive && (
                    <span className="absolute inset-[3px] rounded-[7px] bg-[#5b60f9] shadow-[0_6px_14px_rgba(91,96,249,0.2)]" />
                  )}
                  <span className="relative z-10 tabular-nums">{day.value}</span>
                  <span className="relative z-10">{day.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        <CalendarArrow direction="right" onClick={() => moveWindow(1)} />
      </div>
      <div className="mt-8 grid gap-2">
        {events.length > 0 ? events.slice(0, 2).map((event) => (
          <Link
            className="kresco-hover-lift grid min-h-[62px] grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-[#f4f4f5] px-3 text-left no-underline hover:bg-[#eef2ff] hover:shadow-[var(--shadow-border)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:active:scale-100"
            href={event.href || liveHref}
            key={event.id}
          >
            <span className="grid min-w-0 gap-1">
              <strong className="truncate text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#3f3f46]">{event.title}</strong>
              <span className="truncate text-[12px] font-semibold leading-[1.1] tracking-[0.18px] text-[#71717b]">{event.subject}</span>
            </span>
            <span className="min-w-0 break-words text-right text-[12px] font-bold leading-none tracking-[0.18px] text-[#453dee]">{event.startsAt || event.starts_at}</span>
          </Link>
        )) : (
          <div className="grid min-h-[132px] place-items-center rounded-lg bg-[#f4f4f5] px-4 text-center text-[13px] font-bold leading-[1.2] tracking-[0.18px] text-[#71717b]">
            No upcoming live sessions
          </div>
        )}
      </div>
    </PermanentSidebarCard>
  )
}

export function CalendarArrow({ direction, onClick }: { direction: 'left' | 'right'; onClick?: () => void }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      className="kresco-hover-lift grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border-0 bg-[#f4f4f5] text-[#27272f] shadow-[0_2px_0_rgba(0,0,0,0.2)] transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-[#eef2ff] hover:text-[#453dee] active:translate-y-px active:scale-[0.96] active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100"
      type="button"
      aria-label={direction === 'left' ? 'Previous days' : 'Next days'}
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={3} />
    </button>
  )
}
