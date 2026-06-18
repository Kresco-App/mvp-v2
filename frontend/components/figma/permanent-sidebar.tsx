'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Clock3, Trophy, Zap } from 'lucide-react'
import { getJson, postJson } from '@/lib/apiClient'
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
import { SkeletonBlock } from './skeletons'

const sidebarCalendarSlideTransition = { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] } as const
const sidebarCalendarDayTransition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.72 } as const
const sidebarSectionTransition = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const
const sidebarSummaryCache = new Map<string, PermanentSidebarData>()
const sidebarSummaryRequests = new Map<string, Promise<PermanentSidebarData>>()

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
  const [loadedData, setLoadedData] = useState<PermanentSidebarData | null>(() => (
    autoLoad ? sidebarSummaryCache.get(dataEndpoint) ?? null : null
  ))
  const [loading, setLoading] = useState(autoLoad && !sidebarSummaryCache.has(dataEndpoint))

  useEffect(() => {
    if (!autoLoad) {
      setLoading(false)
      return
    }

    let alive = true
    const cachedData = sidebarSummaryCache.get(dataEndpoint) ?? null
    if (cachedData) setLoadedData(cachedData)
    setLoading(!cachedData)

    loadPermanentSidebarData(dataEndpoint)
      .then((summaryData) => {
        if (alive) setLoadedData(summaryData)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [autoLoad, dataEndpoint])

  const [claimingQuestId, setClaimingQuestId] = useState<FigmaDailyQuest['id'] | null>(null)

  // Default quest action: claim the XP reward for a completed-but-unclaimed quest.
  // (Backend DailyQuest.completed means "reward claimed"; claimable = progress
  // reached target and not yet claimed.) Wired here so the claim endpoint is not
  // orphaned when the host layout does not provide its own onQuestSelect.
  const handleQuestClaim = useCallback(
    async (quest: FigmaDailyQuest) => {
      if (
        typeof quest.id !== 'number' ||
        quest.completed === true ||
        quest.progress < quest.target ||
        claimingQuestId === quest.id
      ) {
        return
      }
      setClaimingQuestId(quest.id)
      try {
        const result = await postJson<{ xp_awarded?: number }>(`/progress/daily-quests/${quest.id}/claim`)
        const refreshed = await getJson<FigmaDailyQuest[]>('/progress/daily-quests')
        setLoadedData((prev) => {
          const next = { ...(prev ?? sidebarSummaryCache.get(dataEndpoint) ?? {}), quests: refreshed }
          sidebarSummaryCache.set(dataEndpoint, next)
          return next
        })
        toast.success(
          result?.xp_awarded ? `Récompense réclamée : +${result.xp_awarded} XP` : 'Récompense réclamée !',
        )
      } catch {
        toast.error('Impossible de réclamer cette récompense pour le moment.')
      } finally {
        setClaimingQuestId(null)
      }
    },
    [claimingQuestId, dataEndpoint],
  )

  const sidebarData = data ?? loadedData
  const visibleChronoUnits = chronoUnits ?? sidebarData?.chronoUnits ?? permanentSidebarCountdownDefaults
  const visibleCalendarDays = calendarDays ?? sidebarData?.calendarDays ?? permanentSidebarCalendarDefaults
  const visibleLiveEvents = liveEvents ?? sidebarData?.liveEvents ?? permanentSidebarLiveEventDefaults
  const visibleStrikeDays = strikeDays ?? sidebarData?.strikeDays ?? permanentSidebarStrikeDefaults
  const visibleQuests = useMemo(() => normalizeQuests(quests ?? sidebarData?.quests ?? []), [quests, sidebarData?.quests])
  const sourceLeaderboard = leaderboardEntries ?? sidebarData?.leaderboardEntries ?? []
  const visibleLeaderboard = sourceLeaderboard.length > 0 ? sourceLeaderboard.slice(0, 10) : permanentSidebarLeaderboardDefaults
  const hasDirectSectionData = {
    chrono: Boolean(chronoUnits),
    calendar: Boolean(calendarDays || liveEvents),
    strike: Boolean(strikeDays),
    quests: Boolean(quests),
    leaderboard: Boolean(leaderboardEntries),
  } satisfies Record<PermanentSidebarSection, boolean>
  const shouldSkeletonSection = (section: PermanentSidebarSection) => (
    loading && !sidebarData && !hasDirectSectionData[section] && (section === 'quests' || section === 'leaderboard')
  )

  return (
    <aside className={`flex w-[351px] shrink-0 flex-col items-start gap-[14px] pb-[120px] pt-11 max-[1180px]:hidden ${className}`} aria-label="Permanent sidebar" aria-busy={loading}>
      {sections.map((section, index) => (
        <SidebarSectionSlot key={section} index={index} loading={shouldSkeletonSection(section)} section={section}>
          {section === 'chrono' && <ChronoCard units={visibleChronoUnits} />}
          {section === 'calendar' && (
            <CalendarCard
              days={visibleCalendarDays}
              events={visibleLiveEvents}
              liveHref={liveHref}
              windowSize={calendarWindowSize}
              onDaySelect={onCalendarDaySelect}
              onWindowChange={onCalendarWindowChange}
            />
          )}
          {section === 'strike' && <WeeklyStrikeCard days={visibleStrikeDays} onDaySelect={onStrikeDaySelect} />}
          {section === 'quests' && <DailyQuestPanel quests={visibleQuests} onQuestSelect={onQuestSelect ?? handleQuestClaim} />}
          {section === 'leaderboard' && <LeaderboardPanel entries={visibleLeaderboard} href={leaderboardHref} />}
        </SidebarSectionSlot>
      ))}
    </aside>
  )
}

function loadPermanentSidebarData(dataEndpoint: string) {
  const existing = sidebarSummaryRequests.get(dataEndpoint)
  if (existing) return existing

  const request = fetchPermanentSidebarData(dataEndpoint)
    .then((summaryData) => {
      sidebarSummaryCache.set(dataEndpoint, summaryData)
      return summaryData
    })
    .finally(() => {
      sidebarSummaryRequests.delete(dataEndpoint)
    })

  sidebarSummaryRequests.set(dataEndpoint, request)
  return request
}

async function fetchPermanentSidebarData(dataEndpoint: string): Promise<PermanentSidebarData> {
  try {
    return toClientSidebarData(await getJson<PermanentSidebarData>(dataEndpoint))
  } catch {
    const [questResult, leaderboardResult, xpResult] = await Promise.allSettled([
      getJson<FigmaDailyQuest[]>('/progress/daily-quests'),
      getJson<PermanentSidebarLeaderboardEntry[]>('/progress/leaderboard', { params: { limit: 10 } }),
      getJson<{ streak_days?: number }>('/progress/xp'),
    ])

    return {
      calendarDays: buildPermanentSidebarCalendarDays(),
      quests: questResult.status === 'fulfilled' ? questResult.value : [],
      leaderboardEntries: leaderboardResult.status === 'fulfilled' ? leaderboardResult.value : [],
      strikeDays: xpResult.status === 'fulfilled' ? buildStrikeDays(xpResult.value?.streak_days ?? 0) : permanentSidebarStrikeDefaults,
      liveEvents: [],
    }
  }
}

function SidebarSectionSlot({
  children,
  index,
  loading,
  section,
}: {
  children: ReactNode
  index: number
  loading: boolean
  section: PermanentSidebarSection
}) {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={`${section}-${loading ? 'loading' : 'ready'}`}
        layout
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ ...sidebarSectionTransition, delay: loading ? 0 : Math.min(index * 0.035, 0.14) }}
      >
        {loading ? <PermanentSidebarSectionSkeleton section={section} /> : children}
      </motion.div>
    </AnimatePresence>
  )
}

