'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Eye,
  FileCode2,
  FileText,
  GripVertical,
  HelpCircle,
  Loader2,
  Puzzle,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AdminPageHeader,
  adminButtonClass,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
} from '@/components/admin/AdminDesign'
import { getJson } from '@/lib/apiClient'
import { cn } from '@/lib/utils'

const card = adminPanelClass

const ITEM_TYPE_ICON: Record<string, typeof Video> = {
  video: Video,
  quiz: HelpCircle,
  activity: Puzzle,
  text: FileText,
}

const ITEM_TYPE_COLOR: Record<string, string> = {
  video: 'text-[#0284c7]',
  quiz: 'text-[#f5900b]',
  activity: 'text-[#7c3aed]',
  text: 'text-[#71717b]',
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  video: 'Vidéo',
  quiz: 'Quiz',
  activity: 'Activité',
  text: 'Texte',
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

  const loadedItems = Object.values(topicSections).reduce(
    (sum, sections) => sum + sections.reduce((sectionSum, section) => sectionSum + (section.items?.length ?? 0), 0),
    0,
  )
  const contentStats = useMemo(() => {
    const loadedTopicCount = Object.keys(topicSections).length
    const loadedSections = Object.values(topicSections).reduce((sum, sections) => sum + sections.length, 0)
    const allItems = Object.values(topicSections).flatMap((sections) => sections.flatMap((section) => section.items ?? []))
    const freePreviewItems = allItems.filter((item) => item.is_free_preview).length
    const itemTypeCounts = allItems.reduce<Record<string, number>>((counts, item) => {
      counts[item.item_type] = (counts[item.item_type] ?? 0) + 1
      return counts
    }, {})
    const itemTypeEntries = Object.entries(itemTypeCounts).sort((a, b) => b[1] - a[1])
    const topicErrorCount = Object.values(topicSectionErrors).filter(Boolean).length
    const loadedTopicCoverage = topics.length ? Math.round((loadedTopicCount / topics.length) * 100) : 0

    return {
      allItems,
      freePreviewItems,
      itemTypeEntries,
      loadedSections,
      loadedTopicCount,
      loadedTopicCoverage,
      topicErrorCount,
    }
  }, [topicSectionErrors, topicSections, topics.length])

  const itemMixSummary = contentStats.itemTypeEntries
    .map(([type, count]) => `${ITEM_TYPE_LABELS[type] ?? type}: ${count}`)
    .join(' · ')
  const dominantItemType = contentStats.itemTypeEntries[0]?.[0]
  const dominantItemLabel = dominantItemType ? (ITEM_TYPE_LABELS[dominantItemType] ?? dominantItemType) : 'Aucun'

  if (loading) {
    return (
      <main className={adminPageClass}>
        <div className="flex min-h-[360px] items-center justify-center">
          <div className="flex items-center gap-2 text-[13px] font-black text-[#71717b]">
            <Loader2 size={16} className="animate-spin text-[#5b60f9]" />
            Chargement du cours...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={BookOpen}
        eyebrow="Admin / Cours"
        title={subject?.title ?? 'Cours'}
        description={subject?.description ?? 'Inspectez la couverture, les sections et les items avant edition.'}
        action={(
          <>
            <Link href="/admin/courses" className={`${adminButtonClass} no-underline`}>
              Cours
            </Link>
            <Link href="/admin/courses/activities" className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#5b60f9] px-4 text-[13px] font-black text-white no-underline transition hover:bg-[#4b50e8]">
              <Puzzle size={15} /> Builder activite
            </Link>
          </>
        )}
      />

      <section className={adminMetricStripClass}>
        <StatTile label="Topics" value={String(topics.length)} hint={`${contentStats.loadedTopicCount} chargés (${contentStats.loadedTopicCoverage}%)`} />
        <StatTile
          label="Sections"
          value={String(contentStats.loadedSections)}
          hint={contentStats.topicErrorCount ? `${contentStats.topicErrorCount} erreur de chargement` : `${expandedTopics.size} topic(s) ouverts`}
          tone={contentStats.topicErrorCount ? 'warn' : 'default'}
        />
        <StatTile label="Items chargés" value={String(loadedItems)} hint={`${contentStats.freePreviewItems} aperçu gratuit`} />
        <StatTile label="Mix principal" value={dominantItemLabel} hint={itemMixSummary || 'Développez un topic'} />
      </section>

      <section className={`${card} mb-5 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-[15px] font-black text-[#3f3f46]">Carte de contenu</h2>
            <p className="m-0 mt-1 text-[12.5px] font-semibold text-[#a1a1aa]">
              {contentStats.loadedTopicCount}/{topics.length} topics inspectés · {contentStats.loadedSections} sections · {loadedItems} items
            </p>
          </div>
          {contentStats.topicErrorCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff7ed] px-3 py-1.5 text-[12px] font-black text-[#c2410c]">
              <AlertTriangle size={13} />
              {contentStats.topicErrorCount} topic(s) à recharger
            </span>
          )}
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#f4f4f5]">
          <div className="h-full rounded-full bg-[#5b60f9]" style={{ width: `${contentStats.loadedTopicCoverage}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {contentStats.itemTypeEntries.length ? (
            contentStats.itemTypeEntries.map(([type, count]) => (
              <span key={type} className="rounded-full bg-[#fbfbfc] px-3 py-1.5 text-[12px] font-black text-[#52525c]">
                {ITEM_TYPE_LABELS[type] ?? type}: {count}
              </span>
            ))
          ) : (
            <span className="text-[12.5px] font-semibold text-[#a1a1aa]">Développez un topic pour voir la répartition des items.</span>
          )}
        </div>
      </section>

      <section className="space-y-3">
        {topics.map((topic) => {
          const isExpanded = expandedTopics.has(topic.id)
          const isLoadingTopic = loadingTopicIds.has(topic.id)
          const sections = topicSections[topic.id]
          const hasTopicSectionError = topicSectionErrors[topic.id] === true && !sections
          const items = sections?.flatMap((section) => section.items ?? []) ?? []

          return (
            <article key={topic.id} className={`${card} overflow-hidden`}>
              <button
                type="button"
                onClick={() => toggleTopic(topic.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[#fbfbfc]"
              >
                <GripVertical size={15} className="shrink-0 text-[#d4d4d8]" />
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#f0f0ff] text-[#5b60f9]">
                  <BookOpen size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-black text-[#3f3f46]">{topic.title}</span>
                  <span className="mt-0.5 block text-[12px] font-semibold text-[#a1a1aa]">Ordre {topic.order}</span>
                </span>
                {isLoadingTopic && <Loader2 size={15} className="shrink-0 animate-spin text-[#5b60f9]" />}
                {isExpanded
                  ? <ChevronDown size={16} className="shrink-0 text-[#a1a1aa]" />
                  : <ChevronRight size={16} className="shrink-0 text-[#a1a1aa]" />}
              </button>

              {isExpanded && (
                <div className="border-t border-[#f4f4f5]">
                  {isLoadingTopic ? (
                    <div className="flex justify-center py-6">
                      <Loader2 size={18} className="animate-spin text-[#5b60f9]" />
                    </div>
                  ) : hasTopicSectionError ? (
                    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center text-[13px] font-semibold text-[#71717b]">
                      <AlertTriangle size={20} className="text-[#f5900b]" />
                      <p className="m-0">Impossible de charger les sections de ce topic.</p>
                      <button
                        type="button"
                        onClick={() => { void loadTopicSections(topic.id) }}
                        className="rounded-[10px] border-[2px] border-[#e4e4e7] bg-white px-3 py-1.5 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9]"
                      >
                        Reessayer
                      </button>
                    </div>
                  ) : items.length === 0 ? (
                    <div className="px-5 py-8 text-center text-[13px] font-semibold text-[#a1a1aa]">Aucun item dans ce topic</div>
                  ) : (
                    items.map((item, index, list) => {
                      const Icon = ITEM_TYPE_ICON[item.item_type] ?? FileText
                      const color = ITEM_TYPE_COLOR[item.item_type] ?? 'text-[#71717b]'
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-center gap-3 px-5 py-3',
                            index < list.length - 1 && 'border-b border-[#f4f4f5]',
                          )}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#fbfbfc]">
                            <Icon size={14} className={cn(color, 'shrink-0')} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-[13.5px] font-bold text-[#3f3f46]">{item.title}</p>
                            <p className="m-0 mt-0.5 text-[12px] font-semibold capitalize text-[#a1a1aa]">{item.item_type}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {item.is_free_preview && (
                              <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-black text-[#16a34a]">Apercu</span>
                            )}
                            <Link href={`/topics/${topic.id}`} className="grid h-8 w-8 place-items-center rounded-[10px] text-[#a1a1aa] transition hover:bg-[#f4f4f5] hover:text-[#3f3f46]" title="Previsualiser" aria-label={`Previsualiser ${item.title}`}>
                              <Eye size={14} />
                            </Link>
                            <Link
                              href={`/admin/courses/content?subjectId=${subjectId}&topicId=${topic.id}&itemId=${item.id}`}
                              className="grid h-8 w-8 place-items-center rounded-[10px] text-[#5b60f9] transition hover:bg-[#f0f0ff]"
                              title="Modifier le cours"
                              aria-label={`Modifier le cours ${item.title}`}
                            >
                              <FileCode2 size={14} />
                            </Link>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </article>
          )
        })}
      </section>

      {topics.length === 0 && (
        <section className={`${card} mt-4 grid min-h-[240px] place-items-center p-8 text-center`}>
          <div>
            <BookOpen size={28} className="mx-auto mb-3 text-[#d4d4d8]" />
            <p className="m-0 text-[14px] font-black text-[#3f3f46]">Aucun topic dans cette matiere.</p>
          </div>
        </section>
      )}
    </main>
  )
}

function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  tone?: 'default' | 'warn'
}) {
  return (
    <div className={adminMetricTileClass}>
      <p className="m-0 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-2 text-[24px] font-black leading-none ${tone === 'warn' ? 'text-[#f5900b]' : 'text-[#3f3f46]'}`}>{value}</p>
      <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">{hint}</p>
    </div>
  )
}
