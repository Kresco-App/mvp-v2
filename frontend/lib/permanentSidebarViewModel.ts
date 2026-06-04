export type FigmaDailyQuest = {
  id: number | string
  quest_type?: string
  title: string
  target: number
  progress: number
  xp_reward?: number
  completed?: boolean
}

export type PermanentSidebarLeaderboardEntry = {
  rank: number
  user_id: number
  full_name: string
  avatar_url?: string
  total_xp: number
  level?: number
  is_current_user?: boolean
  href?: string
}

export type PermanentSidebarCountdownUnit = {
  value: number | string
  label: string
}

export type PermanentSidebarCalendarDay = {
  id?: number | string
  value: number | string
  label: string
  active?: boolean
}

export type PermanentSidebarLiveEvent = {
  id: number | string
  title: string
  startsAt?: string
  starts_at?: string
  subject: string
  href?: string
  status?: string
}

export type PermanentSidebarStrikeDay = {
  label: string
  done?: boolean
}

export type PermanentSidebarData = {
  chronoUnits?: PermanentSidebarCountdownUnit[]
  chrono_units?: PermanentSidebarCountdownUnit[]
  calendarDays?: PermanentSidebarCalendarDay[]
  calendar_days?: PermanentSidebarCalendarDay[]
  liveEvents?: PermanentSidebarLiveEvent[]
  live_events?: PermanentSidebarLiveEvent[]
  strikeDays?: PermanentSidebarStrikeDay[]
  strike_days?: PermanentSidebarStrikeDay[]
  quests?: FigmaDailyQuest[]
  leaderboardEntries?: PermanentSidebarLeaderboardEntry[]
  leaderboard_entries?: PermanentSidebarLeaderboardEntry[]
}

export type PermanentSidebarSection = 'chrono' | 'calendar' | 'strike' | 'quests' | 'leaderboard'
export type QuestToneSurface = 'home' | 'sidebar'

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const defaultQuestLabels = [
  'Complete 1 Mathematics Lesson',
  'Score 14/20 or higher in 2 exercises',
  'Spend 15min In studying Physics',
]

export const permanentSidebarCountdownDefaults: PermanentSidebarCountdownUnit[] = [
  { value: 8, label: 'Month' },
  { value: 3, label: 'Week' },
  { value: 14, label: 'Day' },
  { value: 16, label: 'Hour' },
  { value: 45, label: 'Minute' },
]

export const permanentSidebarCalendarDefaults = buildPermanentSidebarCalendarDays()

export const permanentSidebarStrikeDefaults: PermanentSidebarStrikeDay[] = [
  { label: 'Mon', done: true },
  { label: 'Tue', done: true },
  { label: 'Wed' },
  { label: 'Thu' },
  { label: 'Fri' },
  { label: 'Sat' },
  { label: 'Sun' },
]

export const dailyQuestDefaults: FigmaDailyQuest[] = [
  { id: 'lesson', quest_type: 'lesson', title: defaultQuestLabels[0], progress: 3, target: 4 },
  { id: 'quiz', quest_type: 'quiz', title: defaultQuestLabels[1], progress: 1, target: 5 },
  { id: 'study', quest_type: 'study_time', title: defaultQuestLabels[2], progress: 2, target: 6 },
]

export const permanentSidebarQuestDefaults = dailyQuestDefaults

export const permanentSidebarLiveEventDefaults: PermanentSidebarLiveEvent[] = []

export const permanentSidebarLeaderboardDefaults: PermanentSidebarLeaderboardEntry[] = [
  { rank: 1, user_id: 1, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 2, user_id: 2, full_name: 'Fatima Ansari', total_xp: 541135 },
  { rank: 3, user_id: 3, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 4, user_id: 4, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 5, user_id: 5, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 6, user_id: 6, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 7, user_id: 7, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 8, user_id: 8, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 9, user_id: 9, full_name: 'Ahmed Malik', total_xp: 542541 },
  { rank: 10, user_id: 10, full_name: 'Ahmed Malik', total_xp: 542541 },
]

export const permanentSidebarDefaultSections: PermanentSidebarSection[] = ['chrono', 'calendar', 'strike', 'quests', 'leaderboard']

