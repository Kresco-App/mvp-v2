import useSWR from 'swr'
import { subjectKey } from '@/lib/subjectIdentity'
import { type ProfileUser } from '@/lib/profile'
import {
  toProfileSubject,
  type FigmaProfileNote,
  type FigmaProfileSavedItem,
  type FigmaProfileStats,
  type FigmaProfileSubject,
  type FigmaProfileXP,
  type PermanentSidebarCalendarDay,
  type PermanentSidebarCountdownUnit,
  type PermanentSidebarLeaderboardEntry,
  type PermanentSidebarLiveEvent,
} from '@/components/figma'

export const PROFILE_ME_KEY = '/profile/me'
export const PROFILE_XP_KEY = '/progress/xp'
export const PROFILE_STATS_KEY = '/progress/stats'
export const PROFILE_SUBJECTS_KEY = '/courses/subjects'
export const PROFILE_TOPICS_KEY = '/courses/topics'
export const PROFILE_NOTES_KEY = '/interactions/notes'
export const PROFILE_SAVES_KEY = '/interactions/saves'
export const PROFILE_SIDEBAR_KEY = '/progress/sidebar-summary'

export type SubjectCard = {
  id: number | string
  title: string
  progress_pct?: number
}

export type TopicCard = {
  id: number
  subject_title: string
  progress_pct?: number
}

export type SidebarSummary = {
  chrono_units?: PermanentSidebarCountdownUnit[]
  calendar_days?: PermanentSidebarCalendarDay[]
  live_events?: PermanentSidebarLiveEvent[]
  leaderboard_entries?: PermanentSidebarLeaderboardEntry[]
}

export type ProfileStatsResult = {
  total_watch_minutes: number
  quizzes_passed: number
  lessons_completed: number
  is_pro: boolean
}

export function useProfileData() {
  const profileQuery = useSWR<ProfileUser>(PROFILE_ME_KEY)
  const xpQuery = useSWR<FigmaProfileXP>(PROFILE_XP_KEY)
  const statsQuery = useSWR<ProfileStatsResult>(PROFILE_STATS_KEY)
  const subjectsQuery = useSWR<SubjectCard[]>(PROFILE_SUBJECTS_KEY)
  const topicsQuery = useSWR<TopicCard[]>(PROFILE_TOPICS_KEY)
  const notesQuery = useSWR<FigmaProfileNote[]>(PROFILE_NOTES_KEY)
  const savesQuery = useSWR<FigmaProfileSavedItem[]>(PROFILE_SAVES_KEY)
  const sidebarQuery = useSWR<SidebarSummary>(PROFILE_SIDEBAR_KEY)
  const queries = [
    profileQuery,
    xpQuery,
    statsQuery,
    subjectsQuery,
    topicsQuery,
    notesQuery,
    savesQuery,
    sidebarQuery,
  ]
  const subjects = arrayOrEmpty(subjectsQuery.data)
  const topics = arrayOrEmpty(topicsQuery.data)

  return {
    profile: profileQuery.data ?? null,
    xp: xpQuery.data ?? null,
    stats: statsQuery.data ? toProfileStats(statsQuery.data) : null,
    subjects,
    topics,
    profileSubjects: buildProfileSubjects(subjects, topics),
    notes: arrayOrEmpty(notesQuery.data),
    saves: arrayOrEmpty(savesQuery.data),
    sidebar: sidebarQuery.data ?? {},
    loading: queries.some((query) => query.isLoading) && !queries.some((query) => query.data !== undefined || query.error),
    error: queries.find((query) => query.error)?.error ?? null,
    isValidating: queries.some((query) => query.isValidating),
    retry: () => Promise.all(queries.map((query) => query.mutate())),
    mutateProfile: profileQuery.mutate,
  }
}

export function toProfileStats(raw: ProfileStatsResult): FigmaProfileStats {
  return {
    totalWatchMinutes: numberOrZero(raw.total_watch_minutes),
    quizzesPassed: numberOrZero(raw.quizzes_passed),
    lessonsCompleted: numberOrZero(raw.lessons_completed),
    isPro: Boolean(raw.is_pro),
  }
}

export function buildProfileSubjects(subjects: SubjectCard[], topics: TopicCard[]): FigmaProfileSubject[] {
  const progressBySubject = new Map<string, { sum: number; count: number }>()

  for (const topic of topics) {
    if (typeof topic.progress_pct !== 'number') continue
    const key = subjectKey(topic.subject_title)
    const current = progressBySubject.get(key) ?? { sum: 0, count: 0 }
    current.sum += topic.progress_pct
    current.count += 1
    progressBySubject.set(key, current)
  }

  return subjects.map((subject, index) => {
    const topicProgress = progressBySubject.get(subjectKey(subject.title))
    const progress = topicProgress && topicProgress.count > 0
      ? topicProgress.sum / topicProgress.count
      : subject.progress_pct
    return toProfileSubject(subject.title, progress, index)
  })
}

function arrayOrEmpty<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function numberOrZero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
