'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { getJson } from '@/lib/apiClient'
import {
  courseFiltersEqual,
  courseFiltersToSearchParams,
  defaultCourseFilters,
  parseCourseFilters,
  type CourseFilters,
} from '@/lib/courseFilters'
import { canonicalSubjectTitle as canonicalSubjectLabel, subjectKey } from '@/lib/subjectIdentity'
import { FigmaCourseSearchControls, type FigmaCourseStatusFilter, type FigmaCourseSubjectOption } from '@/components/figma/course-search-controls'
import { FigmaCourseCardSkeleton, FigmaSubjectCourseCard, type FigmaSubjectCourseCardState } from '@/components/figma'

interface TopicCard {
  id: number
  subject_id?: number
  subject_title: string
  slug: string
  title: string
  description: string
  is_free_preview: boolean
  item_count: number
  completed_count: number
  progress_pct: number
  concepts: string[]
  can_access?: boolean
  locked_reason?: string
  access_reason?: string
  required_tier?: string
  required_feature_key?: string
  required_subject_id?: number | null
}

type TopicView = TopicCard & {
  search_text: string
  subject_key: string
  subject_label: string
  state: FigmaSubjectCourseCardState
  topic_key: string
}

const MAX_TOPICS_PER_SECTION = 72

export default function CoursesPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeFilters = useMemo(() => parseCourseFilters(new URLSearchParams(searchKey)), [searchKey])
  const [topics, setTopics] = useState<TopicCard[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<CourseFilters>(routeFilters)
  const [previewTopic, setPreviewTopic] = useState<TopicCard | null>(null)
  const { query, subject: subjectFilter, status: statusFilter } = filters

  useEffect(() => {
    let alive = true

    getJson<TopicCard[]>('/courses/topics')
      .then((data) => {
        if (!alive) return
        setTopics(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!alive) return
        toast.error('Could not load Bac topics.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    setFilters((current) => courseFiltersEqual(current, routeFilters) ? current : routeFilters)
  }, [routeFilters])

  const applyFilters = useCallback((nextFilters: CourseFilters) => {
    setFilters((current) => courseFiltersEqual(current, nextFilters) ? current : nextFilters)
    const params = courseFiltersToSearchParams(nextFilters, new URLSearchParams(searchKey))
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }, [pathname, router, searchKey])

  const updateFilters = useCallback((patch: Partial<CourseFilters>) => {
    applyFilters({ ...filters, ...patch })
  }, [applyFilters, filters])

  const topicViews = useMemo<TopicView[]>(() => topics.map(toTopicView), [topics])

  const subjectOptions = useMemo<FigmaCourseSubjectOption[]>(() => {
    const byKey = new Map<string, FigmaCourseSubjectOption>()
    topicViews.forEach((topic) => {
      if (!byKey.has(topic.subject_key)) {
        byKey.set(topic.subject_key, {
          label: topic.subject_label,
          value: topic.subject_title,
        })
      }
    })
    return Array.from(byKey.values())
  }, [topicViews])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const subject = subjectKey(subjectFilter)
    const subjectText = subjectFilter.trim().toLowerCase()
    const matches = topicViews.filter((topic) => {
      const matchesQuery = !q || topic.search_text.includes(q)
      const matchesSubject = !subject || topic.subject_key === subject || topic.subject_title.toLowerCase().includes(subjectText)
      const matchesStatus = topicMatchesStatus(topic.state, statusFilter)
      return matchesQuery && matchesSubject && matchesStatus
    })
    return dedupeTopics(matches)
  }, [topicViews, query, subjectFilter, statusFilter])

  const groupedSections = useMemo(() => groupTopicsBySubject(filtered), [filtered])

  return (
    <>
      <main className="pt-[44px]">
          <div className="mb-[64px] flex h-[18px] items-center text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">
            <span>2éme Bac</span>
            <span className="ml-[3.5px]">/ Sciences Math A</span>
          </div>

          <FigmaCourseSearchControls
            query={query}
            subject={subjectFilter}
            status={statusFilter}
            subjects={subjectOptions}
            onQueryChange={(value) => updateFilters({ query: value })}
            onSubjectChange={(value) => updateFilters({ subject: value })}
            onStatusChange={(value) => updateFilters({ status: value })}
          />

          {loading ? (
            <div>
              <SubjectDividerSkeleton />
              <div className="figma-course-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <FigmaCourseCardSkeleton key={index} />
                ))}
              </div>
            </div>
          ) : groupedSections.length > 0 ? (
            <div className="grid gap-[54px]">
              {groupedSections.map((section) => (
                <section key={section.key}>
                  <SubjectDivider title={section.title} subtitle={section.subtitle} />
                  <div className="figma-course-grid">
                    {section.topics.slice(0, MAX_TOPICS_PER_SECTION).map((topic, index) => (
                      <FigmaSubjectCourseCard
                        key={topic.id}
                        index={index}
                        eyebrow={topic.subject_label}
                        title={topic.title}
                        description={topic.description}
                        progress={topic.progress_pct}
                        state={topic.state}
                        href={`/topics/${topic.id}`}
                        onClick={topic.can_access === false ? () => setPreviewTopic(topic) : undefined}
                      />
                    ))}
                  </div>
                  {section.topics.length > MAX_TOPICS_PER_SECTION && (
                    <p className="m-0 mt-4 text-[13px] font-bold leading-[1.2] tracking-[0.18px] text-[#9f9fa9]">
                      Showing the first {MAX_TOPICS_PER_SECTION} matching topics. Narrow the search to see a smaller list.
                    </p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <section className="grid min-h-[327.5px] max-w-[1060.99px] place-items-center rounded-[16px] border-2 border-dashed border-[#e4e4e7] bg-white px-8 text-center">
              <div>
                <p className="m-0 text-[18px] font-bold leading-[1.1] tracking-[0.24px] text-[#3f3f46]">No courses found</p>
                <p className="m-0 mt-2 text-[15px] font-bold leading-[1.2] tracking-[0.18px] text-[#9f9fa9]">Try another search or subject filter.</p>
                <button
                  className="mt-5 h-[44px] rounded-[12px] bg-[#5b60f9] px-[34px] py-[11px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-white"
                  type="button"
                  onClick={() => applyFilters(defaultCourseFilters)}
                >
                  Reset filters
                </button>
              </div>
            </section>
          )}
      </main>

      {previewTopic && <LockedTopicPreview topic={previewTopic} onClose={() => setPreviewTopic(null)} />}
    </>
  )
}

function SubjectDivider({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-[32px]">
      <h2 className="m-0 text-[24px] font-bold leading-[1.4] tracking-normal text-[#3f3f46]">{title}</h2>
      <p className="m-0 text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">{subtitle}</p>
    </div>
  )
}

function SubjectDividerSkeleton() {
  return (
    <div className="mb-[32px]">
      <span className="kresco-skeleton block h-[34px] w-[196px] rounded-[8px]" />
      <span className="kresco-skeleton mt-[8px] block h-[18px] w-[292px] rounded-[6px]" />
    </div>
  )
}

function topicCardState(topic: TopicCard): FigmaSubjectCourseCardState {
  if (topic.can_access === false) return 'locked'
  if (topic.item_count <= 0) return 'upcoming'
  if (normalizeProgress(topic.progress_pct) >= 100 || topic.completed_count >= topic.item_count) return 'completed'
  if (normalizeProgress(topic.progress_pct) > 0 || topic.completed_count > 0) return 'current'
  return 'available'
}

function topicMatchesStatus(state: FigmaSubjectCourseCardState, status: FigmaCourseStatusFilter) {
  if (status === 'all') return true
  if (status === 'unlocked') return state !== 'locked'
  if (status === 'locked') return state === 'locked'
  if (status === 'in_progress') return state === 'current'
  if (status === 'completed') return state === 'completed'
  return true
}

function LockedTopicPreview({ topic, onClose }: { topic: TopicCard; onClose: () => void }) {
  const reason = lockedTopicReason(topic.locked_reason)
  const requirements = accessSummary(topic)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#18181b]/35 px-4 backdrop-blur-[2px]" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default border-0 bg-transparent p-0" onClick={onClose} aria-label="Close locked topic preview" />
      <section
        aria-modal="true"
        className="relative w-full max-w-[520px] rounded-[16px] border-2 border-[#e4e4e7] bg-white p-6 shadow-[0_24px_80px_rgba(24,24,27,.18)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[14px] font-bold leading-[1.1] tracking-[0.2px] text-[#9f9fa9]">{canonicalSubjectLabel(topic.subject_title)}</p>
            <h2 className="m-0 mt-2 text-[24px] font-bold leading-[1.2] tracking-normal text-[#3f3f46]">{topic.title}</h2>
          </div>
          <button
            className="grid size-[36px] shrink-0 place-items-center rounded-[10px] border-2 border-[#e4e4e7] bg-white text-[18px] font-bold leading-none text-[#71717b] transition hover:bg-[#f4f4f5]"
            type="button"
            onClick={onClose}
            aria-label="Close locked topic preview"
          >
            <X aria-hidden="true" size={18} strokeWidth={2.8} />
          </button>
        </div>

        <p className="m-0 mt-4 text-[15px] font-bold leading-[1.45] tracking-[0.18px] text-[#71717b]">{topic.description || 'This topic is part of a protected study path.'}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <LockedPreviewMetric label="Items" value={topic.item_count.toLocaleString()} />
          <LockedPreviewMetric label="Free preview" value={topic.is_free_preview ? 'Available' : 'Not included'} />
        </div>

        <div className="mt-5 rounded-[12px] border-2 border-[#e4e4e7] bg-[#fafafa] p-4">
          <p className="m-0 text-[13px] font-bold leading-[1.2] tracking-[0.2px] text-[#9f9fa9]">Access</p>
          <p className="m-0 mt-1 text-[16px] font-bold leading-[1.3] tracking-[0.2px] text-[#3f3f46]">{reason}</p>
          {requirements.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {requirements.map((item) => (
                <span key={item} className="rounded-[8px] bg-white px-2.5 py-1.5 text-[11px] font-bold leading-[1] tracking-[0.16px] text-[#71717b]">
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

        {topic.concepts.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {topic.concepts.slice(0, 6).map((concept) => (
              <span key={concept} className="rounded-[8px] border-2 border-[#e4e4e7] bg-white px-3 py-2 text-[13px] font-bold leading-[1] tracking-[0.18px] text-[#71717b]">
                {concept.replace(/[-_]+/g, ' ')}
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            className="inline-flex h-[44px] flex-1 items-center justify-center rounded-[12px] bg-[#5b60f9] px-[24px] py-[11px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-white transition hover:brightness-[1.03]"
            href="/pricing"
          >
            View unlock options
          </Link>
          <button
            className="h-[44px] flex-1 rounded-[12px] border-2 border-[#e4e4e7] bg-white px-[24px] py-[11px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#71717b] transition hover:bg-[#f4f4f5]"
            type="button"
            onClick={onClose}
          >
            Keep browsing
          </button>
        </div>
      </section>
    </div>
  )
}

function LockedPreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border-2 border-[#e4e4e7] bg-white p-3">
      <p className="m-0 text-[12px] font-bold leading-[1] tracking-[0.16px] text-[#9f9fa9]">{label}</p>
      <p className="m-0 mt-2 text-[15px] font-bold leading-[1.15] tracking-[0.18px] text-[#3f3f46]">{value}</p>
    </div>
  )
}

function lockedTopicReason(reason?: string) {
  if (reason === 'pro_required') return 'Kresco Pro is required for this topic.'
  if (reason === 'vip_required') return 'Kresco VIP is required for this topic.'
  if (reason === 'subject_access_required') return 'Your account does not include this subject yet.'
  if (reason?.startsWith('feature_required:')) return 'This topic requires an additional feature on your account.'
  return 'This topic is locked for your current account.'
}

function accessSummary(topic: TopicCard) {
  return [
    topic.required_tier ? `${topic.required_tier.toUpperCase()} tier` : '',
    topic.required_feature_key ? `Feature: ${topic.required_feature_key.replace(/_/g, ' ')}` : '',
    topic.required_subject_id ? `Subject access #${topic.required_subject_id}` : '',
  ].filter(Boolean)
}

function normalizeProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(progress) ? progress : 0)))
}

function dedupeTopics(topics: TopicView[]) {
  const byKey = new Map<string, TopicView>()
  topics.forEach((topic) => {
    const key = topic.topic_key
    const existing = byKey.get(key)
    if (!existing || topic.progress_pct > existing.progress_pct || (topic.progress_pct === existing.progress_pct && topic.completed_count > existing.completed_count)) {
      byKey.set(key, topic)
    }
  })
  return Array.from(byKey.values())
}

function groupTopicsBySubject(topics: TopicView[]) {
  const buckets = new Map<string, TopicView[]>()
  topics.forEach((topic) => {
    const key = topic.subject_key
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(topic)
    } else {
      buckets.set(key, [topic])
    }
  })

  const known = courseSubjectSections
    .map((section) => ({
      ...section,
      topics: buckets.get(section.key) ?? [],
    }))
    .filter((section) => section.topics.length > 0)

  const unknown = Array.from(buckets.entries())
    .filter(([key]) => !courseSubjectSections.some((section) => section.key === key))
    .map(([key, sectionTopics]) => ({
      key,
      title: sectionTopics[0]?.subject_label ?? canonicalSubjectLabel(key),
      subtitle: 'Continue the next available courses.',
      topics: sectionTopics,
    }))

  return [...known, ...unknown]
}

function toTopicView(topic: TopicCard): TopicView {
  const subject_key = subjectKey(topic.subject_title)
  const subject_label = canonicalSubjectLabel(topic.subject_title)
  return {
    ...topic,
    search_text: [topic.title, topic.description, topic.subject_title, ...topic.concepts].join(' ').toLowerCase(),
    subject_key,
    subject_label,
    state: topicCardState(topic),
    topic_key: `${subject_key}:${normalizedTopicKey(topic.title)}`,
  }
}

function normalizedTopicKey(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const courseSubjectSections = [
  { key: 'math', title: 'Mathematics', subtitle: 'The science that loves to calculate things.' },
  { key: 'physics', title: 'Physics', subtitle: 'The science that loves to calculate things.' },
  { key: 'chemistry', title: 'Chemistry', subtitle: 'Explore matter, reactions, and lab reasoning.' },
  { key: 'philosophy', title: 'Philosophy', subtitle: 'Reason through ideas, arguments, and meaning.' },
  { key: 'biology', title: 'Biology', subtitle: 'Explore living systems and how they work.' },
  { key: 'english', title: 'English', subtitle: 'Practice language, reading, and communication.' },
]
