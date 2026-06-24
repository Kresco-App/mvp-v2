import { getBackendUrl } from '@/lib/apiConfig'
import { getLeagueInfoByKey, rankToLeagueKey } from '@/lib/leaderboardLeagues'
import { canonicalSubject as resolveCanonicalSubject } from '@/lib/subjectIdentity'
import { sanitizeNavigationUrl } from '@/lib/urlSafety'
import type {
  PermanentSidebarCalendarDay,
  PermanentSidebarCountdownUnit,
  PermanentSidebarLeaderboardEntry,
  PermanentSidebarLiveEvent,
} from '@/lib/permanentSidebarViewModel'

export type FigmaProfileUser = {
  full_name?: string
  email?: string
  avatar_url?: string
  banner_url?: string
  niveau?: string
  filiere?: string
  track?: string
  created_at?: string
}

export type FigmaProfileXP = {
  total_xp: number
  level: number
  xp_progress_pct?: number
  xp_for_current_level?: number
  xp_for_next_level?: number
  streak_days: number
}

export type FigmaProfileStats = {
  totalWatchMinutes: number
  quizzesPassed: number
  itemsCompleted: number
  isPro: boolean
}

export type FigmaProfileBadge = {
  slug: string
  title: string
  description: string
  category: string
  rarity: string
  earned: boolean
  earned_at?: string | null
  evidence?: Record<string, unknown>
}

export type FigmaProfileBadgeInventory = {
  badges: FigmaProfileBadge[]
  earned_count: number
  total_count: number
}

export type FigmaProfileSubject = {
  key: string
  title: string
  score: number
  caption: string
  tone: string
}

export type FigmaProfileSidebarData = {
  chronoUnits?: PermanentSidebarCountdownUnit[]
  calendarDays?: PermanentSidebarCalendarDay[]
  liveEvents?: PermanentSidebarLiveEvent[]
  leaderboardEntries?: PermanentSidebarLeaderboardEntry[]
}

export type FigmaProfileNote = {
  id: number
  topic_id?: number | null
  topic_item_id?: number | null
  tab_content_id?: number | null
  body: string
  updated_at?: string
}

export type FigmaProfileSavedItem = {
  id: number
  target_type: string
  target_id: number
  topic_id?: number | null
  topic_item_id?: number | null
  label?: string
  note?: string
  tags?: string[]
  created_at?: string
}

export type FigmaProfileHubItem = {
  id: string
  href: string
  title: string
  meta: string
  detail?: string
  tags?: string[]
}

export type FigmaProfileMediaKind = 'avatar' | 'banner'

export type FigmaProfileEditDraft = {
  full_name: string
  level?: string
  track?: string
  avatar_url?: string
  banner_url?: string
}

export const DEFAULT_PROFILE_BANNER_URL = '/figma-assets/profile/profile-cover.png'
export const DEFAULT_PROFILE_AVATAR_URL = '/figma-assets/profile/profile-avatar.png'

export const fallbackSubjects: FigmaProfileSubject[] = [
  { key: 'math', title: 'Mathematics', score: 56, caption: "You're doing good keep it up", tone: '#ff8904' },
  { key: 'physics', title: 'Physics', score: 32, caption: 'Almost there, just a little more effort', tone: '#ff6467' },
  { key: 'chemistry', title: 'Chemistry', score: 93, caption: 'Oh my god, are you Mendeleev', tone: '#009966' },
  { key: 'geography', title: 'Geography', score: 64, caption: 'Cool, you know your continents!', tone: '#009966' },
  { key: 'biology', title: 'Biology', score: 80, caption: 'Cells, genetics, and steady wins', tone: '#453dee' },
  { key: 'philosophy', title: 'Philosophy', score: 72, caption: 'Clear arguments are paying off', tone: '#707fff' },
  { key: 'english', title: 'English', score: 68, caption: 'Vocabulary and writing are growing', tone: '#51a2ff' },
]

