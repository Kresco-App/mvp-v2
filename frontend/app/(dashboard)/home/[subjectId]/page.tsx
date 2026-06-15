'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, BookOpen, ClipboardCheck, Play } from 'lucide-react'
import { getJson } from '@/lib/apiClient'
import { FigmaSubjectCourseCard, type FigmaSubjectCourseCardState } from '@/components/figma'
import { FigmaSubjectDetailSkeleton } from '@/components/figma/skeletons'
import RouteErrorState from '@/components/RouteErrorState'

interface TopicCard {
  id: number
  title: string
  description: string
  item_count: number
  completed_count: number
  progress_pct: number
  can_access?: boolean
}

interface Subject {
  id: number
  title: string
  description: string
  thumbnail_url: string
}

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const [subject, setSubject] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)
  const [topics, setTopics] = useState<TopicCard[]>([])
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const [subjectData, topicsData] = await Promise.all([
          getJson<Subject>(`/courses/subjects/${subjectId}`, { signal: controller.signal }),
          getJson<TopicCard[]>(`/courses/subjects/${subjectId}/topics`, { signal: controller.signal }),
        ])
        setSubject(subjectData)
        setTopics(Array.isArray(topicsData) ? topicsData : [])
      } catch {
        if (controller.signal.aborted) return
        const message = 'Could not load this subject.'
        setLoadError(message)
        toast.error(message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    load()
    return () => {
      controller.abort()
    }
  }, [reloadKey, subjectId])

  const topicItemTotal = useMemo(() => topics.reduce((total, topic) => total + topic.item_count, 0), [topics])
  const topicCompletedCount = useMemo(() => topics.reduce((total, topic) => total + topic.completed_count, 0), [topics])
  const totalCount = topicItemTotal
  const completedTotal = topicCompletedCount
  const percentage = topicItemTotal > 0 ? Math.round((topicCompletedCount / topicItemTotal) * 100) : 0
  const nextTopic = useMemo(
    () => topics.find((topic) => topic.can_access !== false && topic.completed_count < topic.item_count) || topics.find((topic) => topic.can_access !== false),
    [topics],
  )
  const continueHref = nextTopic ? `/topics/${nextTopic.id}` : undefined

  if (loading) {
    return <FigmaSubjectDetailSkeleton />
  }

  if (!subject) {
    return (
      <main className="grid min-h-[420px] place-items-center py-12">
        <RouteErrorState
          eyebrow="Subject unavailable"
          title="This subject could not be loaded."
          message={loadError || 'The course data did not return a usable subject. Retry the request or go back home.'}
          homeHref="/home"
          homeLabel="Back home"
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      </main>
    )
  }

  return (
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
                    <span>{completedTotal} / {totalCount} items completed</span>
                    <span className="text-[#453dee]">{percentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f4f4f5]">
                    <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
                      <rect width={percentage} height="1" fill="#453dee" rx="0.5" />
                    </svg>
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
              <h2 className="m-0 text-[25px] font-bold leading-none tracking-normal text-[#3f3f46]">Topics</h2>
              <p className="m-0 mt-2 text-[16px] font-bold leading-none tracking-normal text-[#a1a1aa]">
                {topics.length > 0 ? 'Choose the next topic to continue.' : 'No topics available yet.'}
              </p>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[14px]">
              {topics.map((topic, topicIdx) => (
                <FigmaSubjectCourseCard
                  key={topic.id}
                  index={topicIdx}
                  title={topic.title}
                  description={`${topic.completed_count} of ${topic.item_count} items complete`}
                  progress={topic.progress_pct}
                  state={getTopicCardState(topic)}
                  href={`/topics/${topic.id}`}
                />
              ))}
            </div>

            <Link href={`/exam/${subjectId}`} className="mt-8 inline-flex h-[58px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#453dee] text-[17px] font-bold text-white no-underline shadow-none transition hover:-translate-y-0.5">
              <ClipboardCheck size={22} />
              Passer l&apos;examen blanc final
            </Link>
          </section>
    </main>
  )
}

function getTopicCardState(topic: TopicCard): FigmaSubjectCourseCardState {
  if (topic.can_access === false) return 'locked'
  if (topic.item_count <= 0) return 'upcoming'
  if (topic.progress_pct >= 100 || topic.completed_count >= topic.item_count) return 'completed'
  if (topic.progress_pct > 0 || topic.completed_count > 0) return 'current'
  return 'available'
}
