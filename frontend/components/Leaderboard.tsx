'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trophy, Search, Crown, Medal, ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import api from '@/lib/axios'

interface LeaderboardEntry {
  rank: number
  user_id: number
  full_name: string
  avatar_url: string
  total_xp: number
  level: number
  is_current_user: boolean
}

// ─── Widget Mode: used on Home page sidebar ───────────────────────────────────
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
          <LeaderboardRow key={entry.user_id} entry={entry} compact highlight={entry.is_current_user} />
        ))}
        {currentUser && !currentUserInTop && (
          <>
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, letterSpacing: 2, padding: '2px 0' }}>• • •</div>
            <LeaderboardRow entry={currentUser} compact highlight />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Full-page Leaderboard ────────────────────────────────────────────────────
export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const PAGE_SIZE = 20

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    try {
      const offset = (page - 1) * PAGE_SIZE
      const { data } = await api.get('/progress/leaderboard', {
        params: { limit: PAGE_SIZE, offset, search: search || undefined }
      })
      setEntries(data ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  function handleSearch() {
    setPage(1)
    setSearch(searchInput)
  }

  const currentUser = entries.find(e => e.is_current_user)
  const top3 = entries.filter(e => e.rank <= 3)
  const showPodium = page === 1 && !search && top3.length >= 2
  const hasMore = entries.length === PAGE_SIZE

  return (
    <div className="kresco-shell" style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#f59e0b,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>Classement</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Compétition de XP entre les étudiants Kresco</p>
        </div>
      </div>

      {/* Podium */}
      {showPodium && <Podium top3={top3} />}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher un joueur..."
          className="kresco-control"
          style={{ width: '100%', paddingLeft: 42, paddingRight: 40, paddingTop: 11, paddingBottom: 11, fontSize: 14 }}
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 60, background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--surface-hover)', animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
            {search ? `Aucun joueur trouvé pour "${search}"` : 'Aucun classement disponible'}
          </div>
        ) : (
          <div>
            {entries.map((entry, idx) => {
              const isMe = entry.is_current_user
              return (
                <div
                  key={entry.user_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 20px',
                    background: isMe ? 'var(--primary-soft)' : 'transparent',
                    borderBottom: idx < entries.length - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: isMe ? '3px solid var(--primary)' : '3px solid transparent',
                    transition: 'background 150ms',
                  }}
                >
                  <RankBadge rank={entry.rank} />

                  <AvatarBubble entry={entry} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: isMe ? 'var(--primary)' : 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.full_name}
                      {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--primary)', fontWeight: 400, opacity: 0.8 }}>(vous)</span>}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Niveau {entry.level}</p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Zap size={13} color="#f59e0b" fill="#f59e0b" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
                      {entry.total_xp.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>XP</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Current user sticky if not in visible list */}
      {currentUser && !entries.some(e => e.is_current_user) && (
        <div style={{
          marginTop: 12, borderRadius: 14, padding: '12px 20px',
          background: 'var(--primary-soft)', border: '1px solid rgba(69,61,238,0.2)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <RankBadge rank={currentUser.rank} />
          <AvatarBubble entry={currentUser} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', margin: '0 0 2px' }}>
              {currentUser.full_name} <span style={{ fontSize: 11, fontWeight: 400 }}>(vous)</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Niveau {currentUser.level}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={13} color="#f59e0b" fill="#f59e0b" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>{currentUser.total_xp.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>XP</span>
          </div>
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
              background: 'var(--surface-hover)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: page === 1 ? 0.4 : 1,
            }}
          >
            <ChevronLeft size={14} />
            Précédent
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600 }}>Page {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
              background: 'var(--surface-hover)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: !hasMore ? 0.4 : 1,
            }}
          >
            Suivant
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LeaderboardRow({ entry, compact = false, highlight = false }: {
  entry: LeaderboardEntry
  compact?: boolean
  highlight?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      borderRadius: 10, padding: compact ? '6px 8px' : '10px 14px',
      background: highlight ? 'var(--primary-soft)' : 'transparent',
      border: highlight ? '1px solid rgba(69,61,238,0.15)' : '1px solid transparent',
      transition: 'background 150ms',
    }}>
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

function Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  const sorted = top3.slice(0, 3).sort((a, b) => a.rank - b.rank)
  const order = sorted.length >= 2
    ? [sorted[1], sorted[0], sorted.length >= 3 ? sorted[2] : null].filter(Boolean) as LeaderboardEntry[]
    : sorted
  const heights = [80, 110, 64]
  const rankColors = [
    { bg: 'linear-gradient(to top,#94a3b8,#cbd5e1)', text: '#475569' },
    { bg: 'linear-gradient(to top,#f59e0b,#fcd34d)', text: '#92400e' },
    { bg: 'linear-gradient(to top,#d97706,#fbbf24)', text: '#78350f' },
  ]
  const rankLabel = [2, 1, 3]

  return (
    <div className="card" style={{ padding: '24px 20px 0', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12 }}>
        {order.map((entry, i) => (
          <div key={entry.user_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, maxWidth: 140 }}>
            <AvatarBubble entry={entry} />
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 0 1px' }}>
              {entry.full_name}
            </p>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', margin: 0 }}>
              {entry.total_xp.toLocaleString()} XP
            </p>
            <div style={{
              width: '100%', borderRadius: '10px 10px 0 0',
              height: heights[i], background: rankColors[i].bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: rankColors[i].text }}>{rankLabel[i]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
