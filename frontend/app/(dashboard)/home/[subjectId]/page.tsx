'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, BookOpen, Play, CheckCircle2,
  FileText, Clock, Lock, ChevronDown, ChevronRight,
  ClipboardCheck, HelpCircle, Puzzle
} from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/lib/store'
import { formatDuration } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Section {
  id: number
  title: string
  section_type: 'video' | 'quiz' | 'activity' | 'text'
  activity_type?: string
  order: number
  duration_seconds?: number
  is_free_preview?: boolean
  is_completed?: boolean
  is_locked?: boolean
}

interface Chapter {
  id: number
  title: string
  order: number
  lessons: any[]
  blocks: any[]
}

interface Subject {
  id: number
  title: string
  description: string
  thumbnail_url: string
  chapters: Chapter[]
}

function getSectionIcon(section: Section) {
  if (section.is_completed) return <CheckCircle2 size={16} className="text-green-500" />
  if (section.is_locked) return <Lock size={14} className="text-slate-400" />
  switch (section.section_type) {
    case 'video': return <Play size={14} className="text-indigo-500 fill-indigo-500" />
    case 'quiz': return <HelpCircle size={14} className="text-amber-500" />
    case 'activity': return <Puzzle size={14} className="text-purple-500" />
    case 'text': return <FileText size={14} className="text-sky-500" />
    default: return <Play size={14} className="text-slate-400" />
  }
}

function getSectionTypeLabel(section: Section) {
  switch (section.section_type) {
    case 'video': return 'Video'
    case 'quiz': return 'Quiz'
    case 'activity': return 'Activite'
    case 'text': return 'Lecture'
    default: return ''
  }
}

