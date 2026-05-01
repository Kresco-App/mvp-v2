'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Clock, CheckSquare, BookOpen, Crown, Edit2, Check, X,
  Zap, Flame, Star, Trophy,
} from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
import Link from 'next/link'

interface Stats {
  total_watch_minutes: number
  quizzes_passed: number
  lessons_completed: number
  is_pro: boolean
}

interface XPData {
  total_xp: number
  level: number
  xp_progress_pct: number
  xp_for_current_level: number
  xp_for_next_level: number
  streak_days: number
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [xpData, setXpData] = useState<XPData | null>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.full_name ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = 'Mon Profil — Kresco' }, [])

  useEffect(() => {
    api.get('/progress/stats').then(r => setStats(r.data)).catch(() => {})
    api.get('/progress/xp').then(r => setXpData(r.data)).catch(() => {})
  }, [])

  async function handleSave() {
    if (!name.trim()) return toast.error('Le nom ne peut pas être vide.')
    setSaving(true)
    try {
      const { data } = await api.patch('/profile/me', { full_name: name.trim() })
      updateUser({ full_name: data.full_name })
      setEditing(false)
      toast.success('Profil mis à jour !')
    } catch {
      toast.error('Erreur lors de la mise à jour du profil.')
    } finally {
      setSaving(false)
    }
  }

  const initials = user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className="kresco-shell" style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* Cover + Avatar */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
        {/* Cover banner */}
        <div style={{
          height: 120,
          background: 'linear-gradient(135deg,#453dee 0%,#6366f1 50%,#818cf8 100%)',
          position: 'relative',
        }} />

        {/* Avatar row */}
        <div style={{ padding: '0 28px 24px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginTop: -40, marginBottom: 16 }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  referrerPolicy="no-referrer"
                  style={{ width: 88, height: 88, borderRadius: 22, objectFit: 'cover', border: '4px solid var(--surface-card)' }}
                />
              ) : (
                <div style={{
                  width: 88, height: 88, borderRadius: 22,
                  background: 'linear-gradient(135deg,#453dee,#6366f1)',
                  border: '4px solid var(--surface-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>{initials}</span>
                </div>
              )}
              {user?.is_pro && (
                <div style={{
                  position: 'absolute', bottom: -6, right: -6,
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#f59e0b,#f97316)',
                  border: '2px solid var(--surface-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Crown size={12} color="#fff" />
                </div>
              )}
            </div>

            {/* Name + email */}
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              {editing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoFocus
                    className="kresco-control"
                    style={{ flex: 1, padding: '8px 12px', fontSize: 14 }}
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ width: 32, height: 32, borderRadius: 8, background: '#16a34a', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Check size={15} color="#fff" />
                  </button>
                  <button
                    onClick={() => { setEditing(false); setName(user?.full_name ?? '') }}
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-hover)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={15} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {user?.full_name}
                  </h1>
                  <button
                    onClick={() => setEditing(true)}
                    style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-hover)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Edit2 size={12} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>{user?.email}</p>
              {user?.is_pro ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'linear-gradient(135deg,#f59e0b,#f97316)', color: '#fff' }}>
                  <Crown size={10} />
                  Membre Pro
                </span>
              ) : (
                <span style={{ display: 'inline-flex', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                  Gratuit
                </span>
              )}
            </div>
          </div>

          {/* XP bar */}
          {xpData && (
            <div style={{ background: 'var(--surface-hover)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#453dee,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{xpData.level}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Niveau {xpData.level}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {(xpData.total_xp - xpData.xp_for_current_level).toLocaleString()} / {(xpData.xp_for_next_level - xpData.xp_for_current_level).toLocaleString()} XP
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-card)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${xpData.xp_progress_pct}%`, background: 'linear-gradient(90deg,#453dee,#6366f1)', transition: 'width 600ms ease' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <Flame size={16} color="#f97316" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>{xpData.streak_days}j</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { icon: Clock, bg: '#edf1ff', color: '#453dee', value: stats ? `${Math.round(stats.total_watch_minutes / 60)}h` : '—', label: 'Visionnage', sub: `${stats?.total_watch_minutes ?? 0} min au total` },
          { icon: CheckSquare, bg: '#f0fdf4', color: '#16a34a', value: stats?.quizzes_passed ?? '—', label: 'Quiz réussis', sub: 'score > seuil' },
          { icon: BookOpen, bg: '#fff7ed', color: '#f97316', value: stats?.lessons_completed ?? '—', label: 'Leçons terminées', sub: 'tous chapitres' },
          { icon: Zap, bg: '#fef3c7', color: '#f59e0b', value: xpData?.total_xp.toLocaleString() ?? '—', label: 'XP total', sub: `Niveau ${xpData?.level ?? 1}` },
        ].map(({ icon: Icon, bg, color, value, label, sub }) => (
          <div key={label} className="card" style={{ padding: '20px 18px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon size={18} color={color} />
            </div>
            <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 2px' }}>{value}</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{label}</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Info section */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Informations</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Niveau scolaire', value: user?.niveau === '1bac' ? '1ère Bac' : user?.niveau === '2bac' ? '2ème Bac' : '—' },
            { label: 'Filière', value: user?.filiere ?? '—' },
            { label: 'Email', value: user?.email ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade card */}
      {!user?.is_pro && (
        <div style={{ borderRadius: 20, padding: 28, background: 'linear-gradient(135deg,#453dee,#6366f1)', color: '#fff', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Star size={20} color="#fbbf24" fill="#fbbf24" />
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Passez à Pro</h3>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: '0 0 20px' }}>
              Accès illimité à tous les cours, quiz et exercices du Bac marocain.
            </p>
            <Link href="/pricing" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#fff', color: '#453dee',
              padding: '10px 22px', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}>
              <Trophy size={15} />
              Voir les offres
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
            {['Tous les cours', 'Quiz illimités', 'Examens blancs', 'Sans pub'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                <Check size={14} style={{ flexShrink: 0 }} />
                {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
