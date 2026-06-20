'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw, Search, Trophy, X } from 'lucide-react'
import { toast } from 'sonner'
import { getJson } from '@/lib/apiClient'
import { LeaderboardPageSkeleton, SkeletonBlock } from '@/components/figma/skeletons'
import {
  getLeagueInfoByKey,
  getMajorLeagueStrip,
  type Zone,
} from '@/lib/leaderboardLeagues'
import {
  AvatarBubble,
  LeaderboardListRow,
  LeaderboardRow,
  LeaderboardRowsSkeleton,
  LeagueMarker,
  enrichEntry,
  leagueTextClass,
  type LeaderboardEntry,
} from '@/components/leaderboard/LeaderboardParts'

const LEADERBOARD_WIDGET_SIZE = 10
const LEADERBOARD_PAGE_SIZE = 20

type LeaderboardMode = 'league' | 'global'

type SeasonLeaderboard = {
  season: string
  starts_at?: string
  ends_at?: string
  total_entries?: number
  entries: LeaderboardEntry[]
}

export function LeaderboardWidget({ onExpand }: { onExpand?: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchWidgetLeaderboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getJson<LeaderboardEntry[]>('/progress/leaderboard', {
        params: { limit: LEADERBOARD_WIDGET_SIZE, include_current: true },
      })
      setEntries((data ?? []).map((entry) => enrichEntry(entry)))
    } catch {
      const message = 'Impossible de charger le classement.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchWidgetLeaderboard()
  }, [fetchWidgetLeaderboard])

  const top = useMemo(() => entries.filter(e => !e.is_current_user || e.rank <= LEADERBOARD_WIDGET_SIZE).slice(0, LEADERBOARD_WIDGET_SIZE), [entries])
  const currentUser = useMemo(() => entries.find(e => e.is_current_user), [entries])
  const currentUserInTop = useMemo(() => top.some(e => e.is_current_user), [top])
  const pinnedCurrentUser = currentUser && !currentUserInTop ? currentUser : null

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
        <div className="mb-3 flex items-center gap-2">
          <AlertCircle size={15} className="text-red-500" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={fetchWidgetLeaderboard}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--surface-card)]"
        >
          <RefreshCw size={13} />
          Reessayer
        </button>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
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

      <div className="flex max-h-[360px] flex-col gap-1 overflow-y-auto pr-1">
        {top.map(entry => (
          <LeaderboardRow key={`${entry.user_id}-${entry.rank}`} entry={entry} compact highlight={entry.is_current_user} />
        ))}
        {pinnedCurrentUser && (
          <>
            <div className="py-1 text-center text-[10px] font-semibold uppercase tracking-[1.8px] text-[color:var(--text-tertiary)]">Rang global</div>
            <LeaderboardRow entry={pinnedCurrentUser} compact highlight />
          </>
        )}
      </div>
    </div>
  )
}

