'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/lib/store'
import {
  FigmaHomeMain,
  PermanentSidebar,
  type FigmaHomeSubject,
  type FigmaHomeTopic,
} from '@/components/figma'

interface TopicCard {
  id: number
  subject_title: string
  title: string
  description: string
  item_count: number
  completed_count: number
  progress_pct: number
  concepts: string[]
  can_access?: boolean
}

interface SubjectCard {
  id: number | string
  title: string
  description?: string
  progress_pct?: number
}

export default function HomePage() {
  const { user } = useAuthStore()
  const [topics, setTopics] = useState<TopicCard[]>([])
  const [subjects, setSubjects] = useState<SubjectCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { document.title = 'Home - Kresco' }, [])

  useEffect(() => {
    let alive = true

    async function loadHome() {
      const [topicsResult, subjectsResult] = await Promise.all([
        api.get('/courses/topics').then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason) => ({ status: 'rejected' as const, reason }),
        ),
        api.get('/courses/subjects').then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason) => ({ status: 'rejected' as const, reason }),
        ),
      ])

      if (!alive) return

      if (topicsResult.status === 'fulfilled') {
        setTopics(Array.isArray(topicsResult.value.data) ? topicsResult.value.data : [])
      } else {
        toast.error('Could not load your dashboard.')
      }

      if (subjectsResult.status === 'fulfilled') {
        setSubjects(Array.isArray(subjectsResult.value.data) ? subjectsResult.value.data : [])
      }

      setLoading(false)
    }

    loadHome()

    return () => {
      alive = false
    }
  }, [])

  const firstName = user?.full_name?.split(' ')[0] || 'Student'
  const continueTopics = useMemo<FigmaHomeTopic[]>(() => {
    const source = pickContinueTopics(topics, 2)

    if (source.length === 0) return fallbackContinueTopics

    return source.map((topic) => ({
      id: topic.id,
      subject_title: topic.subject_title,
      title: topic.title,
      description: topic.description,
      progress_pct: topic.progress_pct,
      item_count: topic.item_count,
      completed_count: topic.completed_count,
      href: `/topics/${topic.id}`,
    }))
  }, [topics])

  const subjectShortcuts = useMemo<FigmaHomeSubject[]>(() => {
    const source = buildSubjectShortcuts(subjects, fallbackSubjects)

    return source.map((subject) => ({
      id: subject.id,
      title: canonicalSubjectTitle(subject.title),
      description: subject.description,
      progress_pct: subject.progress_pct,
      learner_count: '25k Learner',
      href: `/courses?subject=${encodeURIComponent(canonicalSubjectTitle(subject.title))}`,
    }))
  }, [subjects])

  return (
    <div className="figma-home-container">
      <div className="figma-home-grid">
        <main>
          <FigmaHomeMain
            firstName={firstName}
            subjects={subjectShortcuts}
            continueTopics={continueTopics}
            loading={loading}
          />
        </main>

        <PermanentSidebar />
      </div>
    </div>
  )
}

function pickContinueTopics(topics: TopicCard[], limit: number) {
  const seen = new Set<number>()
  const picked: TopicCard[] = []

  function add(topic: TopicCard, includeLocked = false) {
    if (seen.has(topic.id)) return false
    if (!includeLocked && topic.can_access === false) return false
    seen.add(topic.id)
    picked.push(topic)
    return picked.length >= limit
  }

  for (const topic of topics) {
    if (topic.progress_pct > 0 && topic.progress_pct < 100 && add(topic)) return picked
  }

  for (const topic of topics) {
    if (add(topic)) return picked
  }

  for (const topic of topics) {
    if (topic.progress_pct > 0 && topic.progress_pct < 100 && add(topic, true)) return picked
  }

  for (const topic of topics) {
    if (add(topic, true)) return picked
  }

  return picked
}

function buildSubjectShortcuts(subjects: SubjectCard[], fallbacks: SubjectCard[]) {
  const byKey = new Map<string, SubjectCard>()

  for (const subject of [...subjects, ...fallbacks]) {
    const key = subjectKey(subject.title)
    if (!allowedSubjectKeys.includes(key)) continue
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, subject)
      continue
    }

    if (subjectRank(subject.title) > subjectRank(current.title)) {
      byKey.set(key, subject)
    }
  }

  return allowedSubjectKeys
    .map((key) => byKey.get(key) ?? fallbacks.find((subject) => subjectKey(subject.title) === key))
    .filter((subject): subject is SubjectCard => Boolean(subject))
}

function subjectKey(title: string) {
  const normalized = normalizeSubjectTitle(title)
  if (['math', 'maths', 'mathematics', 'mathematiques'].includes(normalized)) return 'math'
  if (normalized.includes('physique') || normalized.includes('physics')) return 'physics'
  if (normalized.includes('chemistry') || normalized.includes('chimie')) return 'physics'
  if (normalized.includes('philosophy') || normalized.includes('philosophie')) return 'philosophy'
  if (normalized.includes('sciences de la vie') || normalized === 'svt' || normalized.includes('biology')) return 'biology'
  if (normalized.includes('english') || normalized.includes('anglais')) return 'english'
  return normalized
}

function canonicalSubjectTitle(title: string) {
  const key = subjectKey(title)
  if (key === 'math') return 'Math'
  if (key === 'physics') return 'Physics'
  if (key === 'philosophy') return 'Philosophy'
  if (key === 'biology') return 'Biology'
  if (key === 'english') return 'English'
  return title
}

function subjectRank(title: string) {
  const canonical = canonicalSubjectTitle(title)
  if (title === canonical) return 3
  if (title.length > 4) return 2
  return 1
}

function normalizeSubjectTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const allowedSubjectKeys = ['math', 'physics', 'philosophy', 'biology', 'english']

const fallbackSubjects: SubjectCard[] = [
  { id: 'math', title: 'Math' },
  { id: 'physics', title: 'Physics' },
  { id: 'philosophy', title: 'Philosophy' },
  { id: 'biology', title: 'Biology' },
  { id: 'english', title: 'English' },
]

const fallbackContinueTopics: FigmaHomeTopic[] = [
  {
    id: 'math-logic',
    subject_title: 'Mathematics',
    title: 'Mathematics',
    description: 'Improve your math skills by solving logic problems',
    progress_pct: 12,
    href: '/courses?subject=Mathematics&filter=Recommended',
  },
  {
    id: 'geography-earth',
    subject_title: 'Geography',
    title: 'Geography',
    description: 'Get to know your home planet better by exploring',
    progress_pct: 46,
    href: '/courses?subject=Geography&filter=Recommended',
  },
]
