'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, ChevronLeft, ChevronRight, Clock3, Trophy, Zap } from 'lucide-react'
import { getJson } from '@/lib/apiClient'
import {
  buildPermanentSidebarCalendarDays,
  buildStrikeDays,
  getCalendarDayKey,
  getCalendarStart,
  getCalendarWindow,
  getLeaderboardAvatarSrc,
  getQuestProgressPercent,
  getQuestTone,
  normalizeQuests,
  permanentSidebarCalendarDefaults,
  permanentSidebarCountdownDefaults,
  permanentSidebarDefaultSections,
  permanentSidebarLeaderboardDefaults,
  permanentSidebarLiveEventDefaults,
  permanentSidebarQuestDefaults,
  permanentSidebarStrikeDefaults,
  toClientSidebarData,
  wrapIndex,
  type FigmaDailyQuest,
  type PermanentSidebarCalendarDay,
  type PermanentSidebarCountdownUnit,
  type PermanentSidebarData,
  type PermanentSidebarLeaderboardEntry,
  type PermanentSidebarLiveEvent,
  type PermanentSidebarSection,
  type PermanentSidebarStrikeDay,
} from '@/lib/permanentSidebarViewModel'
import { FigmaSidebarSkeleton } from './skeletons'

export type PermanentSidebarProps = {
  data?: PermanentSidebarData
  chronoUnits?: PermanentSidebarCountdownUnit[]
  calendarDays?: PermanentSidebarCalendarDay[]
  liveEvents?: PermanentSidebarLiveEvent[]
  strikeDays?: PermanentSidebarStrikeDay[]
  quests?: FigmaDailyQuest[]
  leaderboardEntries?: PermanentSidebarLeaderboardEntry[]
  autoLoad?: boolean
  dataEndpoint?: string
  calendarWindowSize?: number
  liveHref?: string
  leaderboardHref?: string
  onCalendarDaySelect?: (day: PermanentSidebarCalendarDay) => void
  onCalendarWindowChange?: (days: PermanentSidebarCalendarDay[]) => void
  onStrikeDaySelect?: (day: PermanentSidebarStrikeDay) => void
  onQuestSelect?: (quest: FigmaDailyQuest) => void
  sections?: PermanentSidebarSection[]
  className?: string
}

