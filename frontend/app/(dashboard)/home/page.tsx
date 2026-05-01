'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
import { findSubjectIcon } from '@/lib/subjects'
import { fetchSubjectProgressSummary, type SubjectProgressSummary } from '@/lib/subjectProgress'
import { Zap, Flame, Trophy, Star, ChevronRight, CheckCircle2, CalendarDays, TimerReset } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────
interface Quest {
  id: number
  title: string
  quest_type: string
  progress: number
  target: number
  xp_reward: number
  completed: boolean
}

interface LeaderboardEntry {
  rank: number
  user_id: number
  name: string
  avatar_url: string | null
  xp: number
  is_current_user: boolean
}

interface Subject {
  id: number
  title: string
  description: string
  chapter_count: number
  lesson_count: number
}

interface XPData {
  total_xp: number
  level: number
  xp_for_current_level: number
  xp_for_next_level: number
  xp_progress_pct: number
  streak_days: number
}

// ─── Helpers ───────────────────────────────────────────────────
function getSubjectStyle(title: string) {
  const s = findSubjectIcon(title)
  const bgMap: Record<string, string> = {
    'bg-indigo-50': '#EEF2FF', 'bg-emerald-50': '#F0FDF4', 'bg-orange-50': '#FFF7ED',
    'bg-purple-50': '#FDF4FF', 'bg-teal-50': '#ECFDF5', 'bg-amber-50': '#FEF3C7',
    'bg-rose-50': '#FFF1F2', 'bg-blue-50': '#EFF6FF', 'bg-violet-50': '#F5F3FF',
    'bg-green-50': '#F0FDF4',
  }
  return { emoji: s.emoji, bg: bgMap[s.bg] ?? '#F1F5F9' }
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const CALENDAR_DAYS = [
  { day: '8', label: 'Lun' },
  { day: '9', label: 'Mar' },
  { day: '10', label: 'Mer' },
  { day: '11', label: 'Jeu' },
  { day: '12', label: 'Ven' },
]

const QUEST_COLORS: Record<string, { from: string; to: string }> = {
  complete_lesson: { from: '#453dee', to: '#6366f1' },
  pass_quiz:       { from: '#f59e0b', to: '#f97316' },
  earn_xp:         { from: '#10b981', to: '#059669' },
  study_minutes:   { from: '#ef4444', to: '#dc2626' },
}

const RANK_STYLES = [
  { emoji: '🥇', color: '#f59e0b' },
  { emoji: '🥈', color: '#94a3b8' },
  { emoji: '🥉', color: '#f97316' },
]

function LevelBadge({ level, xp }: { level: number; xp: number }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'linear-gradient(135deg,#453dee,#6366f1)',
      borderRadius: 99, padding: '4px 12px 4px 8px',
      boxShadow: '0 2px 8px rgba(69,61,238,0.3)',
    }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{level}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{xp.toLocaleString()} XP</span>
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuthStore()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [quests, setQuests] = useState<Quest[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [xpData, setXpData] = useState<XPData | null>(null)
  const [resumeProgress, setResumeProgress] = useState<Record<number, SubjectProgressSummary>>({})

  const firstName = user?.full_name?.split(' ')[0] ?? 'Apprenant'
  const streakDays = xpData?.streak_days ?? 0
  const todayIndex = (new Date().getDay() + 6) % 7
  const activeStreak: number[] = []
  for (let i = 0; i < Math.min(streakDays, 7); i++) {
    activeStreak.push(((todayIndex - i) + 7) % 7)
  }
  const completedQuestCount = quests.filter(q => q.completed).length

  useEffect(() => { document.title = 'Accueil — Kresco' }, [])

  useEffect(() => {
    api.get('/courses/subjects')
      .then(async r => {
        setSubjects(r.data)
        const entries = await Promise.all(
          r.data.slice(0, 2).map(async (s: Subject) => {
            try { return [s.id, await fetchSubjectProgressSummary(s.id, s.lesson_count)] as const }
            catch { return null }
          })
        )
        setResumeProgress(Object.fromEntries(entries.filter(Boolean) as [number, SubjectProgressSummary][]))
      })
      .catch(() => toast.error('Erreur de chargement des matières.'))
      .finally(() => setLoading(false))

    api.get('/progress/daily-quests').then(r => setQuests(r.data)).catch(() => {})
    api.get('/progress/leaderboard').then(r => {
      const uid = user?.id
      setLeaderboard(r.data.map((e: any) => ({
        rank: e.rank, user_id: e.user_id, name: e.full_name,
        avatar_url: e.avatar_url || null, xp: e.total_xp,
        is_current_user: e.user_id === uid,
      })))
    }).catch(() => {})
    api.get('/progress/xp').then(r => setXpData(r.data)).catch(() => {})
  }, [user?.id])

  function claimQuest(id: number) {
    api.post(`/progress/daily-quests/${id}/claim`)
      .then(() => {
        setQuests(prev => prev.map(q => q.id === id ? { ...q, completed: true } : q))
        toast.success('🎉 Récompense réclamée !')
      })
      .catch(() => {})
  }

  return (
    <div className="kresco-shell kresco-dashboard-grid">

      {/* ── Main column ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Bonjour {firstName} !
            </h1>
            {xpData && <LevelBadge level={xpData.level} xp={xpData.total_xp} />}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            Continue ton parcours Bac marocain là où tu t&apos;es arrêté.
          </p>
        </div>

        {/* XP Progress bar */}
        {xpData && (
          <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Niveau {xpData.level}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {xpData.total_xp - xpData.xp_for_current_level} / {xpData.xp_for_next_level - xpData.xp_for_current_level} XP
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-input)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    width: `${xpData.xp_progress_pct}%`,
                    background: 'linear-gradient(90deg,#453dee,#6366f1)',
                    transition: 'width 600ms ease',
                  }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f97316', fontSize: 13, fontWeight: 700 }}>
                <Flame size={16} />
                <span>{streakDays}j</span>
              </div>
            </div>
          </div>
        )}

        {/* Resume cards */}
        {subjects.length >= 2 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              Reprendre
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
              {subjects.slice(0, 2).map(subject => {
                const { emoji, bg } = getSubjectStyle(subject.title)
                const progress = resumeProgress[subject.id]
                return (
                  <Link key={subject.id} href={`/home/${subject.id}`} style={{ textDecoration: 'none' }}>
                    <div className="card-hover" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                        {emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {subject.title}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {subject.description}
                        </p>
                        <div style={{ height: 5, borderRadius: 99, background: 'var(--surface-input)', overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{
                            height: '100%', borderRadius: 99,
                            width: `${progress?.percentage ?? 0}%`,
                            background: 'linear-gradient(90deg,#453dee,#6366f1)',
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
                          <span>{progress?.completedCount ?? 0}/{progress?.totalCount ?? 0} sections</span>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{progress?.percentage ?? 0}%</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* All subjects */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Matières
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px' }}>
            Choisissez ce que vous voulez étudier
          </p>

          {loading ? (
            <div className="kresco-subject-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card" style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--surface-hover)', margin: '0 auto 10px', animation: 'pulse 1.5s ease infinite' }} />
                  <div style={{ height: 10, borderRadius: 6, background: 'var(--surface-hover)', margin: '0 auto 6px', width: '70%', animation: 'pulse 1.5s ease infinite' }} />
                  <div style={{ height: 8, borderRadius: 6, background: 'var(--surface-hover)', margin: '0 auto', width: '50%', animation: 'pulse 1.5s ease infinite' }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="kresco-subject-grid" style={{ alignItems: 'stretch' }}>
              {subjects.map(subject => {
                const { emoji, bg } = getSubjectStyle(subject.title)
                return (
                  <Link key={subject.id} href={`/home/${subject.id}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
                    <div className="card-hover" style={{ padding: 22, textAlign: 'center', height: '100%', minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ width: 68, height: 68, borderRadius: 18, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 18px' }}>
                        {emoji}
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 5px', lineHeight: 1.25 }}>
                        {subject.title}
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', margin: 0 }}>
                        {subject.lesson_count} leçons Bac
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="kresco-sidebar">

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#edf1ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TimerReset size={17} color="#453dee" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Chrono Bac</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Garde le rythme jusqu&apos;aux examens.</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[
              { value: subjects.length || '-', label: 'Matières' },
              { value: completedQuestCount, label: 'Quêtes' },
              { value: streakDays, label: 'Série' },
              { value: xpData?.level ?? '-', label: 'Niveau' },
            ].map(item => (
              <div key={item.label} style={{ borderRadius: 12, background: 'var(--surface-hover)', padding: '12px 8px', textAlign: 'center' }}>
                <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{item.value}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20, minHeight: 150 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={17} color="#52525c" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Calendrier</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Objectifs de la semaine</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(5,1fr) 28px', gap: 7, alignItems: 'center' }}>
            <button style={{ height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-primary)' }}>‹</button>
            {CALENDAR_DAYS.map(item => {
              const active = item.day === '10'
              return (
                <div key={item.day} style={{ borderRadius: 10, background: active ? 'var(--primary)' : 'var(--surface-hover)', color: active ? '#fff' : 'var(--text-primary)', textAlign: 'center', padding: '8px 4px' }}>
                  <p style={{ fontSize: 14, fontWeight: 900, margin: 0 }}>{item.day}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>{item.label}</p>
                </div>
              )
            })}
            <button style={{ height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--text-primary)' }}>›</button>
          </div>
        </div>

        {/* Streak calendar */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#f97316,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flame size={16} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Série</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>{streakDays} jour{streakDays !== 1 ? 's' : ''} consécutif{streakDays !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {DAYS.map((day, i) => {
              const isActive = activeStreak.includes(i)
              const isToday = i === todayIndex
              return (
                <div key={day} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', margin: '0 auto 3px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                    background: isActive ? 'linear-gradient(135deg,#f97316,#ef4444)' : 'var(--surface-input)',
                    boxShadow: isActive ? '0 2px 6px rgba(249,115,22,0.4)' : 'none',
                  }}>
                    {isActive ? '🔥' : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border)', display: 'block' }} />}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--primary)' : 'var(--text-tertiary)' }}>
                    {day}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Daily quests */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#453dee,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Star size={16} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Quêtes du jour</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                {quests.filter(q => q.completed).length}/{quests.length} complétées
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {quests.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>
                Aucune quête pour aujourd&apos;hui
              </p>
            ) : quests.map(quest => {
              const colors = QUEST_COLORS[quest.quest_type] ?? QUEST_COLORS.complete_lesson
              const pct = quest.target > 0 ? Math.min((quest.progress / quest.target) * 100, 100) : 0
              const canClaim = quest.progress >= quest.target && !quest.completed
              return (
                <div key={quest.id}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                      background: quest.completed ? '#dcfce7' : `linear-gradient(135deg,${colors.from},${colors.to})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {quest.completed
                        ? <CheckCircle2 size={14} color="#16a34a" />
                        : <Zap size={12} color="#fff" />
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: quest.completed ? 'var(--text-tertiary)' : 'var(--text-primary)', margin: '0 0 1px', textDecoration: quest.completed ? 'line-through' : 'none' }}>
                        {quest.title}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                        {quest.progress}/{quest.target} · <span style={{ color: '#f59e0b', fontWeight: 600 }}>+{quest.xp_reward} XP</span>
                      </p>
                    </div>
                    {canClaim && (
                      <button
                        onClick={() => claimQuest(quest.id)}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                          background: `linear-gradient(135deg,${colors.from},${colors.to})`,
                          color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        Réclamer
                      </button>
                    )}
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: 'var(--surface-input)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      width: `${pct}%`,
                      background: quest.completed ? '#16a34a' : `linear-gradient(90deg,${colors.from},${colors.to})`,
                      transition: 'width 400ms ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trophy size={16} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Classement</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>Top étudiants</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaderboard.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>
                Aucun classement disponible
              </p>
            ) : (() => {
              const top5 = leaderboard.slice(0, 5)
              const me = leaderboard.find(e => e.is_current_user)
              const list = [...top5]
              if (me && !top5.find(e => e.user_id === me.user_id)) list.push(me)
              return list.map((entry, idx) => {
                const style = RANK_STYLES[entry.rank - 1]
                const isMe = entry.is_current_user
                const isGap = idx === 5
                return (
                  <div key={entry.rank}>
                    {isGap && (
                      <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, letterSpacing: 2, padding: '2px 0' }}>
                        • • •
                      </div>
                    )}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: isMe ? '8px 10px' : '4px 0',
                      borderRadius: isMe ? 10 : 0,
                      background: isMe ? 'var(--primary-soft)' : 'transparent',
                      border: isMe ? '1px solid rgba(69,61,238,0.2)' : 'none',
                    }}>
                      <div style={{ width: 24, textAlign: 'center', fontSize: style ? 16 : 12, fontWeight: 700, color: style?.color ?? 'var(--text-tertiary)', flexShrink: 0 }}>
                        {style ? style.emoji : entry.rank}
                      </div>
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt={entry.name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} referrerPolicy="no-referrer" />
                      ) : (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>{entry.name?.[0] ?? '?'}</span>
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: isMe ? 'var(--primary)' : 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.name}{isMe ? ' (vous)' : ''}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                          {entry.xp.toLocaleString()} pts
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
          <Link href="/classement" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, padding: '8px 0', borderRadius: 10, background: 'var(--surface-hover)', fontSize: 12, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none', transition: 'background 150ms' }}>
            Voir tout le classement
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}
