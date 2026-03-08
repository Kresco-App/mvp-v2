'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Clock, CheckSquare, Flame, Crown } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'

interface ProfileStats {
  hours_watched: number
  quizzes_passed: number
  lessons_completed: number
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [stats, setStats] = useState<ProfileStats>({ hours_watched: 0, quizzes_passed: 0, lessons_completed: 0 })
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.full_name ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = 'Mon Profil \u2014 Kresco' }, [])

  useEffect(() => {
    api.get('/progress/stats')
      .then(({ data }) => {
        setStats({
          hours_watched: data.hours_watched ?? 0,
          quizzes_passed: data.quizzes_passed ?? 0,
          lessons_completed: data.lessons_completed ?? 0,
        })
      })
      .catch(e => console.error('Failed to load stats', e))
  }, [])

  async function handleSave() {
    if (!name.trim()) return toast.error('Le nom ne peut pas etre vide.')
    setSaving(true)
    try {
      const { data } = await api.patch('/profile/me', { full_name: name.trim() })
      updateUser({ full_name: data.full_name })
      setEditing(false)
      toast.success('Profil mis a jour !')
    } catch {
      toast.error('Erreur lors de la mise a jour du profil.')
    } finally {
      setSaving(false)
    }
  }

  const KPI_CARDS = [
    {
      icon: Clock,
      color: 'bg-indigo-50 text-indigo-600',
      value: stats.hours_watched,
      unit: 'hrs',
      label: 'Heures de visionnage',
    },
    {
      icon: CheckSquare,
      color: 'bg-green-50 text-green-600',
      value: stats.quizzes_passed,
      unit: '',
      label: 'Quiz reussis',
    },
    {
      icon: Flame,
      color: 'bg-orange-50 text-orange-600',
      value: stats.lessons_completed,
      unit: '',
      label: 'Lecons terminees',
    },
    {
      icon: Crown,
      color: user?.is_pro ? 'bg-amber-50 text-amber-600' : 'bg-slate-950 text-slate-400',
      value: user?.is_pro ? 'Pro' : 'Gratuit',
      unit: '',
      label: 'Abonnement',
    },
  ]

  return (
    <div className="p-8 md:p-12 max-w-3xl">
      <h1 className="text-3xl font-bold text-white mb-2">Mon Profil</h1>
      <p className="text-slate-500 mb-10">Gerez votre compte et suivez votre parcours d&apos;apprentissage.</p>

      {/* Avatar + name */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm p-8 mb-6">
        <div className="flex items-start gap-6">
          <div className="relative">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="w-20 h-20 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <span className="text-3xl font-bold text-indigo-600">{user?.full_name?.[0]}</span>
              </div>
            )}
          </div>

          <div className="flex-1">
            {editing ? (
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="flex-1 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-black text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button
                  onClick={() => { setEditing(false); setName(user?.full_name ?? '') }}
                  className="text-slate-500 text-sm px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-white">{user?.full_name}</h2>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-indigo-600 font-medium hover:underline"
                >
                  Modifier
                </button>
              </div>
            )}
            <p className="text-slate-500 text-sm mb-3">{user?.email}</p>
            {user?.is_pro && (
              <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full border border-amber-200">
                <Crown size={11} />
                Membre Pro
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <h3 className="text-lg font-bold text-white mb-4">Vos statistiques</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {KPI_CARDS.map(({ icon: Icon, color, value, unit, label }) => (
          <div key={label} className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm p-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon size={18} />
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {value}{unit}
            </div>
            <div className="text-xs text-slate-400 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Upgrade card */}
      {!user?.is_pro && (
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white">
          <Crown size={24} className="mb-3 text-indigo-200" />
          <h3 className="text-lg font-bold mb-2">Passer a Pro</h3>
          <p className="text-indigo-200 text-sm mb-5 leading-relaxed">
            Acces illimite a tous les cours et quiz.
          </p>
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 bg-slate-900 text-indigo-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors"
          >
            Voir les offres
          </a>
        </div>
      )}
    </div>
  )
}
