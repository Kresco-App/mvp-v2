'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ChevronDown, ChevronRight, Plus,
  Video, HelpCircle, Puzzle, FileText, Trash2,
  Edit3, GripVertical, Eye, EyeOff
} from 'lucide-react'
import api from '@/lib/axios'
import AuthGuard from '@/components/AuthGuard'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const SECTION_TYPE_ICON: Record<string, any> = {
  video: Video,
  quiz: HelpCircle,
  activity: Puzzle,
  text: FileText,
}

const SECTION_TYPE_COLOR: Record<string, string> = {
  video: 'text-sky-400',
  quiz: 'text-amber-400',
  activity: 'text-purple-400',
  text: 'text-slate-400',
}

export default function AdminSubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const [subject, setSubject] = useState<any>(null)
  const [chapters, setChapters] = useState<any[]>([])
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set())
  const [sections, setSections] = useState<Record<number, any[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const subjRes = await api.get(`/courses/subjects/${subjectId}`)
        setSubject(subjRes.data)
        setChapters(subjRes.data.chapters ?? [])
      } catch {
        toast.error('Matière introuvable')
        router.push('/admin/courses')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [subjectId])

  async function loadChapterSections(chapterId: number) {
    if (sections[chapterId]) return
    try {
      const res = await api.get(`/courses/chapters/${chapterId}/sections`)
      setSections(prev => ({ ...prev, [chapterId]: res.data }))
    } catch {
      setSections(prev => ({ ...prev, [chapterId]: [] }))
    }
  }

  function toggleChapter(chapterId: number) {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
        loadChapterSections(chapterId)
      }
      return next
    })
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/admin/courses')} className="text-slate-400 hover:text-white transition">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-white font-semibold">{subject?.title}</h1>
            <p className="text-slate-500 text-xs mt-0.5">{subject?.niveau} · {subject?.filiere}</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
          {/* Chapters */}
          {chapters.map(chapter => (
            <div key={chapter.id} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              {/* Chapter header */}
              <button
                onClick={() => toggleChapter(chapter.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/40 transition text-left"
              >
                <GripVertical size={14} className="text-slate-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{chapter.title}</p>
                  <p className="text-slate-500 text-xs mt-0.5">Ordre {chapter.order}</p>
                </div>
                {expandedChapters.has(chapter.id)
                  ? <ChevronDown size={16} className="text-slate-500 flex-shrink-0" />
                  : <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />}
              </button>

              {/* Sections */}
              {expandedChapters.has(chapter.id) && (
                <div className="border-t border-slate-800">
                  {!sections[chapter.id] ? (
                    <div className="flex justify-center py-6">
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : sections[chapter.id].length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-sm">
                      Aucune section dans ce chapitre
                    </div>
                  ) : (
                    sections[chapter.id].map((sec, i) => {
                      const Icon = SECTION_TYPE_ICON[sec.section_type] ?? FileText
                      const color = SECTION_TYPE_COLOR[sec.section_type] ?? 'text-slate-400'
                      return (
                        <div
                          key={sec.id}
                          className={cn(
                            'flex items-center gap-3 px-5 py-3',
                            i < sections[chapter.id].length - 1 && 'border-b border-slate-800/60'
                          )}
                        >
                          <Icon size={14} className={cn(color, 'flex-shrink-0')} />
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-200 text-sm truncate">{sec.title}</p>
                            <p className="text-slate-400 text-xs mt-0.5 capitalize">
                              {sec.section_type}
                              {sec.activity_type && ` · ${sec.activity_type}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {sec.is_free_preview && (
                              <span className="text-[10px] bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">Aperçu</span>
                            )}
                            <Link
                              href={`/watch/${sec.id}`}
                              className="text-slate-400 hover:text-slate-400 transition"
                              title="Prévisualiser"
                            >
                              <Eye size={13} />
                            </Link>
                          </div>
                        </div>
                      )
                    })
                  )}

                  {/* Add section hint */}
                  <div className="px-5 py-3 border-t border-slate-800/60">
                    <p className="text-slate-400 text-xs">
                      Pour ajouter des sections, utilisez l'admin Django → ChapterSection
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {chapters.length === 0 && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center">
              <p className="text-slate-500 text-sm">Aucun chapitre dans cette matière.</p>
            </div>
          )}

          {/* Activity builder shortcut */}
          <div className="bg-slate-900 rounded-2xl border border-indigo-500/20 p-5 flex items-center gap-4">
            <Puzzle size={20} className="text-indigo-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">Créer une activité interactive</p>
              <p className="text-slate-500 text-xs mt-0.5">Générez le JSON pour QCM, V/F, Associations…</p>
            </div>
            <Link
              href="/admin/courses/activities"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
            >
              Ouvrir le builder
            </Link>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
