'use client'

import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { Check, Clock3, Trophy, Zap } from 'lucide-react'
import { getJson, postJson } from '@/lib/apiClient'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import {
  buildPermanentSidebarCalendarDays,
  buildStrikeDays,
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
  type FigmaDailyQuest,
  type PermanentSidebarCalendarDay,
  type PermanentSidebarCountdownUnit,
  type PermanentSidebarData,
  type PermanentSidebarLeaderboardEntry,
  type PermanentSidebarLiveEvent,
  type PermanentSidebarSection,
  type PermanentSidebarStrikeDay,
} from '@/lib/permanentSidebarViewModel'
import { CalendarCard, ChronoCard, PermanentSidebarCard, sidebarCardHeightClass } from './permanent-sidebar-cards'
import { SkeletonBlock } from './skeletons'

export { CalendarArrow, CalendarCard, ChronoCard, PermanentSidebarCard } from './permanent-sidebar-cards'
export { PermanentSidebarPanelTitle } from './permanent-sidebar-title'

const SIDEBAR_SUMMARY_DEDUPING_INTERVAL_MS = 60_000
const sidebarNumberFormatter = new Intl.NumberFormat()
const sidebarTapMotion = 'transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'
const sidebarRowMotion = 'transition-[background-color,box-shadow,color,transform] duration-150 ease-out motion-reduce:transition-none'

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
  const sidebarQuery = useSWR<PermanentSidebarData>(
    autoLoad ? dataEndpoint : null,
    fetchPermanentSidebarData,
    {
      dedupingInterval: SIDEBAR_SUMMARY_DEDUPING_INTERVAL_MS,
      keepPreviousData: true,
      revalidateIfStale: true,
      revalidateOnFocus: false,
    },
  )
  const loadedData = sidebarQuery.data ?? null
  const loading = autoLoad && sidebarQuery.isLoading && !loadedData
  const mutateSidebarData = sidebarQuery.mutate

  const [claimingQuestId, setClaimingQuestId] = useState<FigmaDailyQuest['id'] | null>(null)
  const sidebarData = data ?? loadedData

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
        void mutateSidebarData((current) => ({ ...(current ?? sidebarData ?? {}), quests: refreshed }), {
          revalidate: false,
        })
        showToastSuccess(
          result?.xp_awarded ? `Récompense réclamée : +${result.xp_awarded} XP` : 'Récompense réclamée !',
        )
      } catch {
        showToastError('Impossible de réclamer cette récompense pour le moment.')
      } finally {
        setClaimingQuestId(null)
      }
    },
    [claimingQuestId, mutateSidebarData, sidebarData],
  )

  const visibleChronoUnits = chronoUnits ?? sidebarData?.chronoUnits ?? permanentSidebarCountdownDefaults
  const visibleCalendarDays = calendarDays ?? sidebarData?.calendarDays ?? permanentSidebarCalendarDefaults
  const visibleLiveEvents = liveEvents ?? sidebarData?.liveEvents ?? permanentSidebarLiveEventDefaults
  const visibleStrikeDays = strikeDays ?? sidebarData?.strikeDays ?? permanentSidebarStrikeDefaults
  const visibleQuests = quests ?? sidebarData?.quests ?? []
  const sourceLeaderboard = leaderboardEntries ?? sidebarData?.leaderboardEntries ?? []
  const visibleLeaderboard = sourceLeaderboard.length > 0 ? sourceLeaderboard : permanentSidebarLeaderboardDefaults
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
      {sections.map((section) => (
        <SidebarSectionSlot key={section} loading={shouldSkeletonSection(section)} section={section}>
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

async function fetchPermanentSidebarData(dataEndpoint: string): Promise<PermanentSidebarData> {
  try {
    return toClientSidebarData(await getJson<PermanentSidebarData>(dataEndpoint))
  } catch {
    const [questResult, leaderboardResult, xpResult] = await Promise.allSettled([
      getJson<FigmaDailyQuest[]>('/progress/daily-quests'),
      getJson<PermanentSidebarLeaderboardEntry[]>('/progress/leaderboard', { params: { limit: 10, include_current: true } }),
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
  loading,
  section,
}: {
  children: ReactNode
  loading: boolean
  section: PermanentSidebarSection
}) {
  return (
    <div style={sidebarSectionContainmentStyle(section)}>
      {loading ? <PermanentSidebarSectionSkeleton section={section} /> : children}
    </div>
  )
}

function sidebarSectionContainmentStyle(section: PermanentSidebarSection): CSSProperties {
  return {
    contentVisibility: 'auto',
    containIntrinsicSize: `auto ${sidebarSkeletonHeight(section)}px`,
  }
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
  if (section === 'leaderboard') return 455
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
            aria-label={`${day.label}${day.done ? ' completed' : ' not completed'}`}
            className={`group grid h-[54px] w-10 shrink-0 justify-items-center gap-2 rounded-xl border-0 bg-transparent p-0 text-center ${sidebarTapMotion} hover:bg-[#f7f8fb] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 ${day.done ? 'text-[#f5900b]' : 'text-[#71717b]'}`}
            key={day.label}
            type="button"
            onClick={() => onDaySelect?.(day)}
          >
            <span className="text-[14px] font-bold leading-[1.1] tracking-[0.21px]">{day.label}</span>
            <span className={`grid h-7 w-7 place-items-center rounded-full ${day.done ? 'bg-[#f5900b] shadow-[0_6px_12px_rgba(245,144,11,0.24)]' : 'bg-[#e4e4e7]'} text-white transition-[background-color,box-shadow,transform] duration-150 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100`}>
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
        {visibleQuests.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center rounded-lg bg-[#f4f4f5] px-4 text-center text-[13px] font-bold leading-[1.25] tracking-[0.18px] text-[#71717b]">
            No quests available
          </div>
        ) : visibleQuests.slice(0, 3).map((quest, index) => {
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
  subtitle = 'Top global preview',
  href = '/classement',
}: {
  entries?: PermanentSidebarLeaderboardEntry[]
  title?: string
  subtitle?: string
  href?: string
}) {
  const globalEntries = useMemo(() => sortLeaderboardEntries(entries), [entries])
  const { visibleEntries, pinnedCurrent } = useMemo(() => deriveLeaderboardRows(globalEntries), [globalEntries])

  return (
    <PermanentSidebarCard title={title} subtitle={subtitle} height={pinnedCurrent ? 390 : 330}>
      <div className="mt-5 grid w-full gap-2.5">
        <div className="grid w-full gap-2.5">
          {visibleEntries.map((entry, index) => (
            <LeaderboardPanelRow
              entry={entry}
              href={href}
              index={index}
              key={`${entry.user_id}-${entry.rank}-${index}`}
            />
          ))}
        </div>

        {pinnedCurrent && (
          <div className="border-t border-[#e4e4e7] pt-2">
            <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.15px] text-[#71717b]">
              <span>Your global rank</span>
              <span>Global</span>
            </div>
            <LeaderboardPanelRow entry={pinnedCurrent} href={href} index={5} pinned />
          </div>
        )}
      </div>
    </PermanentSidebarCard>
  )
}

function LeaderboardPanelRow({
  entry,
  href,
  index,
  pinned = false,
}: {
  entry: PermanentSidebarLeaderboardEntry
  href: string
  index: number
  pinned?: boolean
}) {
  const zoneClass = entry.is_current_user ? 'bg-[#edf1ff] text-[#453dee]' : 'bg-white text-[#3f3f46]'
  const currentClass = entry.is_current_user ? 'shadow-[inset_3px_0_0_#453dee] ring-1 ring-[#dfe5ff]' : ''

  return (
    <Link
      className={`grid h-[38px] w-full grid-cols-[25px_34px_minmax(0,1fr)] items-center gap-3 rounded-xl px-1.5 py-0 no-underline ${sidebarRowMotion} hover:translate-x-0.5 hover:bg-[#f7f8fb] hover:shadow-[var(--shadow-border)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:hover:translate-x-0 ${zoneClass} ${currentClass || (pinned ? 'shadow-[inset_3px_0_0_#453dee]' : '')}`}
      href={entry.href || href}
    >
      <RankMarker rank={entry.rank || index + 1} />
      <LeaderboardAvatar entry={entry} index={index} small />
      <div className="grid min-w-0 gap-0.5">
        <strong className="truncate text-[14px] font-bold leading-[0.95] tracking-[0.18px]">{entry.full_name}{entry.is_current_user ? ' (you)' : ''}</strong>
        <span className="whitespace-nowrap text-[12px] font-semibold leading-[1.05] tracking-[0.16px] text-[#71717b] tabular-nums">{sidebarNumberFormatter.format(entry.total_xp)} point</span>
      </div>
    </Link>
  )
}

function deriveLeaderboardRows(entries: PermanentSidebarLeaderboardEntry[]) {
  const visibleEntries: PermanentSidebarLeaderboardEntry[] = []
  let currentEntry: PermanentSidebarLeaderboardEntry | null = null

  for (const entry of entries) {
    if (entry.rank <= 5 && visibleEntries.length < 5) {
      visibleEntries.push(entry)
    }
    if (entry.is_current_user) {
      currentEntry = entry
    }
  }

  const pinnedCurrent = currentEntry && !visibleEntries.some((entry) => entry.user_id === currentEntry.user_id)
    ? currentEntry
    : null

  return { visibleEntries, pinnedCurrent }
}

function sortLeaderboardEntries(entries: PermanentSidebarLeaderboardEntry[]) {
  if (entries.length <= 1) return entries
  return [...entries].sort((a, b) => (a.rank || 0) - (b.rank || 0) || a.user_id - b.user_id)
}

export function RankMarker({ rank }: { rank: number }) {
  if (rank <= 3) {
    const styles = {
      1: 'bg-[#ffd61a] text-[#f5900b] shadow-[inset_0_0_0_4px_#ffe855]',
      2: 'bg-[#d7e3ed] text-[#62748e] shadow-[inset_0_0_0_4px_#e7f0f6]',
      3: 'bg-[#e6b16f] text-[#a65f00] shadow-[inset_0_0_0_4px_#f0c48c]',
    } as const
    return (
      <span className={`grid h-[25px] w-[23px] place-items-center rounded-md text-[14px] font-black leading-none tracking-[0.18px] tabular-nums ${styles[rank as 1 | 2 | 3]}`}>
        {rank}
      </span>
    )
  }

  return <span className="grid h-[25px] w-[25px] place-items-center text-[14px] font-bold leading-none tracking-[0.18px] text-[#9f9fa9] tabular-nums">{rank}</span>
}

export function LeaderboardAvatar({ entry, index, small = false }: { entry: PermanentSidebarLeaderboardEntry; index: number; small?: boolean }) {
  const src = getLeaderboardAvatarSrc(entry, index)
  const size = small ? 34 : 40

  return (
    <span className={`${small ? 'h-[34px] w-[34px] rounded-[11px]' : 'h-10 w-10 rounded-[12.727px]'} grid shrink-0 place-items-center overflow-hidden bg-[#e4e4e7]`}>
      <Image className="kresco-media-outline h-full w-full object-cover" src={src} alt="" width={size} height={size} unoptimized referrerPolicy="no-referrer" />
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
      className={`group grid w-full grid-cols-[32px_1fr] gap-4 rounded-xl border-0 bg-transparent p-0 text-left ${sidebarRowMotion} hover:translate-x-0.5 hover:bg-[#f7f8fb] hover:shadow-[var(--shadow-border)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:hover:translate-x-0 ${index === 1 ? 'min-h-14' : 'min-h-[41px]'}`}
      type="button"
      onClick={onClick}
    >
      <span className={`grid h-8 w-8 place-items-center rounded-full border-2 border-current ${questToneClass(tone)} transition-[background-color,transform] duration-150 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100`}>
        <Icon size={18} strokeWidth={2.6} />
      </span>
      <div className="min-w-0">
        <strong className={`line-clamp-2 break-words text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#3f3f46] ${index === 1 ? 'max-w-[210px]' : ''}`}>
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
