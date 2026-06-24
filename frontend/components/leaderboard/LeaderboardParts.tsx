'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import { ArrowDown, ArrowUp, Crown, Medal, Zap } from 'lucide-react'
import { SkeletonBlock } from '@/components/figma/skeletons'
import {
  type LeagueKey,
  type Zone,
  getLeagueInfoByKey,
  getZone,
  rankToDivisionLocalRank,
  rankToLeagueKey,
} from '@/lib/leaderboardLeagues'

export interface LeaderboardEntry {
  rank: number
  user_id: number
  full_name: string
  avatar_url: string
  total_xp: number
  season_xp?: number
  level: number
  is_current_user: boolean
  leagueKey?: LeagueKey
  leagueLabel?: string
  divisionLocalRank?: number
  zone?: Zone
}

export type LeaderboardVisibleRow = {
  entry: LeaderboardEntry
  key: string
  showPromotionDivider: boolean
  showDemotionDivider: boolean
  isLast: boolean
}

export function enrichEntry(entry: LeaderboardEntry): LeaderboardEntry {
  const leagueKey = rankToLeagueKey(entry.rank)
  const league = getLeagueInfoByKey(leagueKey)
  const divisionLocalRank = rankToDivisionLocalRank(entry.rank)
  return {
    ...entry,
    leagueKey,
    leagueLabel: league.label,
    divisionLocalRank,
    zone: getZone(divisionLocalRank),
  }
}

export function leagueTextClass(color: string) {
  switch (color) {
    case '#cc6a00':
      return 'text-[#cc6a00]'
    case '#9CA3AF':
      return 'text-[#9CA3AF]'
    case '#f59e0b':
      return 'text-amber-500'
    case '#7284f7':
      return 'text-[#7284f7]'
    case '#10b981':
      return 'text-emerald-500'
    case '#ef4444':
      return 'text-red-500'
    case '#a855f7':
      return 'text-[#a855f7]'
    default:
      return 'text-[color:var(--text-primary)]'
  }
}

function leagueRingClasses(color: string, active: boolean) {
  if (!active) return 'border border-[color:var(--border)] bg-[color:var(--surface-hover)]'
  switch (color) {
    case '#cc6a00':
      return 'border-[3px] border-[#cc6a00] bg-[rgba(204,106,0,0.12)]'
    case '#9CA3AF':
      return 'border-[3px] border-[#9CA3AF] bg-[rgba(156,163,175,0.12)]'
    case '#f59e0b':
      return 'border-[3px] border-amber-500 bg-[rgba(245,158,11,0.12)]'
    case '#7284f7':
      return 'border-[3px] border-[#7284f7] bg-[rgba(114,132,247,0.12)]'
    case '#10b981':
      return 'border-[3px] border-emerald-500 bg-[rgba(16,185,129,0.12)]'
    case '#ef4444':
      return 'border-[3px] border-red-500 bg-[rgba(239,68,68,0.12)]'
    case '#a855f7':
      return 'border-[3px] border-[#a855f7] bg-[rgba(168,85,247,0.12)]'
    default:
      return 'border-[3px] border-[color:var(--border)] bg-[color:var(--surface-hover)]'
  }
}

export function LeaderboardRowsSkeleton() {
  return (
    <div>
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          className="grid h-[64px] grid-cols-[32px_36px_1fr_auto] items-center gap-[14px] border-b border-theme px-5 last:border-b-0"
          key={index}
        >
          <SkeletonBlock className="h-8 w-8 rounded-full" />
          <SkeletonBlock className="h-9 w-9 rounded-full" />
          <span className="grid min-w-0 gap-2">
            <SkeletonBlock className="h-[15px] w-[46%] rounded-[6px]" />
            <SkeletonBlock className="h-[12px] w-[32%] rounded-[6px]" />
          </span>
          <SkeletonBlock className="h-[16px] w-24 rounded-[6px]" />
        </div>
      ))}
    </div>
  )
}

export function ZoneDivider({ zone }: { zone: 'promotion' | 'demotion' }) {
  const isPromotion = zone === 'promotion'
  const label = isPromotion ? 'ZONE DE PROMOTION' : 'ZONE DE RELEGATION'
  const color = isPromotion ? '#10b981' : '#ef4444'
  const Icon = isPromotion ? ArrowUp : ArrowDown

  return (
    <div className="flex items-center justify-center gap-2 border-y border-[color:var(--border)] px-3 py-3 sm:gap-[14px] sm:py-[14px]">
      <Icon size={20} color={color} className="shrink-0" />
      <span className={`text-center text-base font-extrabold sm:text-[28px] ${leagueTextClass(color)}`}>{label}</span>
      <Icon size={20} color={color} className="shrink-0" />
    </div>
  )
}

export function LeagueMarker({ league, active }: { league: ReturnType<typeof getLeagueInfoByKey>; active: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div
      aria-current={active ? 'true' : undefined}
      className={`flex shrink-0 items-center justify-center rounded-full transition-transform duration-150 ${active ? 'h-20 w-20 sm:h-[92px] sm:w-[92px]' : 'h-14 w-14 sm:h-16 sm:w-16'} ${leagueRingClasses(league.color, active)}`}
      title={league.majorLabel}
    >
      {!imageFailed ? (
        <Image
          src={league.emblemAsset}
          alt={league.label}
          width={active ? 64 : 42}
          height={active ? 64 : 42}
          className="kresco-media-outline object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className={`flex items-center justify-center rounded-full p-1.5 text-center font-bold ${active ? 'h-[76px] w-[76px] text-xs' : 'h-12 w-12 text-[10px]'} ${leagueTextClass(league.color)}`}>
          {league.majorLabel}
        </div>
      )}
    </div>
  )
}