function PermanentSidebarSectionSkeleton({ section }: { section: PermanentSidebarSection }) {
  return (
    <section
      className={`kresco-skeleton-card w-[351px] rounded-2xl border-2 bg-white px-[18px] pb-6 pt-[18px] ${sidebarCardHeightClass(sidebarSkeletonHeight(section))}`}
      aria-label={`Loading ${section}`}
    >
      <SkeletonBlock className="h-[16px] w-28 rounded-[6px]" />
      <SkeletonBlock className="mt-2 h-[13px] w-44 rounded-[6px]" />
      <div className="mt-7 grid gap-3">
        {section === 'leaderboard' ? (
          <SidebarRowsSkeleton rows={8} avatar="square" />
        ) : section === 'quests' ? (
          <SidebarRowsSkeleton rows={3} avatar="round" />
        ) : section === 'calendar' ? (
          <CalendarSidebarSkeletonBody />
        ) : section === 'strike' ? (
          <StrikeSidebarSkeletonBody />
        ) : (
          <ChronoSidebarSkeletonBody />
        )}
      </div>
    </section>
  )
}

function sidebarSkeletonHeight(section: PermanentSidebarSection) {
  if (section === 'calendar') return 415
  if (section === 'quests') return 305
  if (section === 'leaderboard') return 663
  return 157
}

function SidebarRowsSkeleton({ rows, avatar }: { rows: number; avatar: 'round' | 'square' }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="grid grid-cols-[32px_1fr] gap-4" key={rowIndex}>
          <SkeletonBlock className={`h-8 w-8 ${avatar === 'round' ? 'rounded-full' : 'rounded-[10px]'}`} />
          <div>
            <SkeletonBlock className="h-[13px] w-[78%] rounded-[6px]" />
            <SkeletonBlock className="mt-3 h-[12px] w-full rounded-[4px]" />
          </div>
        </div>
      ))}
    </>
  )
}

