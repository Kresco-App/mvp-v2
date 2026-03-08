'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import api from '@/lib/axios'

interface XPData {
  total_xp: number
  level: number
  xp_progress_pct: number
  xp_for_next_level: number
  streak_days: number
}

interface Props {
  compact?: boolean
  className?: string
}

export default function XPBar({ compact = false, className = '' }: Props) {
  const [xp, setXP] = useState<XPData | null>(null)
  const [animPct, setAnimPct] = useState(0)

  useEffect(() => {
    api.get('/progress/xp').then(r => {
      setXP(r.data)
      // Animate bar fill
      setTimeout(() => setAnimPct(r.data.xp_progress_pct), 100)
    }).catch(() => {})
  }, [])

  if (!xp) return <div className="h-20 bg-slate-950 rounded-xl animate-pulse" />

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Zap size={14} className="text-amber-500 fill-amber-500" />
        <span className="text-xs font-bold text-slate-300">Lvl {xp.level}</span>
        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-1000"
            style={{ width: `${animPct}%` }}
          />
        </div>
        <span className="text-xs text-slate-400">{xp.total_xp} XP</span>
      </div>
    )
  }

  return (
    <div className={`bg-slate-900 rounded-2xl border border-slate-800 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
            <Zap size={16} className="text-amber-500 fill-amber-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Niveau</p>
            <p className="text-lg font-black text-white leading-none">{xp.level}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Total XP</p>
          <p className="text-sm font-bold text-slate-300">{xp.total_xp.toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-1">
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-1000"
            style={{ width: `${animPct}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{animPct}%</span>
        <span>Prochain niveau : {xp.xp_for_next_level} XP</span>
      </div>

      {xp.streak_days > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-1.5">
          <span className="text-base">🔥</span>
          <span className="text-xs font-semibold text-slate-300">Serie de {xp.streak_days} jours</span>
        </div>
      )}
    </div>
  )
}
