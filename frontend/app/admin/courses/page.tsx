'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, ChevronRight, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { apiDataErrorMessage } from '@/lib/apiData'
import { useAdminSubjectsData } from '@/lib/courseDiscoveryData'

export default function AdminCoursesPage() {
  const { subjects, loading, error, retry } = useAdminSubjectsData()
  const lastErrorToastRef = useRef('')
  const router = useRouter()
  const errorMessage = error ? apiDataErrorMessage(error, 'Impossible de charger les cours.') : ''

  useEffect(() => {
    if (!errorMessage) {
      lastErrorToastRef.current = ''
      return
    }
    if (errorMessage === lastErrorToastRef.current) return
    lastErrorToastRef.current = errorMessage
    toast.error(errorMessage)
  }, [errorMessage])

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-4">
        <button type="button" onClick={() => router.push('/admin')} className="text-slate-400 transition hover:text-white" aria-label="Retour a l'administration">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-semibold text-white">Gestion des cours</h1>
        <Link
          href="/admin/courses/new"
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus size={13} /> Nouveau cours
        </Link>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-900" />
            ))}
          </div>
        ) : errorMessage && subjects.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => void retry()}
              className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-50 hover:bg-red-500/20"
            >
              <RotateCcw size={14} />
              Reessayer
            </button>
          </div>
        ) : subjects.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <BookOpen size={32} className="mx-auto mb-3 text-slate-300" />
            <p>Aucun cours trouve.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {subjects.map((subject, index) => (
              <Link
                key={subject.id}
                href={`/admin/courses/${subject.id}`}
                className={`group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-800/50 ${
                  index < subjects.length - 1 ? 'border-b border-slate-800' : ''
                }`}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600/20">
                  <BookOpen size={15} className="text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{subject.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {Number(subject.chapter_count ?? 0)} topics / {Number(subject.lesson_count ?? 0)} items
                  </p>
                </div>
                <ChevronRight size={14} className="flex-shrink-0 text-slate-400 group-hover:text-slate-400" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
