export type WatchSectionType = 'video' | 'quiz' | 'activity' | 'text'
export type WatchTab = 'overview' | 'notes' | 'support' | 'lab'

export interface WatchSection {
  id: number
  title: string
  section_type: WatchSectionType
  activity_type?: string
  order: number
  duration_seconds?: number
  is_free_preview?: boolean
  is_completed?: boolean
  is_locked?: boolean
  video_url?: string
  text_content?: string
  content?: string
  quiz_data?: { questions: { text: string; options: { text: string; is_correct: boolean }[] }[] }
  pass_score?: number
  activity_data?: any
  chapter_id: number
}

export interface WatchChapterInfo {
  id: number
  title: string
  subject_id: number
  subject_title: string
}

export interface WatchChapter {
  id: number
  title: string
  description?: string
  order: number
  sections: WatchSection[]
}

export interface WatchContext {
  section: WatchSection
  chapter: WatchChapter
  subject_id: number
  subject_title: string
  chapters: WatchChapter[]
}

export type WatchCompletionOptions = {
  score?: number
  correct_answers?: number
  total_questions?: number
  answers?: Record<string, number>
}

export type WatchTabDescriptor = {
  id: WatchTab
  label: string
}

export type WatchNextDestination =
  | { kind: 'section'; href: string; section: WatchSection }
  | { kind: 'subject'; href: string; subjectId: number }

export function userScopedStorageKey(baseKey: string, userId?: string | number | null) {
  return `${baseKey}:user_${userId ?? 'anonymous'}`
}

export function getWatchNotesKey(sectionId: string | number, userId?: string | number | null) {
  return userScopedStorageKey(`kresco_notes_${sectionId}`, userId)
}

export function getWatchSectionId(sectionId: string | number) {
  const parsed = Number.parseInt(String(sectionId), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function getCurrentWatchChapter(context: WatchContext) {
  return context.chapters.find((chapter) => chapter.id === context.chapter.id) ?? context.chapter
}

export function toWatchChapterInfo(context: WatchContext): WatchChapterInfo {
  return {
    id: context.chapter.id,
    title: context.chapter.title,
    subject_id: context.subject_id,
    subject_title: context.subject_title,
  }
}

export function buildWatchChapterSections(chapters: WatchChapter[]) {
  return chapters.reduce<Record<number, WatchSection[]>>((sectionsByChapter, chapter) => {
    sectionsByChapter[chapter.id] = chapter.sections
    return sectionsByChapter
  }, {})
}

export function canUseWatchLab(section?: WatchSection | null) {
  return section?.section_type === 'video' && Boolean(section.activity_type)
}

export function canUseWatchSupport(section?: WatchSection | null) {
  return section?.section_type === 'video'
}

export function normalizeWatchTab(tab: WatchTab, section?: WatchSection | null): WatchTab {
  if (tab === 'lab' && !canUseWatchLab(section)) return 'overview'
  if (tab === 'support' && !canUseWatchSupport(section)) return 'overview'
  return tab
}

export function buildWatchTabs(section: WatchSection): WatchTabDescriptor[] {
  return [
    { id: 'overview', label: 'Apercu' },
    ...(canUseWatchLab(section) ? [{ id: 'lab' as WatchTab, label: 'Lab' }] : []),
    { id: 'notes', label: 'Mes notes' },
    ...(canUseWatchSupport(section) ? [{ id: 'support' as WatchTab, label: 'Support du cours' }] : []),
  ]
}

export function getWatchSectionProgressLabel(sections: WatchSection[], sectionId: string | number) {
  if (sections.length === 0) return ''
  const currentIndex = sections.findIndex((item) => item.id === getWatchSectionId(sectionId))
  if (currentIndex < 0) return ''
  return `Section ${currentIndex + 1}/${sections.length}`
}

export function getNextWatchDestination(section: WatchSection | null, sections: WatchSection[], chapterInfo: WatchChapterInfo | null): WatchNextDestination | null {
  if (!section || sections.length === 0) return null

  const currentIndex = sections.findIndex((item) => item.id === section.id)
  if (currentIndex >= 0 && currentIndex < sections.length - 1) {
    const next = sections[currentIndex + 1]
    return { kind: 'section', href: `/watch/${next.id}`, section: next }
  }

  if (chapterInfo) return { kind: 'subject', href: `/home/${chapterInfo.subject_id}`, subjectId: chapterInfo.subject_id }
  return null
}

export function shouldLoadWatchPdfs(section?: WatchSection | null) {
  return section?.section_type === 'video'
}

export function buildWatchSectionCompletePayload(sectionId: string | number, opts?: WatchCompletionOptions) {
  return {
    section_id: getWatchSectionId(sectionId),
    score: opts?.score ?? 0,
    correct_answers: opts?.correct_answers ?? 0,
    total_questions: opts?.total_questions ?? 0,
    answers: opts?.answers ?? {},
  }
}

export function getWatchCompletionFeedback(xpEarned: number) {
  if (xpEarned > 0) {
    return {
      toastMessage: `+${xpEarned} XP ! Section terminee !`,
      mascotMood: 'love' as const,
      mascotMessage: `+${xpEarned} XP !`,
    }
  }

  return {
    toastMessage: 'Section terminee ! Excellent travail.',
    mascotMood: 'happy' as const,
    mascotMessage: 'Bravo ! Section terminee !',
  }
}

export function getWatchDocumentTitle(section: WatchSection) {
  return `${section.title} - Kresco`
}

export function getWatchTextHtml(section: WatchSection) {
  return section.text_content || section.content || '<p>Aucun contenu disponible.</p>'
}
