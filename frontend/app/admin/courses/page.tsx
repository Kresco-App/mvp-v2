'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, ChevronRight, Plus } from 'lucide-react'
import api from '@/lib/axios'
import AuthGuard from '@/components/AuthGuard'

export default function AdminCoursesPage() {
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    api.get('/courses/subjects')
      .then(r => setSubjects(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950">
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-slate-400 hover:text-white transition">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-white font-semibold">Gestion des cours</h1>
          <Link
            href="/admin/courses/new"
            className="ml-auto flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
          >
            <Plus size={13} /> Nouveau cours
          </Link>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8">
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-900 rounded-xl animate-pulse" />)}
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <BookOpen size={32} className="mx-auto mb-3 text-slate-300" />
              <p>Aucun cours trouvé.</p>
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
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={15} className="text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{subj.title}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{subj.niveau} · {subj.filiere}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-400 group-hover:text-slate-400 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
