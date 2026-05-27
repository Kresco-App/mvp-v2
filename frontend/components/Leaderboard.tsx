'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Trophy, Search, Crown, Medal, ChevronLeft, ChevronRight, Zap, ArrowUp, ArrowDown } from 'lucide-react'
import Image from 'next/image'
import api from '@/lib/axios'
import { LeaderboardPageSkeleton, SkeletonBlock } from '@/components/figma/skeletons'
import {
  type LeagueKey,
  type Zone,
  getDemotionStartRank,
  getLeagueInfoByKey,
  getMajorLeagueStrip,
  getPromotionCutoff,
  getZone,
  rankToDivisionLocalRank,
  rankToLeagueKey,
} from '@/lib/leaderboardLeagues'

interface LeaderboardEntry {
  rank: number
  user_id: number
  full_name: string
  avatar_url: string
  total_xp: number
  level: number
  is_current_user: boolean
  leagueKey?: LeagueKey
  leagueLabel?: string
  divisionLocalRank?: number
  zone?: Zone
}

type LeaderboardVisibleRow = {
  entry: LeaderboardEntry
  key: string
  showPromotionDivider: boolean
  showDemotionDivider: boolean
  isLast: boolean
}

function enrichEntry(entry: LeaderboardEntry): LeaderboardEntry {
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

function leagueTextClass(color: string) {
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

export function LeaderboardWidget({ onExpand }: { onExpand?: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/progress/leaderboard', { params: { limit: 5 } })
      .then(r => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const top = useMemo(() => entries.filter(e => !e.is_current_user || e.rank <= 5).slice(0, 5), [entries])
  const currentUser = useMemo(() => entries.find(e => e.is_current_user), [entries])
  const currentUserInTop = useMemo(() => top.some(e => e.is_current_user), [top])

  if (loading) {
    return (
      <div className="card kresco-skeleton-card space-y-3 p-5">
        {[1, 2, 3].map((i) => (
          <div className="grid grid-cols-[24px_28px_1fr_auto] items-center gap-2" key={i}>
            <SkeletonBlock className="h-6 w-6 rounded-full" />
            <SkeletonBlock className="h-7 w-7 rounded-full" />
            <SkeletonBlock className="h-[13px] w-[70%] rounded-[6px]" />
            <SkeletonBlock className="h-[12px] w-14 rounded-[6px]" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="card p-5">
      <div className="mb-[14px] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={15} className="text-amber-500" />
          <span className="text-sm font-bold text-[color:var(--text-primary)]">Classement</span>
        </div>
        {onExpand && (
          <button type="button" onClick={onExpand} className="cursor-pointer border-0 bg-transparent text-xs font-semibold text-[color:var(--primary)]">
            Voir tout
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {top.map(entry => (
          <LeaderboardRow key={`${entry.user_id}-${entry.rank}`} entry={entry} compact highlight={entry.is_current_user} />
        ))}
        {currentUser && !currentUserInTop && (
          <>
            <div className="py-[2px] text-center text-[11px] tracking-[2px] text-[color:var(--text-tertiary)]">. . .</div>
            <LeaderboardRow entry={currentUser} compact highlight />
          </>
        )}
      </div>
    </div>
  )
}

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [lastNonEmptyEntries, setLastNonEmptyEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const PAGE_SIZE = 20

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    try {
      const offset = (page - 1) * PAGE_SIZE
      const { data } = await api.get('/progress/leaderboard', {
        params: { limit: PAGE_SIZE, offset }
      })
      const mapped = (data ?? []).map((entry: LeaderboardEntry) => enrichEntry(entry))
      setEntries(mapped)
      if (mapped.length > 0) {
        setLastNonEmptyEntries(mapped)
      }
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  function clearSearch() {
    setSearchInput('')
  }

  const displayEntries = useMemo(
    () => (entries.length > 0 ? entries : lastNonEmptyEntries),
    [entries, lastNonEmptyEntries],
  )
  const normalizedSearch = useMemo(() => searchInput.trim().toLowerCase(), [searchInput])
  const instantEntries = useMemo(
    () => (
      normalizedSearch
        ? displayEntries.filter((entry) => entry.full_name.toLowerCase().includes(normalizedSearch))
        : displayEntries
    ),
    [displayEntries, normalizedSearch],
  )
  const visibleEntries = useMemo(
    () => (normalizedSearch && instantEntries.length === 0 ? displayEntries : instantEntries),
    [displayEntries, instantEntries, normalizedSearch],
  )
  const hasMore = entries.length === PAGE_SIZE
  const headerSourceEntries = useMemo(
    () => (entries.length > 0 ? entries : lastNonEmptyEntries),
    [entries, lastNonEmptyEntries],
  )
  const currentUser = useMemo(
    () => headerSourceEntries.find((e) => e.is_current_user) ?? headerSourceEntries[0],
    [headerSourceEntries],
  )
  const currentLeague = useMemo(
    () => (currentUser?.leagueKey ? getLeagueInfoByKey(currentUser.leagueKey) : null),
    [currentUser],
  )
  const leagueStrip = useMemo(
    () => (currentLeague ? getMajorLeagueStrip(currentLeague.key) : []),
    [currentLeague],
  )
  const visibleRows = useMemo<LeaderboardVisibleRow[]>(
    () => visibleEntries.map((entry, idx) => ({
      entry,
      key: `${entry.user_id}-${entry.rank}`,
      showPromotionDivider: entry.divisionLocalRank === getPromotionCutoff() + 1,
      showDemotionDivider: entry.divisionLocalRank === getDemotionStartRank(),
      isLast: idx >= visibleEntries.length - 1,
    })),
    [visibleEntries],
  )

  if (loading && lastNonEmptyEntries.length === 0) {
    return <LeaderboardPageSkeleton />
  }

  return (
    <div className="kresco-shell mx-auto max-w-[980px]">
      <div className="grid grid-cols-[1fr_300px] gap-5">
        <div>
          <div className="card mb-4 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <Trophy size={20} color="#6366f1" />
              <h1 className="m-0 text-[22px] font-extrabold text-[color:var(--text-primary)]">Classement</h1>
            </div>

            <div className="mb-2.5 flex flex-wrap items-center justify-center gap-[14px]">
              {leagueStrip.map((league, index) => (
                <LeagueMarker key={`${league.key}-${index}`} league={league} active={league.key === currentLeague?.key} />
              ))}
            </div>

            {currentLeague && (
              <div className="text-center">
                <h2 className={`mt-[8px] mb-1 text-[42px] font-extrabold leading-none ${leagueTextClass(currentLeague.color)}`}>
                  {currentLeague.label}
                </h2>
                <p className="m-0 text-lg font-bold text-[color:var(--text-secondary)]">
                  Top {getPromotionCutoff()} advance to the next league
                </p>
              </div>
            )}
          </div>

          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input
              aria-label="Rechercher un joueur"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Rechercher un joueur..."
              className="kresco-control w-full px-[42px] py-[11px] pr-10 text-sm"
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} className="absolute right-[14px] top-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent text-xs text-[color:var(--text-tertiary)]">
                x
              </button>
            )}
          </div>

          <div className="card overflow-hidden p-0">
            {loading ? (
              <LeaderboardRowsSkeleton />
            ) : visibleEntries.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-[color:var(--text-tertiary)]">
                {normalizedSearch ? `Aucun joueur trouve pour "${searchInput}"` : 'Aucun classement disponible'}
              </div>
            ) : (
              <div>
                {normalizedSearch && instantEntries.length === 0 && (
                  <div className="px-5 py-2.5 text-xs text-[color:var(--text-secondary)]">
                    Aucun r&eacute;sultat pour &quot;{searchInput}&quot;. Classement complet affich&eacute;.
                  </div>
                )}
                {normalizedSearch && instantEntries.length > 0 && instantEntries.length !== displayEntries.length && (
                  <div className="px-5 py-2.5 text-xs text-[color:var(--text-secondary)]">
                    Filtre instantan&eacute; actif pour &quot;{searchInput}&quot;.
                  </div>
                )}
                {visibleRows.map(({ entry, key, showPromotionDivider, showDemotionDivider, isLast }) => (
                  <div key={key}>
                    {showPromotionDivider && (
                      <ZoneDivider zone="promotion" />
                    )}
                    {showDemotionDivider && (
                      <ZoneDivider zone="demotion" />
                    )}
                    <div
                      className={[
                        'flex items-center gap-[14px] px-5 py-3',
                        !isLast ? 'border-b border-[color:var(--border)]' : 'border-b-0',
                        entry.is_current_user
                          ? 'border-l-[3px] border-l-[color:var(--primary)] bg-[color:var(--primary-soft)]'
                          : 'border-l-[3px] border-l-transparent bg-transparent',
                      ].join(' ')}
                    >
                      <RankBadge rank={entry.divisionLocalRank ?? entry.rank} />
                      <AvatarBubble entry={entry} />
                      <div className="min-w-0 flex-1">
                        <p className={`m-0 mb-[2px] truncate text-[15px] font-bold ${entry.is_current_user ? 'text-[color:var(--primary)]' : 'text-[color:var(--text-primary)]'}`}>
                          {entry.full_name}
                          {entry.is_current_user && <span className="ml-1.5 text-[11px] font-medium">(vous)</span>}
                        </p>
                        <p className="m-0 text-xs text-[color:var(--text-tertiary)]">
                          {entry.leagueLabel}{' \u2022 '}Niveau {entry.level}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Zap size={13} color="#f59e0b" fill="#f59e0b" />
                        <span className="text-sm font-bold text-amber-500">
                          {entry.total_xp.toLocaleString()}
                        </span>
                        <span className="text-[11px] text-[color:var(--text-tertiary)]">XP</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(page > 1 || hasMore) && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface-hover)] px-4 py-[9px] text-[13px] font-semibold text-[color:var(--text-primary)] ${page === 1 ? 'opacity-40' : 'opacity-100'}`}
              >
                <ChevronLeft size={14} />
                Precedent
              </button>
              <span className="text-[13px] font-semibold text-[color:var(--text-tertiary)]">Page {page}</span>
              <button
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                className={`flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface-hover)] px-4 py-[9px] text-[13px] font-semibold text-[color:var(--text-primary)] ${!hasMore ? 'opacity-40' : 'opacity-100'}`}
              >
                Suivant
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {currentLeague && currentUser && (
            <div className="card p-5">
              <p className={`mb-1 text-[30px] font-extrabold ${leagueTextClass(currentLeague.color)}`}>{currentLeague.label}</p>
              <p className="mb-3 text-[13px] text-[color:var(--text-secondary)]">Keep track of your progress</p>
              <div className="flex items-center gap-2.5">
                <AvatarBubble entry={currentUser} />
                <div>
                  <p className="m-0 font-bold text-[color:var(--text-primary)]">{currentUser.full_name}</p>
                  <p className="m-0 text-xs text-[color:var(--text-tertiary)]">{currentUser.total_xp.toLocaleString()} points</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LeaderboardRowsSkeleton() {
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

function ZoneDivider({ zone }: { zone: "promotion" | "demotion" }) {
  const isPromotion = zone === "promotion"
  const label = isPromotion ? "PROMOTION ZONE" : "DEMOTION ZONE"
  const color = isPromotion ? "#10b981" : "#ef4444"
  const Icon = isPromotion ? ArrowUp : ArrowDown

  return (
    <div className="flex items-center justify-center gap-[14px] border-y border-[color:var(--border)] px-2 py-[14px]">
      <Icon size={20} color={color} />
      <span className={`text-[28px] font-extrabold ${leagueTextClass(color)}`}>{label}</span>
      <Icon size={20} color={color} />
    </div>
  )
}

function LeagueMarker({ league, active }: { league: ReturnType<typeof getLeagueInfoByKey>, active: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className={`flex items-center justify-center rounded-full ${active ? 'h-[106px] w-[106px]' : 'h-[74px] w-[74px]'} ${leagueRingClasses(league.color, active)}`}>
      {!imageFailed ? (
        <Image
          src={league.emblemAsset}
          alt={league.label}
          width={active ? 76 : 48}
          height={active ? 76 : 48}
          className="object-contain"
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

function LeaderboardRow({ entry, compact = false, highlight = false }: {
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
      <span className="shrink-0 text-xs font-bold text-amber-500">
        {entry.total_xp.toLocaleString()} XP
      </span>
    </div>
  )
}

function RankBadge({ rank, small = false }: { rank: number; small?: boolean }) {
  if (rank === 1) return (
    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(245,158,11,0.12)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <Crown size={small ? 13 : 16} color="#f59e0b" />
    </div>
  )
  if (rank === 2) return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-[rgba(148,163,184,0.12)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <Medal size={small ? 13 : 16} color="#94a3b8" />
    </div>
  )
  if (rank === 3) return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-[rgba(217,119,6,0.12)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <Medal size={small ? 13 : 16} color="#d97706" />
    </div>
  )
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-hover)] ${small ? 'h-6 w-6' : 'h-8 w-8'}`}>
      <span className={small ? 'text-[10px] font-bold text-[color:var(--text-tertiary)]' : 'text-[11px] font-bold text-[color:var(--text-tertiary)]'}>{rank}</span>
    </div>
  )
}

function AvatarBubble({ entry, small = false }: { entry: LeaderboardEntry; small?: boolean }) {
  const size = small ? 28 : 36
  return entry.avatar_url ? (
    <Image
      src={entry.avatar_url}
      alt=""
      width={size}
      height={size}
      unoptimized
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-full object-cover ${small ? 'h-7 w-7' : 'h-9 w-9'}`}
    />
  ) : (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-[color:var(--primary-soft)] ${small ? 'h-7 w-7' : 'h-9 w-9'}`}>
      <span className={small ? 'text-[11px] font-bold text-[color:var(--primary)]' : 'text-[13px] font-bold text-[color:var(--primary)]'}>{entry.full_name?.[0] ?? '?'}</span>
    </div>
  )
}
