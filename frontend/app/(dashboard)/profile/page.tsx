'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { getMyProfile, updateMyProfile, uploadProfileMedia, type ProfileUser } from '@/lib/profile'
import { useAuthStore } from '@/lib/store'
import {
  FigmaProfile,
  toProfileSubject,
  type FigmaProfileEditDraft,
  type FigmaProfileMediaKind,
  type FigmaProfileStats,
  type FigmaProfileSubject,
  type FigmaProfileXP,
  type PermanentSidebarCalendarDay,
  type PermanentSidebarCountdownUnit,
  type PermanentSidebarLeaderboardEntry,
  type PermanentSidebarLiveEvent,
} from '@/components/figma'

type SubjectCard = {
  id: number | string
  title: string
  progress_pct?: number
}

type TopicCard = {
  id: number
  subject_title: string
  progress_pct?: number
}

type SidebarSummary = {
  chrono_units?: PermanentSidebarCountdownUnit[]
  calendar_days?: PermanentSidebarCalendarDay[]
  live_events?: PermanentSidebarLiveEvent[]
  leaderboard_entries?: PermanentSidebarLeaderboardEntry[]
}

type ProfileStatsResult = {
  total_watch_minutes: number
  quizzes_passed: number
  lessons_completed: number
  is_pro: boolean
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [profile, setProfile] = useState<ProfileUser | null>(null)
  const [xp, setXp] = useState<FigmaProfileXP | null>(null)
  const [stats, setStats] = useState<FigmaProfileStats | null>(null)
  const [subjects, setSubjects] = useState<SubjectCard[]>([])
  const [topics, setTopics] = useState<TopicCard[]>([])
  const [sidebar, setSidebar] = useState<SidebarSummary>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => { document.title = 'Profile - Kresco' }, [])

  useEffect(() => {
    let alive = true

    async function loadProfile() {
      setLoading(true)
      const [profileResult, xpResult, statsResult, subjectsResult, topicsResult, sidebarResult] = await Promise.allSettled([
        getMyProfile(),
        api.get('/progress/xp'),
        api.get('/progress/stats'),
        api.get('/courses/subjects'),
        api.get('/courses/topics'),
        api.get('/progress/sidebar-summary'),
      ])

      if (!alive) return

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value)
        updateUser(profileResult.value)
      } else {
        toast.error(getErrorMessage(profileResult.reason, 'Could not load profile details.'))
      }

      if (xpResult.status === 'fulfilled') setXp(xpResult.value.data)
      if (statsResult.status === 'fulfilled') setStats(toProfileStats(statsResult.value.data))
      if (subjectsResult.status === 'fulfilled') setSubjects(Array.isArray(subjectsResult.value.data) ? subjectsResult.value.data : [])
      if (topicsResult.status === 'fulfilled') setTopics(Array.isArray(topicsResult.value.data) ? topicsResult.value.data : [])
      if (sidebarResult.status === 'fulfilled') setSidebar(sidebarResult.value.data ?? {})

      setLoading(false)
    }

    loadProfile()

    return () => {
      alive = false
    }
  }, [updateUser])

  const profileSubjects = useMemo(() => buildProfileSubjects(subjects, topics), [subjects, topics])

  async function handleSaveProfile(draft: FigmaProfileEditDraft) {
    setSaving(true)
    setEditError(null)

    try {
      await updateMyProfile({
        full_name: draft.full_name.trim(),
        avatar_url: draft.avatar_url?.trim() ?? '',
        banner_url: draft.banner_url?.trim() ?? '',
        niveau: draft.level?.trim() ?? '',
        filiere: draft.track?.trim() ?? '',
      })
      const latestProfile = await getMyProfile()
      setProfile(latestProfile)
      updateUser(latestProfile)
      toast.success('Profile saved.')
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save profile.')
      setEditError(message)
      toast.error(message)
      throw new Error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSelectMedia(kind: FigmaProfileMediaKind) {
    setEditError(null)

    try {
      const file = await pickImageFile()
      if (!file) return undefined
      const mediaUrl = await uploadProfileMedia(kind, file)
      toast.success(`${kind === 'avatar' ? 'Avatar' : 'Banner'} uploaded. Save your profile to keep it.`)
      return mediaUrl
    } catch (error) {
      const message = getErrorMessage(error, 'Could not upload profile image.')
      setEditError(message)
      toast.error(message)
      throw new Error(message)
    }
  }

  return (
    <FigmaProfile
      user={profile ?? user}
      xp={xp}
      stats={stats}
      subjects={profileSubjects}
      sidebar={{
        chronoUnits: sidebar.chrono_units,
        calendarDays: sidebar.calendar_days,
        liveEvents: sidebar.live_events,
        leaderboardEntries: sidebar.leaderboard_entries,
      }}
      loading={loading}
      saving={saving}
      editError={editError}
      onSaveProfile={handleSaveProfile}
      onSelectMedia={handleSelectMedia}
    />
  )
}

function toProfileStats(raw: ProfileStatsResult): FigmaProfileStats {
  return {
    totalWatchMinutes: numberOrZero(raw.total_watch_minutes),
    quizzesPassed: numberOrZero(raw.quizzes_passed),
    lessonsCompleted: numberOrZero(raw.lessons_completed),
    isPro: Boolean(raw.is_pro),
  }
}

function buildProfileSubjects(subjects: SubjectCard[], topics: TopicCard[]): FigmaProfileSubject[] {
  const progressBySubject = new Map<string, number[]>()

  for (const topic of topics) {
    if (typeof topic.progress_pct !== 'number') continue
    const key = subjectKey(topic.subject_title)
    const values = progressBySubject.get(key) ?? []
    values.push(topic.progress_pct)
    progressBySubject.set(key, values)
  }

  return subjects.map((subject, index) => {
    const topicValues = progressBySubject.get(subjectKey(subject.title))
    const progress = topicValues && topicValues.length > 0
      ? topicValues.reduce((sum, value) => sum + value, 0) / topicValues.length
      : subject.progress_pct
    return toProfileSubject(subject.title, progress, index)
  })
}

function numberOrZero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function pickImageFile() {
  return new Promise<File | null>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

function getErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as { response?: { data?: { detail?: unknown; message?: unknown }; status?: number } }
  const detail = maybeError?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  const message = maybeError?.response?.data?.message
  if (typeof message === 'string' && message.trim()) return message
  if (maybeError?.response?.status) return `${fallback} (${maybeError.response.status})`
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function subjectKey(title: string) {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (normalized.includes('math')) return 'math'
  if (normalized.includes('phys')) return 'physics'
  if (normalized.includes('chem') || normalized.includes('chim')) return 'chemistry'
  if (normalized.includes('geo')) return 'geography'
  if (normalized.includes('bio') || normalized.includes('svt')) return 'biology'
  if (normalized.includes('philo')) return 'philosophy'
  if (normalized.includes('english') || normalized.includes('anglais')) return 'english'
  return normalized.replace(/\W+/g, '-')
}