const fallbackBadgeCatalog = [
  {
    slug: 'xp_100',
    title: 'Premiers 100 XP',
    description: 'Atteindre 100 XP au total.',
    category: 'xp',
    rarity: 'common',
  },
  {
    slug: 'xp_500',
    title: 'Rythme solide',
    description: 'Atteindre 500 XP au total.',
    category: 'xp',
    rarity: 'rare',
  },
  {
    slug: 'streak_7',
    title: 'Semaine active',
    description: "Maintenir 7 jours d'activite.",
    category: 'streak',
    rarity: 'rare',
  },
  {
    slug: 'first_exercise_mastered',
    title: 'Premier exercice maitrise',
    description: 'Marquer un exercice comme maitrise.',
    category: 'exercise',
    rarity: 'common',
  },
  {
    slug: 'first_exam_completed',
    title: 'Premiere capsule Bac terminee',
    description: "Terminer une capsule de probleme d'examen.",
    category: 'exam',
    rarity: 'rare',
  },
  {
    slug: 'first_mistake_corrected',
    title: 'Erreur corrigee',
    description: 'Corriger une question precedemment ratee.',
    category: 'revision',
    rarity: 'rare',
  },
] satisfies Array<Omit<FigmaProfileBadge, 'earned'>>

export function normalizeSubjects(subjects: FigmaProfileSubject[]) {
  if (subjects.length === 0) return fallbackSubjects.slice(0, 6)

  const merged = new Map<string, FigmaProfileSubject>()
  for (const subject of subjects) merged.set(subject.key, subject)
  return Array.from(merged.values())
}

export function getUsername(user: FigmaProfileUser | null) {
  if (!user?.email) return 'ahmedmalik547'
  return user.email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 28) || 'student'
}

export function getJoinedDate(value?: string) {
  if (!value) return 'Joined July 2026'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Joined July 2026'
  return `Joined ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
}

export function buildEditDraft(user: FigmaProfileUser | null, xp: FigmaProfileXP | null): FigmaProfileEditDraft {
  return {
    full_name: user?.full_name || 'Ahmed Malik',
    level: user?.niveau || (typeof xp?.level === 'number' ? String(xp.level) : ''),
    track: user?.filiere || user?.track || '',
    avatar_url: user?.avatar_url || DEFAULT_PROFILE_AVATAR_URL,
    banner_url: user?.banner_url || DEFAULT_PROFILE_BANNER_URL,
  }
}

export function getLeagueLabel(level = 4, entries?: PermanentSidebarLeaderboardEntry[]) {
  const currentEntry = entries?.find((entry) => entry.is_current_user)
  if (currentEntry?.rank) return getLeagueInfoByKey(rankToLeagueKey(currentEntry.rank)).label

  if (level >= 16) return 'Ruby IV'
  if (level >= 11) return 'Emerald IV'
  if (level >= 6) return 'Sapphire IV'
  return 'Bronze IV'
}

export function getFollowers(entries?: PermanentSidebarLeaderboardEntry[]) {
  const fallbacks: PermanentSidebarLeaderboardEntry[] = [
    { rank: 1, user_id: 1, full_name: 'Fatima Ansari', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-fatima.png' },
    { rank: 2, user_id: 2, full_name: 'Ahmed Malik', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-ahmed.png' },
    { rank: 3, user_id: 3, full_name: 'Aymen Ben Hamou', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-aymen.png' },
    { rank: 4, user_id: 4, full_name: 'Ibtisam Mahir', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-ibtisam.png' },
  ]

  if (!entries || entries.length === 0) return fallbacks
  const nonCurrentEntries = entries.filter((entry) => !entry.is_current_user)
  const source = nonCurrentEntries.length > 0 ? nonCurrentEntries : entries
  return source.slice(0, 5).map((entry, index) => ({
    ...entry,
    avatar_url: entry.avatar_url || followerAvatar(index),
  }))
}

export function formatWatchTime(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes))
  if (safeMinutes < 60) return `${safeMinutes}m`
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

export function buildProfileBadgeItems(
  inventory: FigmaProfileBadgeInventory | null | undefined,
  xp: FigmaProfileXP | null | undefined,
  stats: FigmaProfileStats | null | undefined,
  limit = 6,
): FigmaProfileBadge[] {
  const source = inventory?.badges?.length ? inventory.badges : buildFallbackBadges(xp, stats)
  return source
    .map(normalizeProfileBadge)
    .sort((left, right) => Number(right.earned) - Number(left.earned))
    .slice(0, limit)
}

export function profileBadgeSummary(
  inventory: FigmaProfileBadgeInventory | null | undefined,
  badges: FigmaProfileBadge[],
) {
  const fallbackEarned = badges.filter((badge) => badge.earned).length
  const fallbackTotal = badges.length
  const totalCount = positiveIntOrFallback(inventory?.total_count, fallbackTotal)
  const earnedCount = Math.min(positiveIntOrFallback(inventory?.earned_count, fallbackEarned), totalCount)
  return { earnedCount, totalCount: Math.max(totalCount, fallbackTotal) }
}

export function formatProfileBadgeStatus(badge: FigmaProfileBadge) {
  if (badge.earned) {
    const earnedAt = formatProfileHubDate(badge.earned_at ?? undefined)
    return earnedAt === 'Recent' ? 'Earned' : `Earned ${earnedAt}`
  }
  return badge.description || 'Locked'
}

export function buildProfileNoteHubItems(notes: FigmaProfileNote[], limit: number): FigmaProfileHubItem[] {
  return notes.slice(0, limit).map((note) => ({
    id: `note-${note.id}`,
    href: profileNoteHref(note),
    title: note.body,
    meta: formatProfileHubDate(note.updated_at),
  }))
}

export function buildProfileSaveHubItems(saves: FigmaProfileSavedItem[], limit: number): FigmaProfileHubItem[] {
  return saves.slice(0, limit).map((save) => {
    const targetLabel = profileTargetLabel(save.target_type)
    const detail = typeof save.note === 'string' ? save.note.trim() : ''
    const tags = normalizeProfileSaveTags(save.tags).slice(0, 3)

    return {
      id: `save-${save.id}`,
      href: profileSavedItemHref(save),
      title: save.label?.trim() || `${targetLabel} #${save.target_id}`,
      meta: formatProfileSaveMeta(save),
      ...(detail ? { detail } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    }
  })
}