function getSectionBgColor(section: Section) {
  if (section.is_completed) return 'bg-green-50'
  if (section.is_locked) return 'bg-slate-950'
  switch (section.section_type) {
    case 'video': return 'bg-indigo-50'
    case 'quiz': return 'bg-amber-50'
    case 'activity': return 'bg-purple-50'
    case 'text': return 'bg-sky-50'
    default: return 'bg-slate-950'
  }
}

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [subject, setSubject] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set())
  const [chapterSections, setChapterSections] = useState<Record<number, Section[]>>({})

  useEffect(() => {
    async function load() {
      try {
        const subjectRes = await api.get(`/courses/subjects/${subjectId}`)
        setSubject(subjectRes.data)

        // Expand first chapter by default
        if (subjectRes.data.chapters.length > 0) {
          setExpandedChapters(new Set([subjectRes.data.chapters[0].id]))
        }

        // Fetch sections for all chapters
        const sectionsMap: Record<number, Section[]> = {}
        await Promise.all(
          subjectRes.data.chapters.map(async (chapter: Chapter) => {
            try {
              const res = await api.get(`/courses/chapters/${chapter.id}/sections`)
              sectionsMap[chapter.id] = res.data
            } catch {
              sectionsMap[chapter.id] = []
            }
          })
        )
        setChapterSections(sectionsMap)
      } catch {
        toast.error('Erreur de chargement de la matiere.')
        router.push('/home')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [subjectId])

  function toggleChapter(id: number) {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!subject) return null

  // Calculate progress from sections
  const allSections = Object.values(chapterSections).flat()
  const totalSections = allSections.length
  const completedCount = allSections.filter(s => s.is_completed).length
  const progress = totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0

  // Find first incomplete section for "Continue" button
  const nextSection = allSections.find(s => !s.is_completed && !s.is_locked)

  return (
    <div className="p-8 md:p-12 max-w-4xl">
      <Link href="/home" className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft size={16} />
        Retour aux matieres
      </Link>

      {/* Hero */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm p-8 mb-8">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <BookOpen size={28} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white mb-2">{subject.title}</h1>
            <p className="text-slate-500 mb-5 leading-relaxed">{subject.description}</p>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-slate-400 w-10 text-right">{progress}%</span>
            </div>
            <p className="text-xs text-slate-400">{completedCount} sur {totalSections} sections terminees</p>
          </div>
        </div>

        {nextSection && (
          <div className="mt-6 pt-6 border-t border-slate-800">
            <Link
              href={`/watch/${nextSection.id}`}
              className="inline-flex items-center gap-2 bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <Play size={15} className="fill-current" />
              {completedCount === 0 ? 'Commencer' : 'Continuer'}
            </Link>
          </div>
        )}
      </div>

      {/* Exam link */}
      <Link href={`/exam/${subjectId}`} className="mt-6 mb-8 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition">
        <ClipboardCheck size={18} />
        Passer l&apos;examen blanc
      </Link>

      {/* Curriculum - Section-based path */}
      <h2 className="text-xl font-bold text-white mb-4">Programme</h2>
      <div className="space-y-3">
        {subject.chapters.map((chapter, idx) => {
          const isExpanded = expandedChapters.has(chapter.id)
          const sections = chapterSections[chapter.id] || []
          const chapterCompleted = sections.length > 0 && sections.every(s => s.is_completed)
          const chapterCompletedCount = sections.filter(s => s.is_completed).length

          return (
            <div key={chapter.id}>
              <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleChapter(chapter.id)}
                  className="w-full flex items-center gap-4 p-5 hover:bg-slate-950 transition-colors text-left"
                >
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    chapterCompleted ? 'bg-green-500 text-white' : 'bg-slate-800 text-slate-500' // updated light class
                  )}>
                    {chapterCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">{chapter.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {sections.length} sections {sections.length > 0 && `· ${chapterCompletedCount}/${sections.length} terminees`}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-800">
                    {sections.length === 0 ? (
                      <div className="px-5 py-6 text-center">
                        <p className="text-sm text-slate-400">Aucune section disponible pour ce chapitre.</p>
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Vertical line connecting sections */}
                        <div className="absolute left-[2.35rem] top-0 bottom-0 w-0.5 bg-slate-800" />

                        {sections.map((section, sIdx) => {
                          const canAccess = !section.is_locked
                          let href = '#'
                          if (canAccess) {
                            href = `/watch/${section.id}`
                          }

                          return (
                            <Link
                              key={section.id}
                              href={href}
                              onClick={(e) => {
                                if (!canAccess) {
                                  e.preventDefault()
                                  toast.info('Terminez les sections precedentes pour debloquer celle-ci.')
                                }
                              }}
                              className={cn(
                                'flex items-center gap-3 px-5 py-3.5 transition-colors border-b border-slate-800 last:border-0 relative',
                                canAccess ? 'hover:bg-slate-950 cursor-pointer' : 'opacity-60 cursor-not-allowed',
                                section.is_completed && 'bg-green-900/20'
                              )}
                            >
                              {/* Section node */}
                              <div className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2',
                                section.is_completed
                                  ? 'bg-green-900 border-green-500'
                                  : section.is_locked
                                    ? 'bg-slate-800 border-slate-700'
                                    : 'bg-slate-900 border-slate-700'
                              )}>
                                {getSectionIcon(section)}
                              </div>

                              {/* Section info */}
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  'text-sm font-medium',
                                  section.is_completed ? 'text-green-400' : section.is_locked ? 'text-slate-500' : 'text-slate-300'
                                )}>
                                  {section.title}
                                </p>
                                <p className={cn(
                                  'text-xs mt-0.5',
                                  section.is_completed ? 'text-green-500/70' : 'text-slate-500'
                                )}>
                                  {getSectionTypeLabel(section)}
                                  {section.duration_seconds && section.duration_seconds > 0 && ` · ${formatDuration(section.duration_seconds)}`}
                                </p>
                              </div>

                              {/* Status badge */}
                              {section.is_completed && (
                                <span className="text-xs text-green-400 font-medium bg-green-900/30 px-2 py-0.5 rounded-full border border-green-500/20">Termine</span>
                              )}
                              {section.is_locked && (
                                <Lock size={14} className="text-slate-500 flex-shrink-0" />
                              )}
                              {!section.is_completed && !section.is_locked && section.is_free_preview && (
                                <span className="text-xs text-indigo-400 font-medium bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-500/20">Gratuit</span>
                              )}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Exam Blanc Placeholder between chapters */}
              {idx % 2 === 1 && idx !== subject.chapters.length - 1 && (
                <div className="flex justify-center py-6">
                  <Link href={`/exam/${subjectId}?chapter=${chapter.id}`} className="group inline-flex items-center gap-3 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 transition-all rounded-2xl border border-dashed border-slate-700 hover:border-indigo-500/50">
                    <ClipboardCheck size={20} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <p className="text-slate-200 font-semibold text-sm">Examen Blanc d'étape</p>
                      <p className="text-slate-500 text-xs mt-0.5">Testez vos connaissances sur ces chapitres</p>
                    </div>
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
