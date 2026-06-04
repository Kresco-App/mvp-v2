'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ChevronDown, ChevronRight,
  Video, HelpCircle, Puzzle, FileText,
  GripVertical, Eye
} from 'lucide-react'
import { getJson } from '@/lib/apiClient'

import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const ITEM_TYPE_ICON: Record<string, any> = {
  video: Video,
  quiz: HelpCircle,
  activity: Puzzle,
  text: FileText,
}

const ITEM_TYPE_COLOR: Record<string, string> = {
  video: 'text-sky-400',
  quiz: 'text-amber-400',
  activity: 'text-purple-400',
  text: 'text-slate-400',
}

interface TopicItem {
  id: number
  title: string
  item_type: string
  order: number
  is_free_preview?: boolean
}

interface TopicSection {
  id: number
  title: string
  section_type: string
  order: number
  items: TopicItem[]
}

interface Topic {
  id: number
  title: string
  order: number
}

interface TopicWorkspace {
  sections: TopicSection[]
}

export default function AdminSubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const [subject, setSubject] = useState<any>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set())
  const [topicSections, setTopicSections] = useState<Record<number, TopicSection[]>>({})
  const [topicSectionErrors, setTopicSectionErrors] = useState<Record<number, boolean>>({})
  const [loadingTopicIds, setLoadingTopicIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [subjectData, topicsData] = await Promise.all([
          getJson<any>(`/courses/subjects/${subjectId}`),
          getJson<Topic[]>(`/courses/subjects/${subjectId}/topics`),
        ])
        setSubject(subjectData)
        setTopics(Array.isArray(topicsData) ? topicsData : [])
      } catch {
        toast.error('Matière introuvable')
        router.push('/admin/courses')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [subjectId, router])

  const loadTopicSections = useCallback(async (topicId: number) => {
    if (topicSections[topicId] || loadingTopicIds.has(topicId)) return
    setLoadingTopicIds(prev => new Set(prev).add(topicId))
    setTopicSectionErrors(prev => {
      if (!prev[topicId]) return prev
      const next = { ...prev }
      delete next[topicId]
      return next
    })
    try {
      const workspace = await getJson<TopicWorkspace>(`/courses/topics/${topicId}/workspace`)
      setTopicSections(prev => ({ ...prev, [topicId]: workspace.sections ?? [] }))
    } catch {
      toast.error('Impossible de charger les items du topic')
      setTopicSectionErrors(prev => ({ ...prev, [topicId]: true }))
    } finally {
      setLoadingTopicIds(prev => {
        const next = new Set(prev)
        next.delete(topicId)
        return next
      })
    }
  }, [loadingTopicIds, topicSections])

  function toggleTopic(topicId: number) {
    setExpandedTopics(prev => {
      const next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
        void loadTopicSections(topicId)
      }
      return next
    })
  }

  if (loading) {
    return (
      <>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-slate-950">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <button type="button" onClick={() => router.push('/admin/courses')} className="text-slate-400 hover:text-white transition">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-white font-semibold">{subject?.title}</h1>
            <p className="text-slate-500 text-xs mt-0.5">{subject?.niveau} · {subject?.filiere}</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
          {/* Topics */}
          {topics.map(topic => {
            const isExpanded = expandedTopics.has(topic.id)
            const isLoadingTopic = loadingTopicIds.has(topic.id)
            const sections = topicSections[topic.id]
            const hasTopicSectionError = topicSectionErrors[topic.id] === true && !sections
            const items = sections?.flatMap(sec => sec.items ?? []) ?? []

            return (
              <div key={topic.id} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                {/* Topic header */}
                <button type="button"
                  onClick={() => toggleTopic(topic.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/40 transition text-left"
                >
                  <GripVertical size={14} className="text-slate-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{topic.title}</p>
                    <p className="text-slate-500 text-xs mt-0.5">Ordre {topic.order}</p>
                  </div>
                  {isExpanded
                    ? <ChevronDown size={16} className="text-slate-500 flex-shrink-0" />
                    : <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />}
                </button>

                {/* Sections & Items */}
                {isExpanded && (
                  <div className="border-t border-slate-800">
                    {isLoadingTopic ? (
                      <div className="flex justify-center py-6">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : hasTopicSectionError ? (
                      <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-slate-400">
                        <p>Impossible de charger les sections de ce topic.</p>
                        <button
                          type="button"
                          onClick={() => { void loadTopicSections(topic.id) }}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:border-slate-500 hover:bg-slate-800 transition"
                        >
                          Réessayer
                        </button>
                      </div>
                    ) : items.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 text-sm">
                        Aucun item dans ce topic
                      </div>
                    ) : (
                      items.map((item, i, arr) => {
                      const Icon = ITEM_TYPE_ICON[item.item_type] ?? FileText
                      const color = ITEM_TYPE_COLOR[item.item_type] ?? 'text-slate-400'
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-center gap-3 px-5 py-3',
                            i < arr.length - 1 && 'border-b border-slate-800/60'
                          )}
                        >
                          <Icon size={14} className={cn(color, 'flex-shrink-0')} />
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-200 text-sm truncate">{item.title}</p>
                            <p className="text-slate-400 text-xs mt-0.5 capitalize">
                              {item.item_type}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.is_free_preview && (
                              <span className="text-[10px] bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">Aperçu</span>
                            )}
                            <Link
                              href={`/topics/${topic.id}`}
                              className="text-slate-400 hover:text-slate-200 transition"
                              title="Prévisualiser"
                            >
                              <Eye size={13} />
                            </Link>
                          </div>
                        </div>
                      )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {topics.length === 0 && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center">
              <p className="text-slate-500 text-sm">Aucun topic dans cette matière.</p>
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
    </>
  )
}