export function profileSavedItemHref(save: FigmaProfileSavedItem) {
  const topicHref = profileTopicDeepLink(save.topic_id, save.topic_item_id)

  if (save.target_type === 'exam_problem') {
    return withQuery('/exam-bank', {
      problem: save.target_id,
      topic: save.topic_id,
    })
  }

  if (save.target_type === 'topic' || save.target_type === 'topic_item') {
    return topicHref
  }

  if (save.target_type === 'tab_content' && topicHref !== '/profile') {
    return appendQuery(topicHref, { tab: save.target_id })
  }

  if (save.target_type === 'resource' && topicHref !== '/profile') {
    return appendQuery(topicHref, { resource: save.target_id })
  }

  if (save.target_type === 'quiz' && topicHref !== '/profile') {
    return appendQuery(topicHref, { quiz: save.target_id })
  }

  if (save.target_type === 'question' && topicHref !== '/profile') {
    return appendQuery(topicHref, { question: save.target_id })
  }

  return topicHref
}

export function profileTopicDeepLink(topicId?: number | null, topicItemId?: number | null) {
  if (!topicId) return '/profile'
  return withQuery(`/topics/${topicId}`, { item: topicItemId })
}

export function profileNoteHref(note: FigmaProfileNote) {
  const topicHref = profileTopicDeepLink(note.topic_id, note.topic_item_id)
  if (!note.tab_content_id || topicHref === '/profile') return topicHref
  return appendQuery(topicHref, { tab: note.tab_content_id })
}