export const LeaderboardRow = memo(function LeaderboardRow({ entry, compact = false, highlight = false }: {
  entry: LeaderboardEntry
  compact?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center gap-2.5 rounded-[10px] border transition-[background] duration-150',
        compact ? 'px-2 py-1.5' : 'px-3.5 py-2.5',
        highlight ? 'border-[color:rgba(69,61,238,0.15)] bg-[color:var(--primary-soft)]' : 'border-transparent bg-transparent',
      ].join(' ')}
    >
      <RankBadge rank={entry.rank} small />
      <AvatarBubble entry={entry} small={compact} />
      <div className="min-w-0 flex-1">
        <p className={`m-0 truncate text-[13px] font-semibold ${highlight ? 'text-[color:var(--primary)]' : 'text-[color:var(--text-primary)]'}`}>
          {entry.full_name}
          {entry.is_current_user && <span className="ml-1 text-[10px] font-normal text-[color:var(--primary)]">(vous)</span>}
        </p>
      </div>
      <span className="shrink-0 text-xs font-bold text-amber-500 tabular-nums">
        {entry.total_xp.toLocaleString()} XP
      </span>
    </div>
  )
})

export const LeaderboardListRow = memo(function LeaderboardListRow({
  entry,
  isLast,
  rankMode = 'division',
  scoreMode = 'total',
  zone,
}: {
  entry: LeaderboardEntry
  isLast: boolean
  rankMode?: 'division' | 'global' | 'raw'
  scoreMode?: 'total' | 'season'
  zone?: Zone
}) {
  const rankValue = rankMode === 'global' || rankMode === 'raw' ? entry.rank : entry.divisionLocalRank ?? entry.rank
  const scoreValue = scoreMode === 'season' ? entry.season_xp ?? entry.total_xp : entry.total_xp
  const scoreLabel = scoreMode === 'season' ? 'WEEK XP' : 'XP'
  const metaLabel = scoreMode === 'season'
    ? `Semaine en cours - Niveau ${entry.level}`
    : `${entry.leagueLabel} - Niveau ${entry.level}`
  const zoneClass = entry.is_current_user
    ? 'border-l-[color:var(--primary)] bg-[color:var(--primary-soft)]'
    : zone === 'promotion'
      ? 'border-l-emerald-500 bg-emerald-50/70 hover:bg-emerald-50'
      : zone === 'demotion'
        ? 'border-l-red-500 bg-red-50/70 hover:bg-red-50'
        : 'border-l-transparent bg-transparent hover:bg-[color:var(--surface-hover)]'

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3 transition-colors duration-150 sm:gap-[14px] sm:px-5',
        !isLast ? 'border-b border-[color:var(--border)]' : 'border-b-0',
        'border-l-[3px]',
        zoneClass,
      ].join(' ')}
    >
      <RankBadge rank={rankValue} />
      <AvatarBubble entry={entry} />
      <div className="min-w-0 flex-1">
        <p className={`m-0 mb-[2px] truncate text-[15px] font-bold ${entry.is_current_user ? 'text-[color:var(--primary)]' : 'text-[color:var(--text-primary)]'}`}>
          {entry.full_name}
          {entry.is_current_user && <span className="ml-1.5 text-[11px] font-medium">(vous)</span>}
        </p>
        <p className="m-0 text-xs text-[color:var(--text-tertiary)]">
          {metaLabel}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Zap size={13} color="#f59e0b" fill="#f59e0b" />
        <span className="text-sm font-bold text-amber-500 tabular-nums">
          {scoreValue.toLocaleString()}
        </span>
        <span className="text-[11px] text-[color:var(--text-tertiary)]">{scoreLabel}</span>
      </div>
    </div>
  )
})

function RankBadge({ rank, small = false }: { rank: number; small?: boolean }) {
  if (rank === 1) return (
    <div aria-label={`Rang ${rank}`} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(245,158,11,0.12)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <Crown size={small ? 13 : 16} color="#f59e0b" />
    </div>
  )
  if (rank === 2) return (
    <div aria-label={`Rang ${rank}`} className={`flex shrink-0 items-center justify-center rounded-full bg-[rgba(148,163,184,0.12)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <Medal size={small ? 13 : 16} color="#94a3b8" />
    </div>
  )
  if (rank === 3) return (
    <div aria-label={`Rang ${rank}`} className={`flex shrink-0 items-center justify-center rounded-full bg-[rgba(217,119,6,0.12)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <Medal size={small ? 13 : 16} color="#d97706" />
    </div>
  )
  return (
    <div aria-label={`Rang ${rank}`} className={`flex shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-hover)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <span className={`${small ? 'text-[10px] font-bold text-[color:var(--text-tertiary)]' : 'text-[11px] font-bold text-[color:var(--text-tertiary)]'} tabular-nums`}>{rank}</span>
    </div>
  )
}

export const AvatarBubble = memo(function AvatarBubble({ entry, small = false }: { entry: LeaderboardEntry; small?: boolean }) {
  const size = small ? 28 : 36
  return entry.avatar_url ? (
    <Image
      src={entry.avatar_url}
      alt=""
      width={size}
      height={size}
      unoptimized
      referrerPolicy="no-referrer"
      className={`kresco-media-outline shrink-0 rounded-full object-cover ${small ? 'h-7 w-7' : 'h-9 w-9'}`}
    />
  ) : (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-[color:var(--primary-soft)] ${small ? 'h-7 w-7' : 'h-9 w-9'}`}>
      <span className={small ? 'text-[11px] font-bold text-[color:var(--primary)]' : 'text-[13px] font-bold text-[color:var(--primary)]'}>{entry.full_name?.[0] ?? '?'}</span>
    </div>
  )
})
