'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trophy, Search, Crown, Medal, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '@/lib/axios'
import { cn } from '@/lib/utils'

interface LeaderboardEntry {
  rank: number
  user_id: number
  full_name: string
  avatar_url: string
  total_xp: number
  level: number
  is_current_user: boolean
}

// ─── Widget Mode: top 5 + current user rank (used on Home page sidebar) ─────
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
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 bg-slate-800 rounded-xl" />
        ))}
      </div>
    )
  }

  const top = entries.filter(e => !e.is_current_user || e.rank <= 5).slice(0, 5)
  const currentUser = entries.find(e => e.is_current_user)
  const currentUserInTop = top.some(e => e.is_current_user)

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Trophy size={15} className="text-yellow-400" />
          <span className="text-white text-sm font-semibold">Classement</span>
        </div>
        {onExpand && (
          <button
            onClick={onExpand}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition"
          >
            Voir tout
          </button>
        )}
      </div>

      {top.map(entry => (
        <LeaderboardRow key={entry.user_id} entry={entry} compact />
      ))}

      {currentUser && !currentUserInTop && (
        <div className="border-t border-slate-800 pt-2 mt-1">
          <p className="text-xs text-slate-500 mb-2 text-center">• • •</p>
          <LeaderboardRow entry={currentUser} compact highlight />
        </div>
      )}
    </div>
  )
}

// ─── Full-page Leaderboard ──────────────────────────────────────────────────
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
  const showPodium = page === 1 && !search && top3.length === 3
  const hasMore = entries.length === PAGE_SIZE

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
          <Trophy size={20} className="text-yellow-400" />
        </div>
        <div>
          <h1 className="text-white text-xl font-bold">Classement</h1>
          <p className="text-slate-500 text-sm">Concours de XP entre les etudiants</p>
        </div>
      </div>

      {/* Podium (page 1, no search) */}
      {showPodium && <Podium top3={top3} />}

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher un joueur..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800/40 animate-pulse" />
            ))}
          </div>
        ) : entries.filter(e => !e.is_current_user || e.rank <= page * PAGE_SIZE).length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            {search ? `Aucun joueur trouve pour "${search}"` : 'Aucun classement disponible'}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {entries.map(entry => (
              <div
                key={entry.user_id}
                className={cn(
                  'flex items-center gap-3 px-5 py-3.5 transition-colors',
                  entry.is_current_user && 'bg-indigo-500/10'
                )}
              >
                <RankBadge rank={entry.rank} />
                <Avatar entry={entry} />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-semibold truncate',
                    entry.is_current_user ? 'text-indigo-300' : 'text-white'
                  )}>
                    {entry.full_name}
                    {entry.is_current_user && (
                      <span className="ml-1.5 text-xs text-indigo-400 font-normal">(vous)</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">Niveau {entry.level}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-amber-400">
                    {entry.total_xp.toLocaleString()} XP
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current user sticky if not in visible list */}
      {currentUser && !entries.some(e => e.is_current_user && e.rank <= page * PAGE_SIZE) && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <RankBadge rank={currentUser.rank} />
          <Avatar entry={currentUser} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-indigo-300 truncate">
              {currentUser.full_name} <span className="text-xs text-indigo-400 font-normal">(vous)</span>
            </p>
            <p className="text-xs text-slate-500">Niveau {currentUser.level}</p>
          </div>
          <p className="text-sm font-bold text-amber-400">
            {currentUser.total_xp.toLocaleString()} XP
          </p>
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 rounded-xl transition"
          >
            <ChevronLeft size={14} />
            Precedent
          </button>
          <span className="text-slate-500 text-sm font-medium">Page {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 rounded-xl transition"
          >
            Suivant
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function LeaderboardRow({
  entry,
  compact = false,
  highlight = false,
}: {
  entry: LeaderboardEntry
  compact?: boolean
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl px-3 py-2',
      highlight && 'bg-indigo-500/10 border border-indigo-500/20',
      !highlight && 'hover:bg-slate-800/50 transition-colors'
    )}>
      <RankBadge rank={entry.rank} small />
      <Avatar entry={entry} small={compact} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-semibold truncate',
          highlight ? 'text-indigo-300' : 'text-white'
        )}>
          {entry.full_name}
          {entry.is_current_user && (
            <span className="ml-1 text-xs text-indigo-400 font-normal">(vous)</span>
          )}
        </p>
      </div>
      <span className="text-xs font-bold text-amber-400 flex-shrink-0">
        {entry.total_xp.toLocaleString()} XP
      </span>
    </div>
  )
}

function RankBadge({ rank, small = false }: { rank: number; small?: boolean }) {
  const size = small ? 'w-6 h-6' : 'w-8 h-8'
  if (rank === 1) {
    return (
      <span className={cn('flex items-center justify-center flex-shrink-0 rounded-full bg-yellow-500/15', size)}>
        <Crown className="text-yellow-400" size={small ? 13 : 16} />
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className={cn('flex items-center justify-center flex-shrink-0 rounded-full bg-slate-400/15', size)}>
        <Medal className="text-slate-300" size={small ? 13 : 16} />
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className={cn('flex items-center justify-center flex-shrink-0 rounded-full bg-amber-600/15', size)}>
        <Medal className="text-amber-500" size={small ? 13 : 16} />
      </span>
    )
  }
  return (
    <span className={cn(
      'flex items-center justify-center flex-shrink-0 rounded-full bg-slate-800 font-bold text-slate-400',
      size, small ? 'text-[10px]' : 'text-xs'
    )}>
      {rank}
    </span>
  )
}

function Avatar({ entry, small = false }: { entry: LeaderboardEntry; small?: boolean }) {
  const size = small ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return entry.avatar_url ? (
    <img
      src={entry.avatar_url}
      alt=""
      referrerPolicy="no-referrer"
      className={cn('rounded-full object-cover flex-shrink-0', size)}
    />
  ) : (
    <div className={cn('rounded-full bg-indigo-900/60 flex items-center justify-center flex-shrink-0', size)}>
      <span className="text-indigo-300 font-bold">{entry.full_name?.[0]}</span>
    </div>
  )
}

function Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  const sorted = [...top3].sort((a, b) => a.rank - b.rank)
  const order = [sorted[1], sorted[0], sorted[2]] // 2nd, 1st, 3rd
  const heights = ['h-20', 'h-28', 'h-16']
  const bgColors = [
    'bg-gradient-to-t from-slate-600 to-slate-500',
    'bg-gradient-to-t from-yellow-600 to-yellow-400',
    'bg-gradient-to-t from-amber-800 to-amber-600',
  ]
  const ringColors = ['ring-slate-400', 'ring-yellow-400', 'ring-amber-600']

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
      <div className="flex items-end justify-center gap-3">
        {order.map((entry, i) => (
          <div key={entry.user_id} className="flex flex-col items-center gap-2 flex-1 max-w-[120px]">
            <div className={cn('rounded-full ring-2 p-0.5', ringColors[i])}>
              <Avatar entry={entry} />
            </div>
            <p className="text-xs text-white font-medium text-center max-w-[90px] truncate">
              {entry.full_name}
            </p>
            <p className="text-[11px] text-amber-400 font-bold">
              {entry.total_xp.toLocaleString()} XP
            </p>
            <div className={cn(
              'w-full rounded-t-xl flex items-center justify-center',
              heights[i], bgColors[i]
            )}>
              <span className="text-white font-bold text-lg drop-shadow">{entry.rank}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