export function PermanentSidebar({
  data,
  chronoUnits,
  calendarDays,
  liveEvents,
  strikeDays,
  quests,
  leaderboardEntries,
  autoLoad = true,
  dataEndpoint = '/progress/sidebar-summary',
  calendarWindowSize = 5,
  liveHref = '/live',
  leaderboardHref = '/classement',
  onCalendarDaySelect,
  onCalendarWindowChange,
  onStrikeDaySelect,
  onQuestSelect,
  sections = permanentSidebarDefaultSections,
  className = '',
}: PermanentSidebarProps) {
  const [loadedData, setLoadedData] = useState<PermanentSidebarData | null>(null)
  const [loading, setLoading] = useState(autoLoad)

  useEffect(() => {
    if (!autoLoad) {
      setLoading(false)
      return
    }

    let alive = true
    setLoading(true)

    getJson<PermanentSidebarData>(dataEndpoint)
      .then((summaryData) => {
        if (alive) setLoadedData(toClientSidebarData(summaryData))
      })
      .catch(() => {
        return Promise.allSettled([
          getJson<FigmaDailyQuest[]>('/progress/daily-quests'),
          getJson<PermanentSidebarLeaderboardEntry[]>('/progress/leaderboard', { params: { limit: 10 } }),
          getJson<{ streak_days?: number }>('/progress/xp'),
        ]).then(([questResult, leaderboardResult, xpResult]) => {
          if (!alive) return
          setLoadedData({
            calendarDays: buildPermanentSidebarCalendarDays(),
            quests: questResult.status === 'fulfilled' ? questResult.value : [],
            leaderboardEntries: leaderboardResult.status === 'fulfilled' ? leaderboardResult.value : [],
            strikeDays: xpResult.status === 'fulfilled' ? buildStrikeDays(xpResult.value?.streak_days ?? 0) : permanentSidebarStrikeDefaults,
            liveEvents: [],
          })
        })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [autoLoad, dataEndpoint])

  const sidebarData = data ?? loadedData
  const visibleChronoUnits = chronoUnits ?? sidebarData?.chronoUnits ?? permanentSidebarCountdownDefaults
  const visibleCalendarDays = calendarDays ?? sidebarData?.calendarDays ?? permanentSidebarCalendarDefaults
  const visibleLiveEvents = liveEvents ?? sidebarData?.liveEvents ?? permanentSidebarLiveEventDefaults
  const visibleStrikeDays = strikeDays ?? sidebarData?.strikeDays ?? permanentSidebarStrikeDefaults
  const visibleQuests = useMemo(() => normalizeQuests(quests ?? sidebarData?.quests ?? []), [quests, sidebarData?.quests])
  const sourceLeaderboard = leaderboardEntries ?? sidebarData?.leaderboardEntries ?? []
  const visibleLeaderboard = sourceLeaderboard.length > 0 ? sourceLeaderboard.slice(0, 10) : permanentSidebarLeaderboardDefaults
  const visibleSections = new Set(sections)

  if (loading && !data && !chronoUnits && !calendarDays && !liveEvents && !strikeDays && !quests && !leaderboardEntries) {
    return <FigmaSidebarSkeleton sectionTypes={sections} />
  }

  return (
    <aside className={`flex w-[351px] shrink-0 flex-col items-start gap-[14px] pb-[120px] pt-11 max-[1180px]:hidden ${className}`} aria-label="Permanent sidebar">
      {visibleSections.has('chrono') && <ChronoCard units={visibleChronoUnits} />}
      {visibleSections.has('calendar') && (
        <CalendarCard
          days={visibleCalendarDays}
          events={visibleLiveEvents}
          liveHref={liveHref}
          windowSize={calendarWindowSize}
          onDaySelect={onCalendarDaySelect}
          onWindowChange={onCalendarWindowChange}
        />
      )}
      {visibleSections.has('strike') && <WeeklyStrikeCard days={visibleStrikeDays} onDaySelect={onStrikeDaySelect} />}
      {visibleSections.has('quests') && <DailyQuestPanel quests={visibleQuests} onQuestSelect={onQuestSelect} />}
      {visibleSections.has('leaderboard') && <LeaderboardPanel entries={visibleLeaderboard} href={leaderboardHref} />}
    </aside>
  )
}

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
      <PanelTitle title={title} subtitle={subtitle} />
      {children}
    </section>
  )
}

function sidebarCardHeightClass(height: number) {
  if (height === 157) return 'h-[157px]'
  if (height === 305) return 'h-[305px]'
  if (height === 415) return 'h-[415px]'
  if (height === 663) return 'h-[663px]'
  return 'min-h-[157px]'
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <PermanentSidebarPanelTitle title={title} subtitle={subtitle} />
}

export function PermanentSidebarPanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="grid w-full gap-1 leading-[1.1]">
      <strong className="text-[16px] font-bold tracking-[0.24px] text-[#3f3f46]">{title}</strong>
      <span className="text-[14px] font-semibold tracking-[0.21px] text-[#71717b]">{subtitle}</span>
    </div>
  )
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
            <span>{item.value}</span>
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
  const [windowStart, setWindowStart] = useState(getCalendarStart(initialActiveIndex, safeDays.length, windowSize))
  const visibleDays = getCalendarWindow(safeDays, windowStart, windowSize)

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
            <div
              key={visibleDays.map(getCalendarDayKey).join('|')}
              className="absolute inset-0 flex items-center gap-1.5 transition-opacity duration-150"
            >
              {visibleDays.map((day) => {
                const isActive = safeDays[activeIndex] && getCalendarDayKey(safeDays[activeIndex]) === getCalendarDayKey(day)
                return (
                  <button
                    className={`flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg transition-colors duration-200 ${
                      isActive ? 'bg-[#453dee] text-[#edf1ff]' : 'bg-[#f4f4f5] text-[#52525c] hover:bg-[#eceef2]'
                    }`}
                    key={getCalendarDayKey(day)}
                    type="button"
                    onClick={() => selectDay(day)}
                  >
                    <span>{day.value}</span>
                    <span>{day.label}</span>
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
            className="kresco-hover-lift grid min-h-[62px] grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-[#f4f4f5] px-3 text-left no-underline hover:bg-[#eef2ff]"
            href={event.href || liveHref}
            key={event.id}
          >
            <span className="grid min-w-0 gap-1">
              <strong className="truncate text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#3f3f46]">{event.title}</strong>
              <span className="truncate text-[12px] font-semibold leading-[1.1] tracking-[0.18px] text-[#71717b]">{event.subject}</span>
            </span>
            <span className="whitespace-nowrap text-[12px] font-bold leading-none tracking-[0.18px] text-[#453dee]">{event.startsAt || event.starts_at}</span>
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
      className="kresco-hover-lift grid h-8 w-8 shrink-0 place-items-center rounded-[10.5px] border-0 bg-[#f4f4f5] text-[#27272f] shadow-[0_2px_0_rgba(0,0,0,0.2)] active:translate-y-px active:shadow-none"
      type="button"
      aria-label={direction === 'left' ? 'Previous days' : 'Next days'}
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={3} />
    </button>
  )
}

export function WeeklyStrikeCard({
  days = permanentSidebarStrikeDefaults,
  title = 'Weekly Strike',
  subtitle = 'Keep the momentum going!',
  onDaySelect,
}: {
  days?: PermanentSidebarStrikeDay[]
  title?: string
  subtitle?: string
  onDaySelect?: (day: PermanentSidebarStrikeDay) => void
}) {
  return (
    <PermanentSidebarCard title={title} subtitle={subtitle} height={157}>
      <div className="mt-6 flex h-[54px] w-full items-start gap-1.5">
        {days.map((day) => (
          <button
            className={`grid h-[54px] w-[39.857px] shrink-0 justify-items-center gap-2 border-0 bg-transparent p-0 text-center transition-transform duration-150 hover:-translate-y-0.5 ${day.done ? 'text-[#f5900b]' : 'text-[#71717b]'}`}
            key={day.label}
            type="button"
            onClick={() => onDaySelect?.(day)}
          >
            <span className="text-[14px] font-bold leading-[1.1] tracking-[0.21px]">{day.label}</span>
            <span className={`grid h-7 w-7 place-items-center rounded-full ${day.done ? 'bg-[#f5900b]' : 'bg-[#e4e4e7]'} text-white`}>
              {day.done && <Check className="text-white" color="#ffffff" size={18} strokeWidth={3.4} />}
            </span>
          </button>
        ))}
      </div>
    </PermanentSidebarCard>
  )
}

export function DailyQuestPanel({
  quests = permanentSidebarQuestDefaults,
  title = 'Daily Quests',
  subtitle = 'Start learning now!',
  onQuestSelect,
}: {
  quests?: FigmaDailyQuest[]
  title?: string
  subtitle?: string
  onQuestSelect?: (quest: FigmaDailyQuest) => void
}) {
  const visibleQuests = normalizeQuests(quests)

  return (
    <PermanentSidebarCard title={title} subtitle={subtitle} height={305}>
      <div className="mt-8 grid w-full gap-6">
        {visibleQuests.slice(0, 3).map((quest, index) => {
          const tone = getQuestTone(quest.quest_type, index, 'sidebar')
          const Icon = questIcon(quest.quest_type)
          const pct = getQuestProgressPercent(quest)
          return (
            <DailyQuestRow
              Icon={Icon}
              index={index}
              key={quest.id}
              onClick={() => onQuestSelect?.(quest)}
              pct={pct}
              quest={quest}
              tone={tone}
            />
          )
        })}
      </div>
    </PermanentSidebarCard>
  )
}

export function LeaderboardPanel({
  entries = permanentSidebarLeaderboardDefaults,
  title = 'Leaderboard',
  subtitle = 'Compete against your pairs',
  href = '/classement',
}: {
  entries?: PermanentSidebarLeaderboardEntry[]
  title?: string
  subtitle?: string
  href?: string
}) {
  return (
    <PermanentSidebarCard title={title} subtitle={subtitle} height={663}>
      <div className="mt-8 grid w-full gap-4">
        {entries.slice(0, 10).map((entry, index) => (
          <Link className="grid h-10 w-full grid-cols-[27px_40px_1fr] items-start gap-4 rounded-xl no-underline transition duration-150 hover:translate-x-0.5 hover:bg-[#f7f8fb]" href={entry.href || href} key={`${entry.user_id}-${entry.rank}-${index}`}>
            <RankMarker rank={entry.rank || index + 1} />
            <LeaderboardAvatar entry={entry} index={index} />
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-[16px] font-bold leading-[0.95] tracking-[0.24px] text-[#3f3f46]">{entry.full_name}</strong>
              <span className="whitespace-nowrap text-[14px] font-semibold leading-[1.1] tracking-[0.21px] text-[#71717b]">{entry.total_xp.toLocaleString()} point</span>
            </div>
          </Link>
        ))}
      </div>
    </PermanentSidebarCard>
  )
}

export function RankMarker({ rank }: { rank: number }) {
  if (rank <= 3) {
    const styles = {
      1: 'bg-[#ffd61a] text-[#f5900b] shadow-[inset_0_0_0_4px_#ffe855]',
      2: 'bg-[#d7e3ed] text-[#62748e] shadow-[inset_0_0_0_4px_#e7f0f6]',
      3: 'bg-[#e6b16f] text-[#a65f00] shadow-[inset_0_0_0_4px_#f0c48c]',
    } as const
    return (
      <span className={`mt-[6.5px] grid h-[27px] w-[24.254px] place-items-center rounded-md text-[16.2px] font-black leading-[1.1] tracking-[0.243px] ${styles[rank as 1 | 2 | 3]}`}>
        {rank}
      </span>
    )
  }

  return <span className="grid h-[27px] w-[27px] place-items-center text-[16.2px] font-bold leading-[1.1] tracking-[0.243px] text-[#9f9fa9]">{rank}</span>
}

export function LeaderboardAvatar({ entry, index }: { entry: PermanentSidebarLeaderboardEntry; index: number }) {
  const src = getLeaderboardAvatarSrc(entry, index)

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[12.727px] bg-[#e4e4e7]">
      <Image className="h-10 w-10 object-cover" src={src} alt="" width={40} height={40} unoptimized referrerPolicy="no-referrer" />
    </span>
  )
}

function DailyQuestRow({
  Icon,
  index,
  onClick,
  pct,
  quest,
  tone,
}: {
  Icon: typeof Trophy
  index: number
  onClick: () => void
  pct: number
  quest: FigmaDailyQuest
  tone: string
}) {
  return (
    <button
      className={`grid w-full grid-cols-[32px_1fr] gap-4 border-0 bg-transparent p-0 text-left transition-transform duration-150 hover:translate-x-0.5 ${index === 1 ? 'min-h-14' : 'min-h-[41px]'}`}
      type="button"
      onClick={onClick}
    >
      <span className={`grid h-8 w-8 place-items-center rounded-full border-2 border-current ${questToneClass(tone)}`}>
        <Icon size={18} strokeWidth={2.6} />
      </span>
      <div className="min-w-0">
        <strong className={`block text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#3f3f46] ${index === 1 ? 'max-w-[210px]' : ''}`}>
          {quest.title}
        </strong>
        <span className="mt-3 block h-[14px] w-full overflow-hidden rounded-[4px] bg-[#f4f4f5]">
          <i className={`kresco-progress-fill block h-full rounded-[4px] ${questFillClass(tone)} ${progressWidthClass(pct)}`} />
        </span>
      </div>
    </button>
  )
}

function questToneClass(tone: string) {
  if (tone === '#f5900b') return 'text-[#f5900b]'
  if (tone === '#5b60f9') return 'text-[#5b60f9]'
  return 'text-[#2e86ff]'
}

function questFillClass(tone: string) {
  if (tone === '#f5900b') return 'bg-[#f5900b]'
  if (tone === '#5b60f9') return 'bg-[#5b60f9]'
  return 'bg-[#2e86ff]'
}

function progressWidthClass(value: number) {
  const bucket = Math.max(0, Math.min(100, Math.round(value / 5) * 5))
  switch (bucket) {
    case 0: return 'w-0'
    case 5: return 'w-[5%]'
    case 10: return 'w-[10%]'
    case 15: return 'w-[15%]'
    case 20: return 'w-[20%]'
    case 25: return 'w-1/4'
    case 30: return 'w-[30%]'
    case 35: return 'w-[35%]'
    case 40: return 'w-[40%]'
    case 45: return 'w-[45%]'
    case 50: return 'w-1/2'
    case 55: return 'w-[55%]'
    case 60: return 'w-[60%]'
    case 65: return 'w-[65%]'
    case 70: return 'w-[70%]'
    case 75: return 'w-3/4'
    case 80: return 'w-4/5'
    case 85: return 'w-[85%]'
    case 90: return 'w-[90%]'
    case 95: return 'w-[95%]'
    default: return 'w-full'
  }
}

function questIcon(type?: string) {
  if (type?.includes('quiz') || type?.includes('exercise')) return Trophy
  if (type?.includes('time') || type?.includes('study')) return Clock3
  return Zap
}