export function formatProfileHubDate(value?: string) {
  if (!value) return 'Recent'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function profileTargetLabel(targetType: string) {
  const normalized = targetType.trim().toLowerCase()
  const labels: Record<string, string> = {
    exam_problem: 'Exam problem',
    question: 'Question',
    quiz: 'Quiz',
    resource: 'Resource',
    tab_content: 'Lesson section',
    topic: 'Topic',
    topic_item: 'Lesson',
  }

  if (!normalized) return 'Saved item'
  return labels[normalized] ?? normalized.replace(/_/g, ' ')
}

export function formatProfileSaveMeta(save: FigmaProfileSavedItem) {
  const targetLabel = profileTargetLabel(save.target_type)
  const savedAt = formatProfileHubDate(save.created_at)
  return save.created_at && savedAt !== 'Recent' ? `${targetLabel} - ${savedAt}` : targetLabel
}

export function normalizeProfileSaveTags(tags?: string[]) {
  const normalizedTags: string[] = []
  const seen = new Set<string>()

  for (const value of tags ?? []) {
    const tag = value.trim().replace(/\s+/g, ' ')
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalizedTags.push(tag.slice(0, 32))
  }

  return normalizedTags
}

export function followerAvatar(index: number) {
  return [
    '/figma-assets/profile/follower-fatima.png',
    '/figma-assets/profile/follower-ahmed.png',
    '/figma-assets/profile/follower-aymen.png',
    '/figma-assets/profile/follower-ibtisam.png',
  ][index % 4]
}

function appendQuery(href: string, params: Record<string, number | string | null | undefined>) {
  const [path, query = ''] = href.split('?')
  const search = new URLSearchParams(query)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const nextQuery = search.toString()
  return nextQuery ? `${path}?${nextQuery}` : path
}

function withQuery(path: string, params: Record<string, number | string | null | undefined>) {
  return appendQuery(path, params)
}

function buildFallbackBadges(
  xp: FigmaProfileXP | null | undefined,
  stats: FigmaProfileStats | null | undefined,
) {
  const totalXp = Math.max(0, xp?.total_xp ?? 0)
  const streakDays = Math.max(0, xp?.streak_days ?? 0)
  const itemsCompleted = Math.max(0, stats?.itemsCompleted ?? 0)
  const quizzesPassed = Math.max(0, stats?.quizzesPassed ?? 0)

  return fallbackBadgeCatalog.map((badge) => ({
    ...badge,
    earned:
      (badge.slug === 'xp_100' && totalXp >= 100) ||
      (badge.slug === 'xp_500' && totalXp >= 500) ||
      (badge.slug === 'streak_7' && streakDays >= 7) ||
      (badge.slug === 'first_exercise_mastered' && itemsCompleted > 0) ||
      (badge.slug === 'first_exam_completed' && itemsCompleted >= 5) ||
      (badge.slug === 'first_mistake_corrected' && quizzesPassed > 0),
  }))
}

function normalizeProfileBadge(badge: FigmaProfileBadge): FigmaProfileBadge {
  return {
    slug: badge.slug || 'badge',
    title: badge.title || 'Learning badge',
    description: badge.description || 'Keep learning to unlock this badge.',
    category: badge.category || 'progress',
    rarity: badge.rarity || 'common',
    earned: Boolean(badge.earned),
    earned_at: badge.earned_at ?? null,
    evidence: badge.evidence ?? {},
  }
}

function positiveIntOrFallback(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback
}

export function mediaUrl(value?: string) {
  if (!value) return ''
  if (value.startsWith('/figma-assets/')) return value
  const safeUrl = sanitizeNavigationUrl(value)
  return safeUrl || getBackendUrl(value)
}

export function polarPoint(cx: number, cy: number, r: number, index: number, total: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total
  return {
    x: Number((cx + Math.cos(angle) * r).toFixed(2)),
    y: Number((cy + Math.sin(angle) * r).toFixed(2)),
  }
}

export function ringPoints(center: number, radius: number, total: number) {
  return Array.from({ length: total }, (_, index) => {
    const point = polarPoint(center, center, radius, index, total)
    return `${point.x},${point.y}`
  }).join(' ')
}

export { canonicalSubject } from '@/lib/subjectIdentity'

export function toProfileSubject(title: string, progress: number | undefined, index: number): FigmaProfileSubject {
  const canonical = resolveCanonicalSubject(title)
  const fallback = fallbackSubjects.find((subject) => subject.key === canonical.key) ?? fallbackSubjects[index % fallbackSubjects.length]
  const score = clampScore(progress ?? fallback.score)

  return {
    key: canonical.key,
    title: canonical.title,
    score,
    caption: scoreCaption(canonical.key, score),
    tone: scoreTone(score, index),
  }
}

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function scoreTone(score: number, index: number) {
  if (score < 45) return '#ff6467'
  if (score < 60) return '#ff8904'
  if (score >= 85) return '#009966'
  return ['#453dee', '#51a2ff', '#707fff'][index % 3]
}

export function scoreCaption(key: string, score: number) {
  if (key === 'chemistry' && score >= 85) return 'Oh my god, are you Mendeleev'
  if (key === 'geography') return 'Cool, you know your continents!'
  if (score < 45) return 'Almost there, just a little more effort'
  if (score < 65) return "You're doing good keep it up"
  return 'Strong progress, keep the rhythm'
}
