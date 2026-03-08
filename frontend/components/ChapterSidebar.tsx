'use client'

import Link from 'next/link'
import {
  CheckCircle2, Play, Lock, FileText,
  ChevronDown, ChevronRight, HelpCircle, Puzzle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/utils'
import { useState, useEffect } from 'react'
import api from '@/lib/axios'

interface Section {
  id: number
  title: string
  section_type: 'video' | 'quiz' | 'activity' | 'text'
  order: number
  duration_seconds?: number
  is_completed?: boolean
  is_locked?: boolean
}

interface ChapterInfo {
  id: number
  title: string
  subject_id: number
  subject_title: string
}

interface Props {
  chapters: any[]
  currentSectionId: number
  chapterInfo: ChapterInfo
}

function getSectionIcon(section: Section, isCurrent: boolean) {
  if (section.is_completed) return <CheckCircle2 size={12} className="text-green-400" />
  if (section.is_locked) return <Lock size={9} className="text-slate-400" />
  switch (section.section_type) {
    case 'video':
      return <Play size={9} className={isCurrent ? 'text-indigo-400 fill-indigo-400' : 'text-slate-500 fill-slate-500'} />
    case 'quiz':
      return <HelpCircle size={10} className={isCurrent ? 'text-amber-400' : 'text-slate-500'} />
    case 'activity':
      return <Puzzle size={10} className={isCurrent ? 'text-purple-400' : 'text-slate-500'} />
    case 'text':
      return <FileText size={10} className={isCurrent ? 'text-sky-400' : 'text-slate-500'} />
    default:
      return <Play size={9} className="text-slate-500" />
  }
}

function getSectionTypeLabel(type: string) {
  switch (type) {
    case 'video': return 'Video'
    case 'quiz': return 'Quiz'
    case 'activity': return 'Activite'
    case 'text': return 'Lecture'
    default: return ''
  }
}

export default function ChapterSidebar({ chapters, currentSectionId, chapterInfo }: Props) {
  const [chapterSections, setChapterSections] = useState<Record<number, Section[]>>({})
  const [expanded, setExpanded] = useState<Set<unknown>>(() => {
    // Auto-expand the current chapter
    return new Set([chapterInfo.id])
  })

  useEffect(() => {
    async function loadSections() {
      const sectionsMap: Record<number, Section[]> = {}
      await Promise.all(
        chapters.map(async (chapter: any) => {
          try {
            const res = await api.get(`/courses/chapters/${chapter.id}/sections`)
            sectionsMap[chapter.id] = res.data
          } catch {
            sectionsMap[chapter.id] = []
          }
        })
      )
      setChapterSections(sectionsMap)
    }
    loadSections()
  }, [chapters])

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const totalSections = Object.values(chapterSections).flat().length
  const completedSections = Object.values(chapterSections).flat().filter(s => s.is_completed).length

  const progressPct = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0

  return (
    <div className="bg-slate-900 h-full overflow-y-auto">
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-white font-bold text-sm">Contenu du cours</h3>
        <div className="flex items-center justify-between mt-2 mb-1.5">
          <p className="text-slate-500 text-xs">
            {completedSections} / {totalSections} terminée(s)
          </p>
          <p className="text-xs font-semibold text-indigo-400">{progressPct}%</p>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPct}%`,
              background: progressPct === 100
                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                : 'linear-gradient(90deg, #6366f1, #818cf8)',
            }}
          />
        </div>
      </div>

      <div className="divide-y divide-slate-800">
        {chapters.map((chapter: any, idx: number) => {
          const isExpanded = expanded.has(chapter.id)
          const sections = chapterSections[chapter.id] || []
          const chapterDone = sections.length > 0 && sections.every(s => s.is_completed)

          return (
            <div key={chapter.id}>
              <button
                onClick={() => toggle(chapter.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-800/50 transition-colors text-left"
              >
                <span className={cn(
                  'text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                  chapterDone ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
                )}>
                  {chapterDone ? <CheckCircle2 size={12} /> : idx + 1}
                </span>
                <span className="flex-1 text-slate-200 text-sm font-medium truncate">
                  {chapter.title}
                </span>
                {isExpanded
                  ? <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
                  : <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                }
              </button>

              {isExpanded && (
                <div className="bg-slate-950/30">
                  {sections.length === 0 ? (
                    <div className="px-5 py-4">
                      <p className="text-slate-400 text-xs">Chargement...</p>
                    </div>
                  ) : (
                    sections.map((section: Section) => {
                      const done = section.is_completed
                      const current = section.id === currentSectionId
                      const locked = section.is_locked
                      const canAccess = !locked

                      return (
                        <Link
                          key={section.id}
                          href={canAccess ? `/watch/${section.id}` : '#'}
                          onClick={(e) => {
                            if (!canAccess) e.preventDefault()
                          }}
                          className={cn(
                            'flex items-center gap-3 px-5 py-3 border-b border-slate-800/50 last:border-0 transition-colors',
                            current
                              ? 'bg-indigo-600/20 border-l-2 border-l-indigo-500'
                              : locked
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-slate-800/40'
                          )}
                        >
                          <div className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                            done ? 'bg-green-500/20' : current ? 'bg-indigo-600/30' : 'bg-slate-800'
                          )}>
                            {getSectionIcon(section, current)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={cn(
                              'block text-xs leading-relaxed truncate',
                              current ? 'text-indigo-300 font-semibold' : done ? 'text-slate-500' : 'text-slate-300'
                            )}>
                              {section.title}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {getSectionTypeLabel(section.section_type)}
                            </span>
                          </div>
                          {section.duration_seconds && section.duration_seconds > 0 && (
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              {formatDuration(section.duration_seconds)}
                            </span>
                          )}
                        </Link>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
