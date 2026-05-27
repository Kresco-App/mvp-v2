'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, BookOpen, ClipboardCheck, Play } from 'lucide-react'
import api from '@/lib/axios'
import { buildSubjectProgressSummary, fetchSubjectPlan, type SubjectProgressSummary } from '@/lib/subjectProgress'
import { useAuthStore } from '@/lib/store'
import { FigmaSubjectCourseCard, PermanentSidebar, type FigmaSubjectCourseCardState } from '@/components/figma'
import { FigmaSubjectDetailSkeleton } from '@/components/figma/skeletons'

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

interface TopicCard {
  id: number
  title: string
  description: string
  item_count: number
  completed_count: number
  progress_pct: number
  can_access?: boolean
}

interface Chapter {
  id: number
  title: string
  order: number
  lessons: unknown[]
  blocks: unknown[]
}

interface Subject {
  id: number
  title: string
  description: string
  thumbnail_url: string
  chapters: Chapter[]
}

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [subject, setSubject] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)
  const [chapterSections, setChapterSections] = useState<Record<number, Section[]>>({})
  const [progressSummary, setProgressSummary] = useState<SubjectProgressSummary | null>(null)
  const [topics, setTopics] = useState<TopicCard[]>([])

  const isPro = user?.is_pro

  useEffect(() => {
    async function load() {
      try {
        const [subjectRes, subjectPlan, topicsRes] = await Promise.all([
          api.get(`/courses/subjects/${subjectId}`),
          fetchSubjectPlan(subjectId).catch(() => null),
          api.get(`/courses/subjects/${subjectId}/topics`).catch(() => ({ data: [] })),
        ])
        setSubject(subjectRes.data)

        const subjectTopics = Array.isArray(topicsRes.data) ? topicsRes.data : []
        setTopics(subjectTopics)
        if (subjectTopics.length > 0) {
          setChapterSections({})
          setProgressSummary(null)
          return
        }

        const completedSectionIds = new Set(subjectPlan?.completed_section_ids ?? [])
        const totalLessonCount = subjectRes.data.chapters.reduce(
          (count: number, chapter: Chapter) => count + (chapter.lessons?.length ?? 0),
          0,
        )

        const sectionsMap: Record<number, Section[]> = {}
        await Promise.all(
          subjectRes.data.chapters.map(async (chapter: Chapter) => {
            try {
              const res = await api.get(`/courses/chapters/${chapter.id}/sections`)
              sectionsMap[chapter.id] = res.data.map((section: Section) => ({
                ...section,
                is_completed: completedSectionIds.has(section.id),
              }))
            } catch {
              sectionsMap[chapter.id] = []
            }
          }),
        )
        setChapterSections(sectionsMap)

        if (subjectPlan) setProgressSummary(buildSubjectProgressSummary(subjectPlan, totalLessonCount))
      } catch {
        toast.error('Could not load this subject.')
        router.push('/home')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router, subjectId])

  if (loading) {
    return <FigmaSubjectDetailSkeleton />
  }

  if (!subject) return null

  const allSections = Object.values(chapterSections).flat()
  const totalSections = allSections.length
  const completedCount = allSections.filter((section) => section.is_completed).length
  const hasTopicWorkspace = topics.length > 0
  const topicItemTotal = topics.reduce((total, topic) => total + topic.item_count, 0)
  const topicCompletedCount = topics.reduce((total, topic) => total + topic.completed_count, 0)
  const totalCount = hasTopicWorkspace ? topicItemTotal : totalSections
  const completedTotal = hasTopicWorkspace ? topicCompletedCount : completedCount
  const percentage = hasTopicWorkspace
    ? (topicItemTotal > 0 ? Math.round((topicCompletedCount / topicItemTotal) * 100) : 0)
    : progressSummary?.percentage ?? (totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0)
  const nextSection = allSections.find((section) => !section.is_completed && canAccessSection(section, isPro))
  const nextTopic = topics.find((topic) => topic.can_access !== false && topic.completed_count < topic.item_count) || topics.find((topic) => topic.can_access !== false)
  const continueHref = hasTopicWorkspace ? (nextTopic ? `/topics/${nextTopic.id}` : undefined) : (nextSection ? `/watch/${nextSection.id}` : undefined)
  const activeChapterId = subject.chapters.find((chapter) => (chapterSections[chapter.id] || []).some((section) => section.id === nextSection?.id))?.id

  return (
    <div className="figma-container">
      <div className="figma-dashboard-grid">
        <main className="w-full">
          <div className="mb-4 flex items-center gap-2">
            <Link href="/home" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#9f9fa9] no-underline">
              <ArrowLeft size={13} />
              Home
            </Link>
            <span className="text-[12px] text-[#e4e4e7]">/</span>
            <span className="text-[12px] font-bold text-[#71717b]">{subject.title}</span>
          </div>

          <section className="mb-8 rounded-2xl border-2 border-[#e4e4e7] bg-white p-7 shadow-none">
            <div className="flex items-start gap-5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#edf1ff] text-[#453dee]">
                <BookOpen size={26} strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="m-0 text-[28px] font-bold leading-tight tracking-normal text-[#3f3f46]">{subject.title}</h1>
                <p className="m-0 mt-2 max-w-[620px] text-[15px] font-semibold leading-relaxed text-[#71717b]">{subject.description}</p>
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-[13px] font-bold text-[#71717b]">
                    <span>{completedTotal} / {totalCount} {hasTopicWorkspace ? 'items' : 'sections'} completed</span>
                    <span className="text-[#453dee]">{percentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f4f4f5]">
                    <span className="block h-full rounded-full bg-[#453dee] transition-[width] duration-500" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {continueHref && (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#e4e4e7] pt-5">
                <Link href={continueHref} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#453dee] px-5 text-[14px] font-bold text-white no-underline shadow-none transition hover:-translate-y-0.5">
                  <Play size={15} fill="currentColor" />
                  {completedTotal === 0 ? 'Start course' : 'Continue'}
                </Link>
                <Link href={`/exam/${subjectId}`} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e4e4e7] bg-white px-5 text-[14px] font-bold text-[#52525c] no-underline transition hover:border-[#453dee] hover:text-[#453dee]">
                  <ClipboardCheck size={15} />
                  Mock exam
                </Link>
              </div>
            )}
          </section>

          <section className="pb-20">
            <div className="mb-5">
              <h2 className="m-0 text-[25px] font-bold leading-none tracking-normal text-[#3f3f46]">{hasTopicWorkspace ? 'Topics' : 'Chapters'}</h2>
              <p className="m-0 mt-2 text-[16px] font-bold leading-none tracking-normal text-[#a1a1aa]">
                {hasTopicWorkspace ? 'Choose the next topic to continue.' : 'Choose the next chapter to continue.'}
              </p>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[14px]">
              {hasTopicWorkspace ? topics.map((topic, topicIdx) => (
                <FigmaSubjectCourseCard
                  key={topic.id}
                  index={topicIdx}
                  title={topic.title}
                  description={`${topic.completed_count} of ${topic.item_count} items complete`}
                  progress={topic.progress_pct}
                  state={getTopicCardState(topic)}
                  href={`/topics/${topic.id}`}
                />
              )) : subject.chapters.map((chapter, chapterIdx) => {
                const sections = chapterSections[chapter.id] || []
                const lessonCount = Math.max(sections.length, chapter.lessons?.length ?? 0, 1)

                return (
                  <FigmaSubjectCourseCard
                    key={chapter.id}
                    index={chapterIdx}
                    title={chapter.title}
                    description={`${completedInChapter(sections)} of ${sections.length || lessonCount} sections complete`}
                    progress={getChapterProgress(sections)}
                    state={getChapterCardState(sections, chapter.id === activeChapterId, isPro)}
                    href={getChapterHref(sections, isPro)}
                  />
                )
              })}
            </div>

            <Link href={`/exam/${subjectId}`} className="mt-8 inline-flex h-[58px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#453dee] text-[17px] font-bold text-white no-underline shadow-none transition hover:-translate-y-0.5">
              <ClipboardCheck size={22} />
              Passer l&apos;examen blanc final
            </Link>
          </section>
        </main>

        <PermanentSidebar />
      </div>
    </div>
  )
}

function completedInChapter(sections: Section[]) {
  return sections.filter((section) => section.is_completed).length
}

function getChapterProgress(sections: Section[]) {
  if (sections.length === 0) return 0
  return Math.round((completedInChapter(sections) / sections.length) * 100)
}

function getChapterHref(sections: Section[], isPro?: boolean) {
  const next = sections.find((section) => !section.is_completed && canAccessSection(section, isPro)) || sections.find((section) => canAccessSection(section, isPro))
  return next ? `/watch/${next.id}` : undefined
}

function getChapterCardState(sections: Section[], isActive: boolean, isPro?: boolean): FigmaSubjectCourseCardState {
  if (sections.length === 0) return 'upcoming'
  const completed = completedInChapter(sections)
  if (completed === sections.length) return 'completed'
  const hasAccessible = sections.some((section) => canAccessSection(section, isPro))
  if (!hasAccessible) return 'locked'
  if (isActive || completed > 0) return 'current'
  return 'available'
}

function getTopicCardState(topic: TopicCard): FigmaSubjectCourseCardState {
  if (topic.can_access === false) return 'locked'
  if (topic.item_count <= 0) return 'upcoming'
  if (topic.progress_pct >= 100 || topic.completed_count >= topic.item_count) return 'completed'
  if (topic.progress_pct > 0 || topic.completed_count > 0) return 'current'
  return 'available'
}

function canAccessSection(section: Section, isPro?: boolean) {
  return !section.is_locked || Boolean(section.is_free_preview) || Boolean(isPro)
}