function ChronoSidebarSkeletonBody() {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: 5 }).map((_, itemIndex) => (
        <SkeletonBlock className="h-[54px] rounded-lg" key={itemIndex} />
      ))}
    </div>
  )
}

function StrikeSidebarSkeletonBody() {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }).map((_, itemIndex) => (
        <div className="grid justify-items-center gap-2" key={itemIndex}>
          <SkeletonBlock className="h-[13px] w-7 rounded-[6px]" />
          <SkeletonBlock className="h-7 w-7 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function CalendarSidebarSkeletonBody() {
  return (
    <div>
      <div className="flex h-12 items-center gap-2">
        <SkeletonBlock className="h-8 w-8 shrink-0 rounded-[10.5px]" />
        <div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5">
          {Array.from({ length: 5 }).map((_, itemIndex) => (
            <SkeletonBlock className="h-12 rounded-lg" key={itemIndex} />
          ))}
        </div>
        <SkeletonBlock className="h-8 w-8 shrink-0 rounded-[10.5px]" />
      </div>
      <div className="mt-8 grid gap-2">
        {Array.from({ length: 2 }).map((_, eventIndex) => (
          <div className="grid min-h-[62px] grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-[#f7f8fb] px-3" key={eventIndex}>
            <span className="grid min-w-0 gap-2">
              <SkeletonBlock className="h-[14px] w-[72%] rounded-[6px]" />
              <SkeletonBlock className="h-[12px] w-[44%] rounded-[6px]" />
            </span>
            <SkeletonBlock className="h-[12px] w-16 rounded-[6px]" />
          </div>
        ))}
      </div>
    </div>
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
  const calendarLayoutId = useId()
  const reduceMotion = useReducedMotion()
  const safeDays = days.length > 0 ? days : permanentSidebarCalendarDefaults
  const initialActiveIndex = Math.max(0, safeDays.findIndex((day) => day.active))
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex)
  const [windowStart, setWindowStart] = useState(getCalendarStart(initialActiveIndex, safeDays.length, windowSize))
  const [windowDirection, setWindowDirection] = useState<-1 | 0 | 1>(0)
  const visibleDays = getCalendarWindow(safeDays, windowStart, windowSize)
  const visibleDayKey = visibleDays.map(getCalendarDayKey).join('|')

  useEffect(() => {
    const nextActiveIndex = Math.max(0, safeDays.findIndex((day) => day.active))
    const nextStart = getCalendarStart(nextActiveIndex, safeDays.length, windowSize)
    setActiveIndex(nextActiveIndex)
    setWindowStart(nextStart)
    setWindowDirection(0)
    onWindowChange?.(getCalendarWindow(safeDays, nextStart, windowSize))
  }, [days, onWindowChange, safeDays, windowSize])

  function moveWindow(direction: -1 | 1) {
    setWindowDirection(direction)
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
          <LayoutGroup id={calendarLayoutId}>
            <AnimatePresence initial={false} custom={windowDirection}>
              <motion.div
                key={visibleDayKey}
                custom={windowDirection}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: windowDirection === 0 ? 0 : windowDirection * 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: windowDirection === 0 ? 0 : windowDirection * -18 }}
                transition={sidebarCalendarSlideTransition}
                className="absolute inset-0 flex items-center gap-1.5"
              >
                {visibleDays.map((day) => {
                  const isActive = safeDays[activeIndex] && getCalendarDayKey(safeDays[activeIndex]) === getCalendarDayKey(day)
                  return (
                    <motion.button
                      className={`relative flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg bg-[#f4f4f5] transition-colors duration-200 ${
                        isActive ? 'text-[#edf1ff]' : 'text-[#52525c] hover:bg-[#eceef2]'
                      }`}
                      key={getCalendarDayKey(day)}
                      type="button"
                      onClick={() => selectDay(day)}
                      whileHover={reduceMotion ? undefined : { y: -1 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId={`sidebar-calendar-active-day-${visibleDayKey}`}
                          className="absolute inset-[3px] rounded-[7px] bg-[#5b60f9] shadow-[0_6px_14px_rgba(91,96,249,0.2)]"
                          transition={sidebarCalendarDayTransition}
                        />
                      )}
                      <span className="relative z-10">{day.value}</span>
                      <span className="relative z-10">{day.label}</span>
                    </motion.button>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          </LayoutGroup>
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
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      className="kresco-hover-lift grid h-8 w-8 shrink-0 place-items-center rounded-[10.5px] border-0 bg-[#f4f4f5] text-[#27272f] shadow-[0_2px_0_rgba(0,0,0,0.2)] active:translate-y-px active:shadow-none"
      type="button"
      aria-label={direction === 'left' ? 'Previous days' : 'Next days'}
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { y: -1 }}
      whileTap={reduceMotion ? undefined : { scale: 0.94, y: 1 }}
    >
      <Icon size={15} strokeWidth={3} />
    </motion.button>
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
