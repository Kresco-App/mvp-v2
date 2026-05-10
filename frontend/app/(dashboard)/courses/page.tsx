'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { FigmaCourseSearchControls, type FigmaCourseSubjectOption } from '@/components/figma/course-search-controls'
import { FigmaCourseCardSkeleton, FigmaSubjectCourseCard, type FigmaSubjectCourseCardState, PermanentSidebar } from '@/components/figma'

interface TopicCard {
  id: number
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
}

export default function CoursesPage() {
  const [topics, setTopics] = useState<TopicCard[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [previewTopic, setPreviewTopic] = useState<TopicCard | null>(null)

  useEffect(() => { document.title = 'Courses - Kresco' }, [])

  useEffect(() => {
    api.get('/courses/topics')
      .then((res) => setTopics(res.data))
      .catch(() => toast.error('Could not load Bac topics.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const incomingSubject = params.get('subject') ?? ''
    setSubjectFilter(incomingSubject)
  }, [])

  const subjectOptions = useMemo<FigmaCourseSubjectOption[]>(() => {
    const byKey = new Map<string, FigmaCourseSubjectOption>()
    topics.forEach((topic) => {
      const key = subjectKey(topic.subject_title)
      if (!byKey.has(key)) {
        byKey.set(key, {
          label: canonicalSubjectLabel(topic.subject_title),
          value: topic.subject_title,
        })
      }
    })
    return Array.from(byKey.values())
  }, [topics])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const subject = subjectKey(subjectFilter)
    const matches = topics.filter((topic) => {
      const text = [topic.title, topic.description, topic.subject_title, ...topic.concepts].join(' ').toLowerCase()
      const matchesQuery = !q || text.includes(q)
      const matchesSubject = !subject || subjectKey(topic.subject_title) === subject || topic.subject_title.toLowerCase().includes(subjectFilter.trim().toLowerCase())
      return matchesQuery && matchesSubject
    })
    return dedupeTopics(matches)
  }, [topics, query, subjectFilter])

  const groupedSections = useMemo(() => groupTopicsBySubject(filtered), [filtered])

  return (
    <div className="figma-courses-container">
      <div className="figma-courses-grid">
        <main className="pt-[44px]">
          <div className="mb-[64px] flex h-[18px] items-center text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">
            <span>2éme Bac</span>
            <span className="ml-[3.5px]">/ Sciences Math A</span>
          </div>

          <FigmaCourseSearchControls
            query={query}
            subject={subjectFilter}
            subjects={subjectOptions}
            onQueryChange={setQuery}
            onSubjectChange={setSubjectFilter}
          />

          {loading ? (
            <div>
              <SubjectDividerSkeleton />
              <div className="figma-course-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <FigmaCourseCardSkeleton key={index} index={index} />
                ))}
              </div>
            </div>
          ) : groupedSections.length > 0 ? (
            <div className="grid gap-[54px]">
              {groupedSections.map((section) => (
                <section key={section.key}>
                  <SubjectDivider title={section.title} subtitle={section.subtitle} />
                  <div className="figma-course-grid">
                    {section.topics.map((topic, index) => (
                      <FigmaSubjectCourseCard
                        key={topic.id}
                        index={index}
                        eyebrow={canonicalSubjectLabel(topic.subject_title)}
                        title={topic.title}
                        description={topic.description}
                        progress={topic.progress_pct}
                        state={topicCardState(topic)}
                        href={`/topics/${topic.id}`}
                        onClick={topic.can_access === false ? () => setPreviewTopic(topic) : undefined}
                      />
                    ))}
                  </div>
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
                  onClick={() => {
                    setQuery('')
                    setSubjectFilter('')
                  }}
                >
                  Reset filters
                </button>
              </div>
            </section>
          )}
        </main>

        <PermanentSidebar sections={['quests', 'leaderboard']} />
      </div>

      {previewTopic && <LockedTopicPreview topic={previewTopic} onClose={() => setPreviewTopic(null)} />}
    </div>
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

function LockedTopicPreview({ topic, onClose }: { topic: TopicCard; onClose: () => void }) {
  const reason = lockedTopicReason(topic.locked_reason)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#18181b]/35 px-4 backdrop-blur-[2px]" onClick={onClose}>
      <section
        aria-modal="true"
        className="w-full max-w-[520px] rounded-[16px] border-2 border-[#e4e4e7] bg-white p-6 shadow-[0_24px_80px_rgba(24,24,27,.18)]"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
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

        <div className="mt-5 rounded-[12px] border-2 border-[#e4e4e7] bg-[#fafafa] p-4">
          <p className="m-0 text-[13px] font-bold leading-[1.2] tracking-[0.2px] text-[#9f9fa9]">Access</p>
          <p className="m-0 mt-1 text-[16px] font-bold leading-[1.3] tracking-[0.2px] text-[#3f3f46]">{reason}</p>
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

        <button
          className="mt-6 h-[44px] w-full rounded-[12px] bg-[#5b60f9] px-[34px] py-[11px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-white transition hover:brightness-[1.03]"
          type="button"
          onClick={onClose}
        >
          Got it
        </button>
      </section>
    </div>
  )
}

function lockedTopicReason(reason?: string) {
  if (reason === 'pro_required') return 'Kresco Pro is required for this topic.'
  if (reason === 'subject_access_required') return 'Your account does not include this subject yet.'
  if (reason?.startsWith('feature_required:')) return 'This topic requires an additional feature on your account.'
  return 'This topic is locked for your current account.'
}

function normalizeProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(progress) ? progress : 0)))
}

