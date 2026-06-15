'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ChevronDown, ChevronRight,
  Video, HelpCircle, Puzzle, FileText,
  GripVertical, Eye,
} from 'lucide-react'
import { toast } from 'sonner'

import { getJson } from '@/lib/apiClient'
import { cn } from '@/lib/utils'

const ITEM_TYPE_ICON: Record<string, typeof Video> = {
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

interface SubjectDetail {
  id: number
  title: string
  description?: string
}

export default function AdminSubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const [subject, setSubject] = useState<SubjectDetail | null>(null)
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
          getJson<SubjectDetail>(`/courses/subjects/${subjectId}`),
          getJson<Topic[]>(`/courses/subjects/${subjectId}/topics`),
        ])
        setSubject(subjectData)
        setTopics(Array.isArray(topicsData) ? topicsData : [])
      } catch {
        toast.error('Matiere introuvable')
        router.push('/admin/courses')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [subjectId, router])

  const loadTopicSections = useCallback(async (topicId: number) => {
    if (topicSections[topicId] || loadingTopicIds.has(topicId)) return
    setLoadingTopicIds((previous) => new Set(previous).add(topicId))
    setTopicSectionErrors((previous) => {
      if (!previous[topicId]) return previous
      const next = { ...previous }
      delete next[topicId]
      return next
    })
    try {
      const workspace = await getJson<TopicWorkspace>(`/courses/topics/${topicId}/workspace`)
      setTopicSections((previous) => ({ ...previous, [topicId]: workspace.sections ?? [] }))
    } catch {
      toast.error('Impossible de charger les items du topic')
      setTopicSectionErrors((previous) => ({ ...previous, [topicId]: true }))
    } finally {
      setLoadingTopicIds((previous) => {
        const next = new Set(previous)
        next.delete(topicId)
        return next
      })
    }
  }, [loadingTopicIds, topicSections])

  function toggleTopic(topicId: number) {
    setExpandedTopics((previous) => {
      const next = new Set(previous)
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-4">
        <button type="button" onClick={() => router.push('/admin/courses')} className="text-slate-400 transition hover:text-white" aria-label="Retour aux cours">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-semibold text-white">{subject?.title}</h1>
          {subject?.description && <p className="mt-0.5 text-xs text-slate-500">{subject.description}</p>}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        {topics.map((topic) => {
          const isExpanded = expandedTopics.has(topic.id)
          const isLoadingTopic = loadingTopicIds.has(topic.id)
          const sections = topicSections[topic.id]
          const hasTopicSectionError = topicSectionErrors[topic.id] === true && !sections
          const items = sections?.flatMap((section) => section.items ?? []) ?? []

          return (
            <div key={topic.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <button
                type="button"
                onClick={() => toggleTopic(topic.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-800/40"
              >
                <GripVertical size={14} className="flex-shrink-0 text-slate-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{topic.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Ordre {topic.order}</p>
                </div>
                {isExpanded
                  ? <ChevronDown size={16} className="flex-shrink-0 text-slate-500" />
                  : <ChevronRight size={16} className="flex-shrink-0 text-slate-500" />}
              </button>

              {isExpanded && (
                <div className="border-t border-slate-800">
                  {isLoadingTopic ? (
                    <div className="flex justify-center py-6">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                    </div>
                  ) : hasTopicSectionError ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-slate-400">
                      <p>Impossible de charger les sections de ce topic.</p>
                      <button
                        type="button"
                        onClick={() => { void loadTopicSections(topic.id) }}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800"
                      >
                        Reessayer
                      </button>
                    </div>
                  ) : items.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-400">Aucun item dans ce topic</div>
                  ) : (
                    items.map((item, index, list) => {
                      const Icon = ITEM_TYPE_ICON[item.item_type] ?? FileText
                      const color = ITEM_TYPE_COLOR[item.item_type] ?? 'text-slate-400'
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-center gap-3 px-5 py-3',
                            index < list.length - 1 && 'border-b border-slate-800/60',
                          )}
                        >
                          <Icon size={14} className={cn(color, 'flex-shrink-0')} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-slate-200">{item.title}</p>
                            <p className="mt-0.5 text-xs capitalize text-slate-400">{item.item_type}</p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            {item.is_free_preview && (
                              <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-[10px] text-green-400">Apercu</span>
                            )}
                            <Link href={`/topics/${topic.id}`} className="text-slate-400 transition hover:text-slate-200" title="Previsualiser" aria-label={`Previsualiser ${item.title}`}>
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
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-sm text-slate-500">Aucun topic dans cette matiere.</p>
          </div>
        )}

        <div className="flex items-center gap-4 rounded-2xl border border-indigo-500/20 bg-slate-900 p-5">
          <Puzzle size={20} className="flex-shrink-0 text-indigo-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Creer une activite interactive</p>
            <p className="mt-0.5 text-xs text-slate-500">Generez le JSON pour QCM, V/F, Associations...</p>
          </div>
          <Link href="/admin/courses/activities" className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700">
            Ouvrir le builder
          </Link>
        </div>
      </div>
    </div>
  )
}
