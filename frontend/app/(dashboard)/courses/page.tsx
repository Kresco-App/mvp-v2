'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Search, BookOpen, ChevronRight } from 'lucide-react'
import api from '@/lib/axios'
import { findSubjectIcon } from '@/lib/subjects'

function getSubjectStyle(title: string) {
  const s = findSubjectIcon(title)
  return { emoji: s.emoji, bg: s.bg === 'bg-indigo-50' ? '#EEF2FF' : s.bg === 'bg-emerald-50' ? '#F0FDF4' : s.bg === 'bg-orange-50' ? '#FFF7ED' : s.bg === 'bg-purple-50' ? '#FDF4FF' : s.bg === 'bg-teal-50' ? '#ECFDF5' : s.bg === 'bg-amber-50' ? '#FEF3C7' : s.bg === 'bg-rose-50' ? '#FFF1F2' : s.bg === 'bg-blue-50' ? '#EFF6FF' : s.bg === 'bg-violet-50' ? '#F5F3FF' : s.bg === 'bg-green-50' ? '#F0FDF4' : '#F1F5F9' }
}

interface Subject {
  id: number
  title: string
  description: string
  chapter_count: number
  lesson_count: number
}

export default function CoursesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { document.title = 'Matieres \u2014 Kresco' }, [])

  useEffect(() => {
    api.get('/courses/subjects')
      .then(r => setSubjects(r.data))
      .catch(() => toast.error('Erreur de chargement des matieres.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = subjects.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="px-6 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Toutes les matieres</h1>
        <p className="text-slate-500 text-sm mt-1">Parcourez le programme complet du Bac marocain</p>
      </div>

      {/* Search */}
      <div className="relative mb-8 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une matiere..."
          className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-kresco/30 focus:border-kresco transition"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-slate-900 rounded-2xl border border-slate-800 p-6 animate-pulse">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl mb-4" />
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-full mb-1" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(subject => {
            const { emoji, bg } = getSubjectStyle(subject.title)
            return (
              <Link key={subject.id} href={`/home/${subject.id}`}>
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 hover:shadow-md hover:border-kresco/20 hover:-translate-y-0.5 transition-all group cursor-pointer">
                  <div className="flex items-start gap-4 mb-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform"
                      style={{ backgroundColor: bg }}
                    >
                      {emoji}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="font-bold text-white text-sm group-hover:text-kresco transition-colors leading-tight">
                        {subject.title}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-kresco transition-colors flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">{subject.description}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <BookOpen size={11} />
                      {subject.chapter_count} chapitres
                    </span>
                    <span>{subject.lesson_count} lecons</span>
                  </div>
                </div>
              </Link>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-slate-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium">Aucune matiere trouvee pour &quot;{search}&quot;</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
