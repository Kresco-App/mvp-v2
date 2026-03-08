'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
import XPBar from '@/components/XPBar'
import { findSubjectIcon } from '@/lib/subjects'
import { cn } from '@/lib/utils'

function getSubjectStyle(title: string) {
  const s = findSubjectIcon(title)
  return { emoji: s.emoji, bg: s.bg === 'bg-indigo-50' ? '#EEF2FF' : s.bg === 'bg-emerald-50' ? '#F0FDF4' : s.bg === 'bg-orange-50' ? '#FFF7ED' : s.bg === 'bg-purple-50' ? '#FDF4FF' : s.bg === 'bg-teal-50' ? '#ECFDF5' : s.bg === 'bg-amber-50' ? '#FEF3C7' : s.bg === 'bg-rose-50' ? '#FFF1F2' : s.bg === 'bg-blue-50' ? '#EFF6FF' : s.bg === 'bg-violet-50' ? '#F5F3FF' : s.bg === 'bg-green-50' ? '#F0FDF4' : '#F1F5F9' }
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const QUEST_COLORS: Record<string, string> = {
  complete_lesson: '#4D44DB',
  pass_quiz: '#F59E0B',
  earn_xp: '#10B981',
  study_minutes: '#EF4444',
}

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

export default function HomePage() {
  const { user } = useAuthStore()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [quests, setQuests] = useState<Quest[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [streakDays, setStreakDays] = useState(0)
  const [resumeProgress, setResumeProgress] = useState<Record<number, number>>({})

  const firstName = user?.full_name?.split(' ')[0] ?? 'Apprenant'

  // Compute which day indices to light up based on streak
  // Today = current day of week (Mon=0..Sun=6), light up the last streakDays days
  const todayIndex = (new Date().getDay() + 6) % 7 // JS Sunday=0 → we want Mon=0
  const activeStreak: number[] = []
  for (let i = 0; i < Math.min(streakDays, 7); i++) {
    const idx = ((todayIndex - i) + 7) % 7
    activeStreak.push(idx)
  }

  useEffect(() => { document.title = 'Accueil \u2014 Kresco' }, [])

  useEffect(() => {
    api.get('/courses/subjects')
      .then(r => {
        setSubjects(r.data)
        // Fetch progress for the first 2 subjects (resume cards)
        r.data.slice(0, 2).forEach((s: Subject) => {
          api.get(`/progress/subject-plan/${s.id}`)
            .then(planRes => {
              const plan = planRes.data
              const completedIds: number[] = plan.completed_lesson_ids || []
              const totalLessons: number = plan.total_lessons ?? s.lesson_count ?? 1
              const pct = totalLessons > 0 ? Math.round((completedIds.length / totalLessons) * 100) : 0
              setResumeProgress(prev => ({ ...prev, [s.id]: pct }))
            })
            .catch(() => { })
        })
      })
      .catch(() => toast.error('Erreur de chargement des matieres.'))
      .finally(() => setLoading(false))

    api.get('/progress/daily-quests')
      .then(r => setQuests(r.data))
      .catch(e => console.error('Failed to load quests', e))

    api.get('/progress/leaderboard')
      .then(r => {
        const userId = user?.id
        setLeaderboard(r.data.map((e: any) => ({
          rank: e.rank,
          user_id: e.user_id,
          name: e.full_name,
          avatar_url: e.avatar_url || null,
          xp: e.total_xp,
          is_current_user: e.user_id === userId,
        })))
      })
      .catch(e => console.error('Failed to load leaderboard', e))

    api.get('/progress/xp')
      .then(r => setStreakDays(r.data.streak_days ?? 0))
      .catch(e => console.error('Failed to load XP data', e))
  }, [])

  function claimQuest(questId: number) {
    api.post(`/progress/daily-quests/${questId}/claim`)
      .then(() => {
        setQuests(prev => prev.map(q => q.id === questId ? { ...q, completed: true } : q))
        toast.success('Recompense reclamee !')
      })
      .catch(e => console.error('Failed to claim quest', e))
  }

  return (
    <div className="flex gap-6 px-6 py-6">
      {/* Left / Main */}
      <div className="flex-1 min-w-0">

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            Bonjour {firstName} !
          </h1>
          <p className="text-slate-500 text-sm mt-1">Ou en etions-nous la derniere fois ?</p>
        </div>

        {/* Resume cards */}
        {subjects.length >= 2 && (
          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              {subjects.slice(0, 2).map(subject => {
                const { emoji, bg } = getSubjectStyle(subject.title)
                return (
                  <Link key={subject.id} href={`/home/${subject.id}`}>
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 flex items-center gap-4 hover:shadow-md hover:border-kresco/20 transition-all group cursor-pointer">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                        style={{ backgroundColor: bg }}
                      >
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm group-hover:text-kresco transition-colors truncate">
                          {subject.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{subject.description}</p>
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${resumeProgress[subject.id] ?? 0}%`,
                              background: (resumeProgress[subject.id] ?? 0) === 100
                                ? 'linear-gradient(90deg, #10B981 0%, #34D399 100%)'
                                : 'linear-gradient(90deg, #4f46e5 0%, #818cf8 100%)',
                              boxShadow: (resumeProgress[subject.id] ?? 0) === 100 ? '0 0 10px rgba(16,185,129,0.3)' : 'none'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Subjects grid */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Matieres</h2>
          <p className="text-slate-400 text-sm mb-5 -mt-2">Choisissez ce que vous voulez etudier</p>

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="bg-slate-900 rounded-2xl border border-slate-800 p-4 animate-pulse">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl mb-3 mx-auto" />
                  <div className="h-3 bg-slate-100 rounded mx-auto w-3/4 mb-1" />
                  <div className="h-2 bg-slate-100 rounded mx-auto w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
              {subjects.map(subject => {
                const { emoji, bg } = getSubjectStyle(subject.title)
                return (
                  <Link key={subject.id} href={`/home/${subject.id}`}>
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 flex flex-col items-center text-center hover:shadow-md hover:border-kresco/20 hover:-translate-y-0.5 transition-all cursor-pointer group">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition-transform"
                        style={{ backgroundColor: bg }}
                      >
                        {emoji}
                      </div>
                      <p className="font-semibold text-slate-200 text-xs leading-tight mb-1">
                        {subject.title}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {subject.lesson_count} lecons
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="hidden lg:block w-72 flex-shrink-0 space-y-5">

        {/* XP Bar */}
        <XPBar />

        {/* Weekly Strike */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
          <p className="font-bold text-white text-sm mb-0.5">Serie hebdomadaire</p>
          <p className="text-xs text-slate-400 mb-4">Gardez le rythme !</p>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((day, i) => {
              const isActive = activeStreak.includes(i)
              const isToday = i === todayIndex
              return (
                <div key={day} className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all ${isActive
                    ? 'bg-kresco/10 ring-2 ring-kresco/30'
                    : 'bg-slate-100'
                    }`}>
                    {isActive ? '🔥' : '⚪'}
                  </div>
                  <span className={`text-[9px] font-medium ${isToday ? 'text-kresco font-bold' : 'text-slate-400'}`}>
                    {day}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Daily Quests */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
          <p className="font-bold text-white text-sm mb-4">Quetes du jour</p>
          <div className="space-y-4">
            {quests.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">Aucune quete pour aujourd&apos;hui</p>
            )}
            {quests.map((quest) => {
              const color = QUEST_COLORS[quest.quest_type] ?? '#4D44DB'
              const pct = quest.target > 0 ? Math.min((quest.progress / quest.target) * 100, 100) : 0
              const canClaim = quest.progress >= quest.target && !quest.completed
              return (
                <div key={quest.id}>
                  <div className="flex items-start gap-2.5 mb-1.5">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: color + '20', border: `2px solid ${color}` }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-400 leading-tight">{quest.title}</p>
                      <p className="text-[10px] text-slate-400">{quest.progress}/{quest.target} · +{quest.xp_reward} XP</p>
                    </div>
                    {canClaim && (
                      <button
                        onClick={() => claimQuest(quest.id)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        Reclamer
                      </button>
                    )}
                    {quest.completed && (
                      <span className="text-[10px] font-bold text-emerald-500 flex-shrink-0">Fait</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden ml-7">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
          <p className="font-bold text-white text-sm mb-0.5">Classement</p>
          <p className="text-xs text-slate-400 mb-4">Comparez-vous a vos pairs</p>
          <div className="space-y-3">
            {leaderboard.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">Aucun classement disponible</p>
            )}
            {(() => {
              const top5 = leaderboard.slice(0, 5)
              const userEntry = leaderboard.find(e => e.is_current_user)
              const displayList = [...top5]
              if (userEntry && !top5.find(e => e.user_id === userEntry.user_id)) {
                displayList.push(userEntry)
              }

              return displayList.map((entry, idx) => {
                const medal = entry.rank === 1 ? '\u{1F947}' : entry.rank === 2 ? '\u{1F948}' : entry.rank === 3 ? '\u{1F949}' : null
                const isOutOfTop5 = idx === 5 && !top5.find(e => e.user_id === entry.user_id)

                return (
                  <div key={entry.rank} className="space-y-2">
                    {isOutOfTop5 && (
                      <div className="flex justify-center -my-1">
                        <span className="text-slate-600 text-[10px] tracking-widest">• • •</span>
                      </div>
                    )}
                    <div className={cn(
                      'flex items-center gap-3',
                      entry.is_current_user ? 'bg-indigo-500/10 -mx-2 px-2 py-1.5 rounded-xl border border-indigo-500/20' : ''
                    )}>
                      <span className={`text-xs font-bold w-5 text-center ${entry.rank === 1 ? 'text-amber-500' : entry.rank === 2 ? 'text-slate-400' : entry.rank === 3 ? 'text-orange-400' : 'text-slate-500'
                        }`}>
                        {medal ?? `${entry.rank}`}
                      </span>
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt={entry.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-400 text-xs font-bold">{entry.name?.[0] ?? '?'}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate ${entry.is_current_user ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {entry.name}{entry.is_current_user ? ' (vous)' : ''}
                        </p>
                        <p className="text-[10px] text-slate-500">{entry.xp.toLocaleString()} pts</p>
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
          <Link href="/classement" className="mt-4 block w-full py-2 text-center text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
            Voir tout le classement
          </Link>
        </div>
      </div>
    </div>
  )
}
