'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Search, BookOpen, ChevronRight, CalendarDays, Zap, Trophy } from 'lucide-react'
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
  const [stream, setStream] = useState('2eme-bac')

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
    <div className="kresco-shell kresco-dashboard-grid">
      <div>
        <p className="text-page-tertiary text-xs font-semibold mb-2">2ème Bac / Programme national</p>
        <div className="mb-7">
          <h1 className="text-2xl font-extrabold text-page-primary">Cours Bac marocain</h1>
          <p className="text-page-secondary text-sm mt-1">Choisis une matière, puis avance par chapitres, exercices et examens blancs.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8 max-w-2xl">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search courses"
              className="kresco-control w-full pl-9 pr-4 py-2.5"
            />
          </div>
          <select
            value={stream}
            onChange={e => setStream(e.target.value)}
            className="kresco-control px-3 py-2.5 min-w-[190px]"
          >
            <option value="2eme-bac">2ème Bac</option>
            <option value="1ere-bac">1ère Bac</option>
            <option value="sc-math">Sciences Math</option>
            <option value="sc-pc">Sciences Physiques</option>
            <option value="svt">SVT</option>
          </select>
        </div>

        {loading ? (
          <div className="kresco-lesson-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-32 rounded-xl bg-slate-100 mb-4" />
                <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-full mb-4" />
                <div className="h-9 bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="kresco-lesson-grid">
            {filtered.map((subject, index) => {
              const { emoji, bg } = getSubjectStyle(subject.title)
              const isPriority = index < 2
              return (
                <Link key={subject.id} href={`/home/${subject.id}`} className="block no-underline">
                  <div className="card-hover overflow-hidden group">
                    <div className="relative h-36 bg-[#f4f4f5] flex items-center justify-center">
                      <div className="absolute left-3 top-3 h-7 min-w-7 rounded-md bg-white border border-slate-200 text-xs font-extrabold text-slate-600 flex items-center justify-center px-2">
                        {index + 1}
                      </div>
                      <div
                        className="h-20 w-20 rounded-[22px] flex items-center justify-center text-4xl"
                        style={{ backgroundColor: bg }}
                      >
                        {emoji}
                      </div>
                    </div>
                    <div className={isPriority ? 'bg-[#ff9800] p-4' : 'p-4'}>
                      <p className={`text-sm font-extrabold leading-tight mb-2 ${isPriority ? 'text-white' : 'text-page-primary'}`}>
                        {subject.title}
                      </p>
                      <p className={`text-xs line-clamp-2 mb-4 ${isPriority ? 'text-white/85' : 'text-page-secondary'}`}>
                        {subject.description || 'Programme, exercices et rappels pour cette matière.'}
                      </p>
                      <div className={`flex items-center justify-between text-xs font-semibold ${isPriority ? 'text-white/90' : 'text-page-tertiary'}`}>
                        <span className="inline-flex items-center gap-1">
                          <BookOpen size={12} />
                          {subject.chapter_count} chapitres
                        </span>
                        <span>{subject.lesson_count} leçons</span>
                      </div>
                      <div className={`mt-4 h-9 rounded-xl flex items-center justify-center gap-2 text-xs font-extrabold ${isPriority ? 'bg-[#e98700] text-white' : 'bg-kresco text-white'}`}>
                        Start the course
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-16 text-page-secondary">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-medium">Aucune matière trouvée pour &quot;{search}&quot;</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="kresco-sidebar">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#f4f4f5] flex items-center justify-center">
              <CalendarDays size={17} className="text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-page-primary m-0">Calendar</p>
              <p className="text-xs text-page-secondary m-0">Stay on track this week</p>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
              <div key={day} className={`rounded-xl px-2 py-3 text-center ${i === 2 ? 'bg-kresco text-white' : 'bg-slate-100 text-slate-700'}`}>
                <p className="text-sm font-black m-0">{8 + i}</p>
                <p className="text-xs font-bold m-0">{day}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <Zap size={17} className="text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-page-primary m-0">Daily Quests</p>
              <p className="text-xs text-page-secondary m-0">Start learning now</p>
            </div>
          </div>
          {['Complete 1 lesson', 'Score 80% in a quiz', 'Spend 20 min revising'].map((quest, i) => (
            <div key={quest} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="text-page-primary">{quest}</span>
                <span className={i === 0 ? 'text-orange-500' : 'text-kresco'}>{i === 0 ? '60%' : '20%'}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={i === 0 ? 'h-full bg-orange-500' : 'h-full bg-kresco'} style={{ width: i === 0 ? '60%' : '20%' }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Trophy size={17} className="text-kresco" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-page-primary m-0">Programme</p>
              <p className="text-xs text-page-secondary m-0">{subjects.length} matières disponibles</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
