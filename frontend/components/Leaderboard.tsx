'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trophy, Search, Crown, Medal, ChevronLeft, ChevronRight, Zap, ArrowUp, ArrowDown } from 'lucide-react'
import api from '@/lib/axios'
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

export function LeaderboardWidget({ onExpand }: { onExpand?: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/progress/leaderboard', { params: { limit: 5 } })
      .then(r => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="card p-5 space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 40, borderRadius: 10, background: 'var(--surface-hover)' }} />
        ))}
      </div>
    )
  }

  const top = entries.filter(e => !e.is_current_user || e.rank <= 5).slice(0, 5)
  const currentUser = entries.find(e => e.is_current_user)
  const currentUserInTop = top.some(e => e.is_current_user)

  return (
    <div className="card p-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={15} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Classement</span>
        </div>
        {onExpand && (
          <button onClick={onExpand} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
            Voir tout
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {top.map(entry => (
          <LeaderboardRow key={`${entry.user_id}-${entry.rank}`} entry={entry} compact highlight={entry.is_current_user} />
        ))}
        {currentUser && !currentUserInTop && (
          <>
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, letterSpacing: 2, padding: '2px 0' }}>. . .</div>
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

  const displayEntries = entries.length > 0 ? entries : lastNonEmptyEntries
  const normalizedSearch = searchInput.trim().toLowerCase()
  const instantEntries = normalizedSearch
    ? displayEntries.filter((entry) => entry.full_name.toLowerCase().includes(normalizedSearch))
    : displayEntries
  const visibleEntries = normalizedSearch && instantEntries.length === 0 ? displayEntries : instantEntries
  const hasMore = entries.length === PAGE_SIZE
  const headerSourceEntries = entries.length > 0 ? entries : lastNonEmptyEntries
  const currentUser = headerSourceEntries.find((e) => e.is_current_user) ?? headerSourceEntries[0]
  const currentLeague = currentUser?.leagueKey ? getLeagueInfoByKey(currentUser.leagueKey) : null
  const leagueStrip = currentLeague ? getMajorLeagueStrip(currentLeague.key) : []

  return (
    <div className="kresco-shell" style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Trophy size={20} color="#6366f1" />
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Classement</h1>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
              {leagueStrip.map((league) => (
                <LeagueMarker key={league.key} league={league} active={league.key === currentLeague?.key} />
              ))}
            </div>

            {currentLeague && (
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 42, lineHeight: 1, margin: '8px 0 4px', color: currentLeague.color, fontWeight: 800 }}>
                  {currentLeague.label}
                </h2>
                <p style={{ margin: 0, fontSize: 18, color: 'var(--text-secondary)', fontWeight: 700 }}>
                  Top {getPromotionCutoff()} advance to the next league
                </p>
              </div>
            )}
          </div>

          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Rechercher un joueur..."
              className="kresco-control"
              style={{ width: '100%', paddingLeft: 42, paddingRight: 40, paddingTop: 11, paddingBottom: 11, fontSize: 14 }}
            />
            {searchInput && (
              <button
                onClick={clearSearch}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
              >
                x
              </button>
            )}
          </div>

          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            {loading ? (
              <div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ height: 60, background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--surface-hover)', animation: 'pulse 1.5s ease infinite' }} />
                ))}
              </div>
            ) : visibleEntries.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                {normalizedSearch ? `Aucun joueur trouve pour "${searchInput}"` : 'Aucun classement disponible'}
              </div>
            ) : (
              <div>
                {normalizedSearch && instantEntries.length === 0 && (
                  <div style={{ padding: '10px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                    Aucun résultat pour &quot;{searchInput}&quot;. Classement complet affiché.
                  </div>
                )}
                {normalizedSearch && instantEntries.length > 0 && instantEntries.length !== displayEntries.length && (
                  <div style={{ padding: '10px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                    Filtre instantané actif pour &quot;{searchInput}&quot;.
                  </div>
                )}
                {visibleEntries.map((entry, idx) => (
                  <div key={`${entry.user_id}-${entry.rank}`}>
                    {entry.divisionLocalRank === getPromotionCutoff() + 1 && (
                      <ZoneDivider zone="promotion" />
                    )}
                    {entry.divisionLocalRank === getDemotionStartRank() && (
                      <ZoneDivider zone="demotion" />
                    )}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 20px',
                        background: entry.is_current_user ? 'var(--primary-soft)' : 'transparent',
                        borderBottom: idx < visibleEntries.length - 1 ? '1px solid var(--border)' : 'none',
                        borderLeft: entry.is_current_user ? '3px solid var(--primary)' : '3px solid transparent',
                      }}
                    >
                      <RankBadge rank={entry.divisionLocalRank ?? entry.rank} />
                      <AvatarBubble entry={entry} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: entry.is_current_user ? 'var(--primary)' : 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.full_name}
                          {entry.is_current_user && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500 }}>(vous)</span>}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                          {entry.leagueLabel} • Niveau {entry.level}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <Zap size={13} color="#f59e0b" fill="#f59e0b" />
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
                          {entry.total_xp.toLocaleString()}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>XP</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(page > 1 || hasMore) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} />
                Precedent
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600 }}>Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !hasMore ? 0.4 : 1 }}
              >
                Suivant
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {currentLeague && currentUser && (
            <div className="card" style={{ padding: 20 }}>
              <p style={{ margin: '0 0 4px', fontSize: 30, fontWeight: 800, color: currentLeague.color }}>{currentLeague.label}</p>
              <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: 13 }}>Keep track of your progress</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AvatarBubble entry={currentUser} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{currentUser.full_name}</p>
                  <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 12 }}>{currentUser.total_xp.toLocaleString()} points</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ZoneDivider({ zone }: { zone: "promotion" | "demotion" }) {
  const isPromotion = zone === "promotion"
  const label = isPromotion ? "PROMOTION ZONE" : "DEMOTION ZONE"
  const color = isPromotion ? "#10b981" : "#ef4444"
  const Icon = isPromotion ? ArrowUp : ArrowDown

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '14px 8px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <Icon size={20} color={color} />
      <span style={{ color, fontSize: 28, fontWeight: 800, letterSpacing: 0 }}>{label}</span>
      <Icon size={20} color={color} />
    </div>
  )
}

