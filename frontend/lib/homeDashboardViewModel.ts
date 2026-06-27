import type { FigmaHomeSubject, FigmaHomeTopic } from '@/components/figma/home'
import {
  DEFAULT_SUBJECT_SHORTCUT_KEYS,
  canonicalSubjectTitle,
  subjectKey,
} from '@/lib/subjectIdentity'

export { canonicalSubjectTitle, normalizeSubjectTitle, subjectKey } from '@/lib/subjectIdentity'

export interface HomeTopicCard {
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

export interface HomeSubjectCard {
  id: number | string
  title: string
  description?: string
  progress_pct?: number
}

const allowedSubjectKeys = DEFAULT_SUBJECT_SHORTCUT_KEYS

export function toHomeContinueTopics(topics: HomeTopicCard[], limit = 2): FigmaHomeTopic[] {
  return pickContinueTopics(topics, limit).map((topic) => ({
    id: topic.id,
    subject_title: topic.subject_title,
    title: topic.title,
    description: topic.description,
    progress_pct: topic.progress_pct,
    item_count: topic.item_count,
    completed_count: topic.completed_count,
    href: `/topics/${topic.id}`,
  }))
}

export function toHomeSubjectShortcuts(subjects: HomeSubjectCard[]): FigmaHomeSubject[] {
  return buildSubjectShortcuts(subjects).map((subject) => {
    const title = canonicalSubjectTitle(subject.title)

    return {
      id: subject.id,
      title,
      description: subject.description,
      progress_pct: subject.progress_pct,
      href: `/courses?subject=${encodeURIComponent(title)}`,
    }
  })
}

export function pickContinueTopics(topics: HomeTopicCard[], limit: number) {
  const seen = new Set<number>()
  const picked: HomeTopicCard[] = []

  function add(topic: HomeTopicCard, includeLocked = false) {
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

export function buildSubjectShortcuts(subjects: HomeSubjectCard[]) {
  const byKey = new Map<string, HomeSubjectCard>()

  for (const subject of subjects) {
    const key = subjectKey(subject.title)
    if (!allowedSubjectKeys.includes(key as (typeof allowedSubjectKeys)[number])) continue
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
    .map((key) => byKey.get(key))
    .filter((subject): subject is HomeSubjectCard => Boolean(subject))
}

function subjectRank(title: string) {
  const canonical = canonicalSubjectTitle(title)
  if (title === canonical) return 3
  if (title.length > 4) return 2
  return 1
}
