'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, Users, Puzzle,
  ChevronRight, Plus, Video, FileText
} from 'lucide-react'
import api from '@/lib/axios'
import AuthGuard from '@/components/AuthGuard'

interface Stats {
  subjects: number
  chapters: number
  sections: number
  users: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/courses/subjects').catch(() => ({ data: [] })),
    ]).then(([subjRes]) => {
      const subjs = subjRes.data ?? []
      setSubjects(subjs)
      setStats({
        subjects: subjs.length,
        chapters: subjs.reduce((acc: number, s: any) => acc + (s.chapters?.length ?? 0), 0),
        sections: 0,
        users: 0,
      })
    }).finally(() => setLoading(false))
  }, [])

  const QUICK_ACTIONS = [
    {
      label: 'Nouveau cours',
      desc: 'Créer un sujet, chapitres et sections',
      icon: BookOpen,
      color: 'text-indigo-400',
      bg: 'bg-indigo-600/10 border-indigo-600/20',
      href: '/admin/courses/new',
    },
    {
      label: 'Créateur d\'activités',
      desc: 'MCQ, Glisser-déposer, Vrai/Faux…',
      icon: Puzzle,
      color: 'text-purple-400',
      bg: 'bg-purple-600/10 border-purple-600/20',
      href: '/admin/courses/activities',
    },
    {
      label: 'Gestion des cours',
      desc: 'Modifier les sections existantes',
      icon: Video,
      color: 'text-sky-400',
      bg: 'bg-sky-600/10 border-sky-600/20',
      href: '/admin/courses',
    },
  ]

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-8 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-white text-xl font-bold">Tableau de bord</h1>
              <p className="text-slate-400 text-sm mt-0.5">Espace enseignant · Kresco</p>
            </div>
            <Link href="/home" className="text-slate-400 hover:text-white text-sm transition">
              ← Retour à la plateforme
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Matières', value: stats?.subjects ?? '—', icon: BookOpen, color: 'text-indigo-400' },
              { label: 'Chapitres', value: stats?.chapters ?? '—', icon: FileText, color: 'text-purple-400' },
              { label: 'Sections', value: stats?.sections ?? '—', icon: Video, color: 'text-sky-400' },
              { label: 'Étudiants', value: stats?.users ?? '—', icon: Users, color: 'text-green-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                <s.icon size={20} className={`${s.color} mb-3`} />
                <p className="text-white text-2xl font-bold">{loading ? '…' : s.value}</p>
                <p className="text-slate-500 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div>
            <h2 className="text-white font-semibold mb-4">Actions rapides</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {QUICK_ACTIONS.map(action => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`bg-slate-900 border ${action.bg} rounded-2xl p-6 hover:bg-slate-800/60 transition group`}
                >
                  <action.icon size={22} className={`${action.color} mb-3`} />
                  <p className="text-white font-semibold mb-1">{action.label}</p>
                  <p className="text-slate-500 text-xs">{action.desc}</p>
                  <ChevronRight size={14} className="text-slate-400 group-hover:text-slate-400 mt-3 transition" />
                </Link>
              ))}
            </div>
          </div>

          {/* Subject list */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Matières publiées</h2>
              <Link
                href="/admin/courses/new"
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                <Plus size={13} /> Nouvelle matière
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-900 rounded-xl animate-pulse" />)}
              </div>
            ) : subjects.length === 0 ? (
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center">
                <BookOpen size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aucune matière. Créez votre premier cours !</p>
                <Link
                  href="/admin/courses/new"
                  className="mt-4 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
                >
                  <Plus size={14} /> Créer un cours
                </Link>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                {subjects.map((subj, i) => (
                  <Link
                    key={subj.id}
                    href={`/admin/courses/${subj.id}`}
                    className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-800/50 transition group ${
                      i < subjects.length - 1 ? 'border-b border-slate-800' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                      <BookOpen size={16} className="text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{subj.title}</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {subj.chapters?.length ?? 0} chapitres
                      </p>
                    </div>
                    <ChevronRight size={15} className="text-slate-400 group-hover:text-slate-400 transition flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