function LeagueMarker({ league, active }: { league: ReturnType<typeof getLeagueInfoByKey>, active: boolean }) {
  return (
    <div style={{ width: active ? 106 : 74, height: active ? 106 : 74, borderRadius: '50%', border: active ? `3px solid ${league.color}` : '1px solid var(--border)', background: active ? `${league.color}20` : 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img
        src={league.emblemAsset}
        alt={league.label}
        style={{ width: active ? 76 : 48, height: active ? 76 : 48, objectFit: 'contain' }}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null
          if (fallback) fallback.style.display = 'flex'
        }}
      />
      <div style={{ display: 'none', width: active ? 76 : 48, height: active ? 76 : 48, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', fontSize: active ? 12 : 10, fontWeight: 700, color: league.color, textAlign: 'center', padding: 6 }}>
        {league.majorLabel}
      </div>
    </div>
  )
}

function LeaderboardRow({ entry, compact = false, highlight = false }: {
  entry: LeaderboardEntry
  compact?: boolean
  highlight?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: compact ? '6px 8px' : '10px 14px', background: highlight ? 'var(--primary-soft)' : 'transparent', border: highlight ? '1px solid rgba(69,61,238,0.15)' : '1px solid transparent', transition: 'background 150ms' }}>
      <RankBadge rank={entry.rank} small />
      <AvatarBubble entry={entry} small={compact} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: highlight ? 'var(--primary)' : 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.full_name}
          {entry.is_current_user && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--primary)', fontWeight: 400 }}>(vous)</span>}
        </p>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', flexShrink: 0 }}>
        {entry.total_xp.toLocaleString()} XP
      </span>
    </div>
  )
}

function RankBadge({ rank, small = false }: { rank: number; small?: boolean }) {
  const sz = small ? 24 : 32
  if (rank === 1) return (
    <div style={{ width: sz, height: sz, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Crown size={small ? 13 : 16} color="#f59e0b" />
    </div>
  )
  if (rank === 2) return (
    <div style={{ width: sz, height: sz, borderRadius: '50%', background: 'rgba(148,163,184,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Medal size={small ? 13 : 16} color="#94a3b8" />
    </div>
  )
  if (rank === 3) return (
    <div style={{ width: sz, height: sz, borderRadius: '50%', background: 'rgba(217,119,6,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Medal size={small ? 13 : 16} color="#d97706" />
    </div>
  )
  return (
    <div style={{ width: sz, height: sz, borderRadius: '50%', background: 'var(--surface-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: small ? 10 : 11, fontWeight: 700, color: 'var(--text-tertiary)' }}>{rank}</span>
    </div>
  )
}

function AvatarBubble({ entry, small = false }: { entry: LeaderboardEntry; small?: boolean }) {
  const size = small ? 28 : 36
  return entry.avatar_url ? (
    <img
      src={entry.avatar_url}
      alt=""
      referrerPolicy="no-referrer"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: small ? 11 : 13, fontWeight: 700, color: 'var(--primary)' }}>{entry.full_name?.[0] ?? '?'}</span>
    </div>
  )
}