export function LeaderboardPage() {
  const [mode, setMode] = useState<LeaderboardMode>('league')
  const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[]>([])
  const [seasonLeaderboard, setSeasonLeaderboard] = useState<SeasonLeaderboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const requestGenerationRef = useRef(0)

  const fetchLeaderboard = useCallback(async () => {
    const requestGeneration = requestGenerationRef.current + 1
    requestGenerationRef.current = requestGeneration
    setLoading(true)
    setError('')
    try {
      const activeSearch = searchQuery.trim()
      const [globalData, seasonData] = await Promise.all([
        getJson<LeaderboardEntry[]>('/progress/leaderboard', {
          params: {
            limit: LEADERBOARD_PAGE_SIZE,
            offset: 0,
            ...(activeSearch && mode === 'global' ? { search: activeSearch } : {}),
            ...(!activeSearch ? { include_current: true } : {}),
          },
        }),
        getJson<SeasonLeaderboard>('/progress/leaderboard/seasons', {
          params: {
            season: 'weekly',
            limit: LEADERBOARD_PAGE_SIZE,
            offset: 0,
            ...(activeSearch && mode === 'league' ? { search: activeSearch } : {}),
            ...(!activeSearch ? { include_current: true } : {}),
          },
        }),
      ])
      const mappedGlobal = (globalData ?? []).map((entry: LeaderboardEntry) => enrichEntry(entry))
      const mappedSeason = {
        ...seasonData,
        entries: (seasonData?.entries ?? []).map((entry: LeaderboardEntry) => enrichEntry(entry)),
      }
      if (requestGenerationRef.current !== requestGeneration) return
      setGlobalEntries(mappedGlobal)
      setSeasonLeaderboard(mappedSeason)
    } catch {
      if (requestGenerationRef.current !== requestGeneration) return
      const message = 'Impossible de charger le classement.'
      setGlobalEntries([])
      setSeasonLeaderboard(null)
      setError(message)
      toast.error(message)
    } finally {
      if (requestGenerationRef.current === requestGeneration) {
        setLoading(false)
      }
    }
  }, [mode, searchQuery])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  useEffect(() => {
    const nextSearch = searchInput.trim()
    const timer = window.setTimeout(() => {
      setSearchQuery(nextSearch)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  function clearSearch() {
    setSearchInput('')
    setSearchQuery('')
  }

  const activeSearch = useMemo(() => searchQuery.trim(), [searchQuery])
  const seasonEntries = useMemo(() => seasonLeaderboard?.entries ?? [], [seasonLeaderboard])
  const totalLeagueEntries = Math.max(seasonLeaderboard?.total_entries ?? 0, seasonEntries.length)
  const activeEntries = mode === 'league' ? seasonEntries : globalEntries
  const visibleEntries = useMemo(
    () => activeEntries.filter((entry) => !entry.is_current_user || entry.rank <= LEADERBOARD_PAGE_SIZE).slice(0, LEADERBOARD_PAGE_SIZE),
    [activeEntries],
  )
  const activeCurrent = useMemo(() => activeEntries.find((entry) => entry.is_current_user), [activeEntries])
  const globalCurrent = useMemo(() => globalEntries.find((entry) => entry.is_current_user), [globalEntries])
  const leagueCurrent = useMemo(() => seasonEntries.find((entry) => entry.is_current_user), [seasonEntries])
  const currentUser = activeSearch ? activeCurrent : (mode === 'league' ? leagueCurrent ?? globalCurrent : globalCurrent ?? leagueCurrent)
  const shouldPinCurrentUser = Boolean(
    !activeSearch
    && currentUser
    && !visibleEntries.some((entry) => entry.user_id === currentUser.user_id),
  )
  const leaderboardEntries = visibleEntries
  const currentLeague = useMemo(
    () => (globalCurrent?.leagueKey ? getLeagueInfoByKey(globalCurrent.leagueKey) : null),
    [globalCurrent],
  )
  const leagueStrip = useMemo(
    () => (currentLeague ? getMajorLeagueStrip(currentLeague.key) : []),
    [currentLeague],
  )
  const displayedLeagueStrip = useMemo(() => {
    const seenMajorKeys = new Set<string>()
    return leagueStrip.filter((league) => {
      if (seenMajorKeys.has(league.majorKey)) return false
      seenMajorKeys.add(league.majorKey)
      return true
    })
  }, [leagueStrip])
  const promotionCutoff = getLeaguePromotionCutoff(totalLeagueEntries)
  const demotionStart = getLeagueDemotionStart(totalLeagueEntries)
  const percentileLabel = leagueCurrent && totalLeagueEntries > 0
    ? `Top ${Math.max(1, Math.ceil((leagueCurrent.rank / totalLeagueEntries) * 100))}%`
    : 'N/A'
  const visibleRows = useMemo(
    () => leaderboardEntries.map((entry, idx) => {
      const zone = mode === 'league' ? getLeagueZone(entry.rank, totalLeagueEntries) : undefined
      return {
        entry,
        key: `${mode}-${entry.user_id}-${entry.rank}`,
        showPromotionDivider: mode === 'league' && entry.rank === promotionCutoff + 1,
        showDemotionDivider: mode === 'league' && entry.rank === demotionStart,
        isLast: idx >= leaderboardEntries.length - 1 && !shouldPinCurrentUser,
        zone,
      }
    }),
    [demotionStart, leaderboardEntries, mode, promotionCutoff, shouldPinCurrentUser, totalLeagueEntries],
  )

  if (loading && globalEntries.length === 0 && seasonEntries.length === 0) {
    return <LeaderboardPageSkeleton />
  }

  return (
    <div className="kresco-shell mx-auto max-w-[1060px]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        <main className="min-w-0">
          <div className="card mb-4 p-4 shadow-[0_4px_0_rgba(0,0,0,0.08)] sm:p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <Trophy size={20} className="mt-0.5 shrink-0 text-[color:var(--primary)]" />
                <div className="min-w-0">
                  <h1 className="m-0 text-[24px] font-extrabold leading-tight text-[color:var(--text-primary)]">Classement</h1>
                  <p className="m-0 mt-1 text-sm font-semibold text-[color:var(--text-secondary)]">Top global et ligue hebdomadaire.</p>
                </div>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-1 rounded-[16px] bg-[color:var(--surface-hover)] p-1">
              <LeaderboardModeButton active={mode === 'league'} label="Ligue hebdo" onClick={() => setMode('league')} />
              <LeaderboardModeButton active={mode === 'global'} label="Global" onClick={() => setMode('global')} />
            </div>

            {currentLeague && (
              <div className="mb-4 rounded-[18px] bg-[color:var(--surface-hover)] px-4 py-4">
                <div className="mb-3">
                  <div className="min-w-0">
                    <p className={`m-0 text-[26px] font-extrabold leading-none ${leagueTextClass(currentLeague.color)}`}>
                      {mode === 'league' ? currentLeague.label : 'Global'}
                    </p>
                    <p className="m-0 mt-1.5 text-[13px] font-extrabold text-[color:var(--text-secondary)]">
                      {mode === 'league'
                        ? `Top ${promotionCutoff} montent - rang ${demotionStart}+ descendent cette semaine`
                        : `Top ${LEADERBOARD_PAGE_SIZE} global, avec votre rang epingle si besoin`}
                    </p>
                  </div>
                </div>
                {mode === 'league' ? (
                  <div className="flex flex-wrap items-center justify-center gap-3 py-2 sm:gap-[22px]">
                    {displayedLeagueStrip.map((league, index) => (
                      <LeagueMarker key={`${league.key}-${index}`} league={league} active={league.majorKey === currentLeague.majorKey} />
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[112px] place-items-center py-2 text-center">
                    <div>
                      <p className="m-0 text-[34px] font-extrabold leading-none text-[color:var(--primary)]">Top {LEADERBOARD_PAGE_SIZE}</p>
                      <p className="m-0 mt-2 text-sm font-bold text-[color:var(--text-secondary)]">Classement global</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input
              aria-label="Rechercher un joueur"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={mode === 'league' ? 'Rechercher dans la ligue...' : 'Rechercher un joueur...'}
              className="kresco-control w-full px-[42px] py-[11px] pr-12 text-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Effacer la recherche"
                className="absolute right-[10px] top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[color:var(--text-tertiary)] transition-colors hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="card overflow-hidden p-0" aria-busy={loading}>
            {loading ? (
              <LeaderboardRowsSkeleton />
            ) : error ? (
              <div className="grid justify-items-center px-5 py-12 text-center">
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-500">
                  <AlertCircle size={20} />
                </span>
                <p className="m-0 text-sm font-bold text-[color:var(--text-primary)]">{error}</p>
                <p className="m-0 mt-1 max-w-[340px] text-sm text-[color:var(--text-secondary)]">
                  Verifiez votre connexion, puis relancez le chargement.
                </p>
                <button
                  type="button"
                  onClick={fetchLeaderboard}
                  className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface-hover)] px-4 py-2 text-[13px] font-semibold text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--surface-card)]"
                >
                  <RefreshCw size={14} />
                  Reessayer
                </button>
              </div>
            ) : leaderboardEntries.length === 0 ? (
              <div className="grid justify-items-center px-5 py-12 text-center">
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-[color:var(--surface-hover)] text-[color:var(--text-tertiary)]">
                  <Search size={18} />
                </span>
                <p className="m-0 text-sm font-bold text-[color:var(--text-primary)]">
                  {activeSearch ? 'Aucun joueur trouve' : 'Aucun classement disponible'}
                </p>
                <p className="m-0 mt-1 max-w-[340px] text-sm text-[color:var(--text-secondary)]">
                  {activeSearch ? `Aucun resultat pour "${activeSearch}".` : 'Revenez plus tard pour voir les premiers scores.'}
                </p>
                {activeSearch && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface-hover)] px-4 py-2 text-[13px] font-semibold text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--surface-card)]"
                  >
                    <X size={14} />
                    Effacer la recherche
                  </button>
                )}
              </div>
            ) : (
              <div>
                {visibleRows.map(({ entry, key, showPromotionDivider, showDemotionDivider, isLast, zone }) => (
                  <div key={key}>
                    {showPromotionDivider && (
                      <LeaderboardZoneBoundary direction="up" label="Fin de la zone de promotion" />
                    )}
                    {showDemotionDivider && (
                      <LeaderboardZoneBoundary direction="down" label="Zone de demotion" />
                    )}
                    <LeaderboardListRow
                      entry={entry}
                      isLast={isLast}
                      rankMode={mode === 'league' ? 'raw' : 'global'}
                      scoreMode={mode === 'league' ? 'season' : 'total'}
                      zone={zone}
                    />
                  </div>
                ))}
                {shouldPinCurrentUser && currentUser && (
                  <div className="border-t border-[color:var(--border)] bg-[color:var(--surface-card)]">
                    <div className="flex items-center justify-between gap-3 px-4 pt-3 text-[11px] font-semibold uppercase tracking-[1px] text-[color:var(--text-tertiary)] sm:px-5">
                      <span>{mode === 'league' ? 'Votre rang de ligue' : 'Votre rang global'}</span>
                      <span>Hors top {LEADERBOARD_PAGE_SIZE}</span>
                    </div>
                    <LeaderboardListRow
                      entry={currentUser}
                      isLast
                      rankMode={mode === 'league' ? 'raw' : 'global'}
                      scoreMode={mode === 'league' ? 'season' : 'total'}
                      zone={mode === 'league' ? getLeagueZone(currentUser.rank, totalLeagueEntries) : undefined}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        <aside className="grid content-start gap-4">
          {currentLeague && (globalCurrent || leagueCurrent) && (
            <div className="card p-4 shadow-[0_4px_0_rgba(0,0,0,0.08)]">
              <p className="mb-4 text-[17px] font-extrabold text-[color:var(--text-primary)]">Votre position</p>
              <div className="flex items-center gap-2.5">
                <AvatarBubble entry={globalCurrent ?? leagueCurrent!} />
                <div>
                  <p className="m-0 text-[16px] font-extrabold leading-tight text-[color:var(--text-primary)]">{(globalCurrent ?? leagueCurrent)?.full_name}</p>
                  <p className="m-0 text-xs text-[color:var(--text-tertiary)]">
                    {(globalCurrent?.total_xp ?? leagueCurrent?.total_xp ?? 0).toLocaleString()} points
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <LeaderboardSummaryTile label="Global" value={globalCurrent ? `#${globalCurrent.rank}` : 'N/A'} />
                <LeaderboardSummaryTile label="Ligue" value={leagueCurrent ? `#${leagueCurrent.rank}` : 'N/A'} />
                <LeaderboardSummaryTile label="Percentile" value={percentileLabel} />
                <LeaderboardSummaryTile label="Niveau" value={`${globalCurrent?.level ?? leagueCurrent?.level ?? 'N/A'}`} />
              </div>
            </div>
          )}
          {!currentUser && activeEntries.length > 0 && (
            <div className="card p-5">
              <p className="mb-1 text-[15px] font-bold text-[color:var(--text-primary)]">Votre progression</p>
              <p className="m-0 text-[13px] text-[color:var(--text-secondary)]">Votre rang n&apos;apparait pas dans ces resultats.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function LeaderboardModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`h-10 rounded-[12px] border-0 text-sm font-extrabold transition-colors ${active ? 'bg-[color:var(--surface-card)] text-[color:var(--primary)] shadow-[0_1px_0_rgba(0,0,0,0.08)]' : 'bg-transparent text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]'}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function LeaderboardZoneBoundary({ direction, label }: { direction: 'up' | 'down'; label: string }) {
  const Icon = direction === 'up' ? ArrowUp : ArrowDown
  const tone = direction === 'up' ? 'text-emerald-600' : 'text-red-500'

  return (
    <div className="flex items-center justify-center gap-2 border-y border-[color:var(--border)] bg-white px-4 py-2">
      <Icon className={`shrink-0 ${tone}`} size={16} strokeWidth={2.8} />
      <span className={`text-[12px] font-extrabold uppercase tracking-[0.6px] ${tone}`}>{label}</span>
      <Icon className={`shrink-0 ${tone}`} size={16} strokeWidth={2.8} />
    </div>
  )
}

function LeaderboardSummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[color:var(--surface-hover)] px-2 py-2.5">
      <p className="m-0 text-[10px] font-semibold uppercase text-[color:var(--text-tertiary)]">{label}</p>
      <p className="m-0 mt-1 text-sm font-extrabold text-[color:var(--text-primary)]">{value}</p>
    </div>
  )
}

function getLeaguePromotionCutoff(totalEntries: number) {
  if (totalEntries <= 0) return 1
  return Math.max(1, Math.ceil(totalEntries * 0.2))
}

function getLeagueDemotionStart(totalEntries: number) {
  if (totalEntries <= 0) return Number.POSITIVE_INFINITY
  return Math.max(getLeaguePromotionCutoff(totalEntries) + 1, Math.floor(totalEntries * 0.8) + 1)
}

function getLeagueZone(rank: number, totalEntries: number): Zone {
  if (rank <= getLeaguePromotionCutoff(totalEntries)) return 'promotion'
  if (rank >= getLeagueDemotionStart(totalEntries)) return 'demotion'
  return 'safe'
}