export function normalizeQuests(quests: FigmaDailyQuest[]) {
  return quests.slice(0, 3).map((quest, index) => ({
    ...quest,
    title: quest.title?.trim() || defaultQuestLabels[index] || 'Daily quest',
  }))
}

export function buildPermanentSidebarCalendarDays(referenceDate = new Date()): PermanentSidebarCalendarDay[] {
  const activeDate = new Date(referenceDate)
  activeDate.setHours(0, 0, 0, 0)
  const startDate = new Date(activeDate)
  startDate.setDate(activeDate.getDate() - 7)

  return Array.from({ length: 21 }, (_, index) => {
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + index)
    return {
      id: toCalendarDateId(currentDate),
      value: currentDate.getDate(),
      label: weekdayLabels[currentDate.getDay()],
      active: currentDate.getTime() === activeDate.getTime(),
    }
  })
}

export function toClientSidebarData(raw: PermanentSidebarData): PermanentSidebarData {
  return {
    chronoUnits: raw.chronoUnits ?? raw.chrono_units ?? permanentSidebarCountdownDefaults,
    calendarDays: raw.calendarDays ?? raw.calendar_days ?? permanentSidebarCalendarDefaults,
    liveEvents: raw.liveEvents ?? raw.live_events ?? permanentSidebarLiveEventDefaults,
    strikeDays: raw.strikeDays ?? raw.strike_days ?? permanentSidebarStrikeDefaults,
    quests: raw.quests ?? [],
    leaderboardEntries: raw.leaderboardEntries ?? raw.leaderboard_entries ?? [],
  }
}

export function buildStrikeDays(streakDays: number, referenceDate = new Date()): PermanentSidebarStrikeDay[] {
  const totalDays = permanentSidebarStrikeDefaults.length
  const safeStreakDays = Math.max(0, Math.min(streakDays, totalDays))
  const todayIndex = (referenceDate.getDay() + 6) % totalDays
  const completedDays = new Set(
    Array.from({ length: safeStreakDays }, (_, offset) => wrapIndex(todayIndex - offset, totalDays)),
  )

  return permanentSidebarStrikeDefaults.map((day, index) => ({
    ...day,
    done: completedDays.has(index),
  }))
}

export function getCalendarStart(activeIndex: number, total: number, windowSize: number) {
  if (total <= 0) return 0
  return wrapIndex(activeIndex - Math.floor(Math.min(windowSize, total) / 2), total)
}

export function getCalendarWindow(days: PermanentSidebarCalendarDay[], start: number, windowSize: number) {
  if (days.length === 0) return []
  return Array.from({ length: Math.min(windowSize, days.length) }, (_, index) => days[wrapIndex(start + index, days.length)])
}

export function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

export function getCalendarDayKey(day: PermanentSidebarCalendarDay) {
  return `${day.id ?? day.value}-${day.label}`
}

export function getQuestProgressPercent(quest: Pick<FigmaDailyQuest, 'progress' | 'target'>) {
  return Math.max(0, Math.min(100, Math.round((quest.progress / Math.max(quest.target, 1)) * 100)))
}

export function getQuestTone(type: string | undefined, index: number, surface: QuestToneSurface = 'sidebar') {
  if (type?.includes('lesson')) return surface === 'home' ? '#ff8a00' : '#f5900b'
  if (type?.includes('quiz') || type?.includes('exercise')) return surface === 'home' ? '#5c5bff' : '#5b60f9'
  if (type?.includes('time') || type?.includes('study')) return '#2e86ff'
  return surface === 'home'
    ? ['#ff8a00', '#5c5bff', '#2e86ff'][index % 3]
    : ['#f5900b', '#5b60f9', '#2e86ff'][index % 3]
}

export function getLeaderboardAvatarSrc(entry: Pick<PermanentSidebarLeaderboardEntry, 'avatar_url'>, index: number) {
  if (entry.avatar_url) return entry.avatar_url
  return index === 1 ? '/figma-assets/sidebar-avatar-fatima.png' : '/figma-assets/sidebar-avatar-ahmed.png'
}

function toCalendarDateId(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
