'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Trophy, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { getJson } from '@/lib/apiClient'
import { LeaderboardPageSkeleton, SkeletonBlock } from '@/components/figma/skeletons'
import {
  getDemotionStartRank,
  getLeagueInfoByKey,
  getMajorLeagueStrip,
  getPromotionCutoff,
} from '@/lib/leaderboardLeagues'
import {
  AvatarBubble,
  LeaderboardListRow,
  LeaderboardRow,
  LeaderboardRowsSkeleton,
  LeagueMarker,
  ZoneDivider,
  enrichEntry,
  leagueTextClass,
  type LeaderboardEntry,
  type LeaderboardVisibleRow,
} from '@/components/leaderboard/LeaderboardParts'

export function LeaderboardWidget({ onExpand }: { onExpand?: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    getJson<LeaderboardEntry[]>('/progress/leaderboard', { params: { limit: 5 } })
      .then(data => setEntries(data))
      .catch(() => {
        const message = 'Could not load leaderboard.'
        setError(message)
        toast.error(message)
      })
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

  if (error) {
    return (
      <div className="card p-5 text-sm text-[color:var(--text-secondary)]">
        {error}
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const requestGenerationRef = useRef(0)
  const PAGE_SIZE = 20

  const fetchLeaderboard = useCallback(async () => {
    const requestGeneration = requestGenerationRef.current + 1
    requestGenerationRef.current = requestGeneration
    setLoading(true)
    setError('')
    try {
      const offset = (page - 1) * PAGE_SIZE
      const data = await getJson<LeaderboardEntry[]>('/progress/leaderboard', {
        params: { limit: PAGE_SIZE, offset, ...(searchQuery ? { search: searchQuery } : {}) }
      })
      const mapped = (data ?? []).map((entry: LeaderboardEntry) => enrichEntry(entry))
      if (requestGenerationRef.current !== requestGeneration) return
      setEntries(mapped)
    } catch {
      if (requestGenerationRef.current !== requestGeneration) return
      const message = 'Could not load leaderboard.'
      setEntries([])
      setError(message)
      toast.error(message)
    } finally {
      if (requestGenerationRef.current === requestGeneration) {
        setLoading(false)
      }
    }
  }, [page, searchQuery])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  useEffect(() => {
    const nextSearch = searchInput.trim()
    const timer = window.setTimeout(() => {
      setPage(1)
      setSearchQuery(nextSearch)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  function clearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
  }

  const visibleEntries = useMemo(() => entries, [entries])
  const normalizedSearch = useMemo(() => searchInput.trim().toLowerCase(), [searchInput])
  const hasMore = entries.length === PAGE_SIZE
  const currentUser = useMemo(
    () => visibleEntries.find((e) => e.is_current_user),
    [visibleEntries],
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

  if (loading && entries.length === 0) {
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
            ) : error ? (
              <div className="px-4 py-12 text-center text-sm text-[color:var(--text-secondary)]">
                {error}
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-[color:var(--text-tertiary)]">
                {normalizedSearch ? `Aucun joueur trouve pour "${searchInput}"` : 'Aucun classement disponible'}
              </div>
            ) : (
              <div>
                {visibleRows.map(({ entry, key, showPromotionDivider, showDemotionDivider, isLast }) => (
                  <div key={key}>
                    {showPromotionDivider && (
                      <ZoneDivider zone="promotion" />
                    )}
                    {showDemotionDivider && (
                      <ZoneDivider zone="demotion" />
                    )}
                    <LeaderboardListRow entry={entry} isLast={isLast} />
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
          {!currentUser && visibleEntries.length > 0 && (
            <div className="card p-5">
              <p className="mb-1 text-[15px] font-bold text-[color:var(--text-primary)]">Your progress</p>
              <p className="m-0 text-[13px] text-[color:var(--text-secondary)]">Your rank is not shown in these results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
