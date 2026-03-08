'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trophy, Search, Crown, Medal } from 'lucide-react'
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

// ─── Widget Mode: top 3 + current user rank ────────────────────────────────
export function LeaderboardWidget({ onExpand }: { onExpand?: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/progress/leaderboard', { params: { limit: 5, offset: 0 } })
      .then(r => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-3 animate-pulse">
        {[1,2,3].map(i => (
          <div key={i} className="h-10 bg-slate-800 rounded-xl" />
        ))}
      </div>
    )
  }

  const top5 = entries.filter(e => e.rank <= 5)
  const currentUserEntry = entries.find(e => e.is_current_user)

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown size={14} className="text-yellow-400" />
    if (rank === 2) return <Medal size={14} className="text-slate-300" />
    if (rank === 3) return <Medal size={14} className="text-amber-600" />
    return <span className="text-slate-500 text-xs font-bold w-3.5 text-center">{rank}</span>
  }

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

      {top5.slice(0, 3).map(entry => (
        <LeaderboardRow key={entry.user_id} entry={entry} compact />
      ))}

      {currentUserEntry && !top5.some(e => e.user_id === currentUserEntry.user_id) && (
        <>
          <div className="border-t border-slate-800 pt-2 mt-1">
            <p className="text-xs text-slate-400 mb-2 text-center">• • •</p>
            <LeaderboardRow entry={currentUserEntry} compact highlight />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Full-page Leaderboard ──────────────────────────────────────────────────
export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [hasMore, setHasMore] = useState(true)
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
      setEntries(prev => (page > 1 && !search ? [...prev, ...(data ?? [])] : (data ?? [])))
      setHasMore((data ?? []).length === PAGE_SIZE)
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

  const top3 = entries.filter(e => e.rank <= 3 && page === 1 && !search)

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy size={22} className="text-yellow-400" />
        <h1 className="text-slate-900 dark:text-white text-2xl font-bold">Classement</h1>
        <span className="ml-auto text-slate-500 text-sm">{entries.length} joueurs</span>
      </div>

      {/* Podium (page 1, no search) */}
      {page === 1 && !search && top3.length === 3 && (
        <Podium top3={top3} />
      )}

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher un joueur..."
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            {search ? `Aucun joueur trouvé pour "${search}"` : 'Aucun classement disponible'}
          </div>
        ) : (
          <div>
            {entries.map((entry, i) => (
              <div
                key={entry.user_id}
                className={cn(
                  'flex items-center gap-3 px-5 py-3 transition-colors',
                  i < entries.length - 1 && 'border-b border-slate-200 dark:border-slate-800/60',
                  entry.is_current_user && 'bg-indigo-500/10'
                )}
              >
                <RankBadge rank={entry.rank} />
                <Avatar entry={entry} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-semibold truncate', entry.is_current_user ? 'text-indigo-500' : 'text-slate-900 dark:text-white')}>
                    {entry.full_name}
                    {entry.is_current_user && <span className="ml-1.5 text-xs text-indigo-400">(vous)</span>}
                  </p>
                  <p className="text-xs text-slate-500">Niveau {entry.level}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-amber-400">{entry.total_xp.toLocaleString()} XP</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && hasMore && !search && (
        <div className="flex justify-center">
          <button
            onClick={() => setPage(p => p + 1)}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
          >
            Charger plus
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
      <Avatar entry={entry} small />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold truncate', highlight ? 'text-indigo-300' : 'text-white')}>
          {entry.full_name}
          {entry.is_current_user && <span className="ml-1 text-xs text-indigo-500">(vous)</span>}
        </p>
      </div>
      <span className="text-xs font-bold text-amber-400">{entry.total_xp.toLocaleString()} XP</span>
    </div>
  )
}

function RankBadge({ rank, small = false }: { rank: number; small?: boolean }) {
  const size = small ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'
  if (rank === 1) return <span className={cn('flex items-center justify-center flex-shrink-0', size)}><Crown className="text-yellow-400" size={small ? 12 : 16} /></span>
  if (rank === 2) return <span className={cn('flex items-center justify-center flex-shrink-0', size)}><Medal className="text-slate-300" size={small ? 12 : 16} /></span>
  if (rank === 3) return <span className={cn('flex items-center justify-center flex-shrink-0', size)}><Medal className="text-amber-600" size={small ? 12 : 16} /></span>
  return <span className={cn('flex items-center justify-center flex-shrink-0 rounded-full bg-slate-800 font-bold text-slate-400', size)}>#{rank}</span>
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
    <div className={cn('rounded-full bg-indigo-900 flex items-center justify-center flex-shrink-0', size)}>
      <span className="text-indigo-300 font-bold">{entry.full_name[0]}</span>
    </div>
  )
}

function Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  const order = [top3[1], top3[0], top3[2]] // 2nd, 1st, 3rd
  const heights = ['h-20', 'h-28', 'h-16']
  const colors = ['bg-slate-600', 'bg-yellow-500', 'bg-amber-700']

  return (
    <div className="flex items-end justify-center gap-4 pt-2 pb-4">
      {order.map((entry, i) => (
        <div key={entry.user_id} className="flex flex-col items-center gap-2">
          <Avatar entry={entry} />
          <p className="text-xs text-white font-medium text-center max-w-[80px] truncate">{entry.full_name}</p>
          <p className="text-[11px] text-amber-400 font-bold">{entry.total_xp.toLocaleString()} XP</p>
          <div className={cn('w-16 rounded-t-xl flex items-center justify-center', heights[i], colors[i])}>
            <span className="text-white font-bold text-lg">{entry.rank}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