function dedupeTopics(topics: TopicCard[]) {
  const byKey = new Map<string, TopicCard>()
  topics.forEach((topic) => {
    const key = normalizedTopicKey(topic.title)
    const existing = byKey.get(key)
    if (!existing || topic.progress_pct > existing.progress_pct || (topic.progress_pct === existing.progress_pct && topic.completed_count > existing.completed_count)) {
      byKey.set(key, topic)
    }
  })
  return Array.from(byKey.values())
}

function groupTopicsBySubject(topics: TopicCard[]) {
  const buckets = new Map<string, TopicCard[]>()
  topics.forEach((topic) => {
    const key = subjectKey(topic.subject_title)
    buckets.set(key, [...(buckets.get(key) ?? []), topic])
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
      title: canonicalSubjectLabel(sectionTopics[0]?.subject_title ?? key),
      subtitle: 'Continue the next available courses.',
      topics: sectionTopics,
    }))

  return [...known, ...unknown]
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

function subjectKey(title: string) {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (['math', 'maths', 'mathematics', 'mathematiques'].includes(normalized)) return 'math'
  if (normalized.includes('physique') || normalized.includes('physics') || normalized.includes('chimie') || normalized.includes('chemistry')) return 'physics'
  if (normalized.includes('philosophy') || normalized.includes('philosophie')) return 'philosophy'
  if (normalized.includes('biology') || normalized.includes('sciences de la vie') || normalized === 'svt') return 'biology'
  if (normalized.includes('english') || normalized.includes('anglais')) return 'english'
  return normalized
}

function canonicalSubjectLabel(title: string) {
  const key = subjectKey(title)
  if (key === 'math') return 'Math'
  if (key === 'physics') return 'Physics'
  if (key === 'philosophy') return 'Philosophy'
  if (key === 'biology') return 'Biology'
  if (key === 'english') return 'English'
  return title
}

const courseSubjectSections = [
  { key: 'math', title: 'Mathematics', subtitle: 'The science that loves to calculate things.' },
  { key: 'physics', title: 'Physics', subtitle: 'The science that loves to calculate things.' },
  { key: 'philosophy', title: 'Philosophy', subtitle: 'Reason through ideas, arguments, and meaning.' },
  { key: 'biology', title: 'Biology', subtitle: 'Explore living systems and how they work.' },
  { key: 'english', title: 'English', subtitle: 'Practice language, reading, and communication.' },
]
