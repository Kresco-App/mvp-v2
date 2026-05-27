import { describe, expect, it } from 'vitest'

import {
  buildWatchChapterSections,
  buildWatchSectionCompletePayload,
  buildWatchTabs,
  canUseWatchLab,
  getCurrentWatchChapter,
  getNextWatchDestination,
  getWatchCompletionFeedback,
  getWatchDocumentTitle,
  getWatchNotesKey,
  getWatchSectionProgressLabel,
  getWatchTextHtml,
  normalizeWatchTab,
  shouldLoadWatchPdfs,
  toWatchChapterInfo,
  type WatchChapter,
  type WatchContext,
  type WatchSection,
} from '@/lib/watchViewModel'

const videoSection: WatchSection = {
  id: 12,
  title: 'Wave lesson',
  section_type: 'video',
  activity_type: 'wave_lab',
  order: 1,
  duration_seconds: 120,
  chapter_id: 3,
}

const quizSection: WatchSection = {
  id: 13,
  title: 'Wave quiz',
  section_type: 'quiz',
  order: 2,
  chapter_id: 3,
}

const chapter: WatchChapter = {
  id: 3,
  title: 'Waves',
  order: 1,
  sections: [videoSection, quizSection],
}

const context: WatchContext = {
  section: videoSection,
  chapter,
  subject_id: 9,
  subject_title: 'Physics',
  chapters: [chapter],
}

describe('watch view model', () => {
  it('normalizes context and chapter sections', () => {
    expect(getCurrentWatchChapter(context)).toBe(chapter)
    expect(toWatchChapterInfo(context)).toEqual({
      id: 3,
      title: 'Waves',
      subject_id: 9,
      subject_title: 'Physics',
    })
    expect(buildWatchChapterSections([chapter])[3]).toEqual([videoSection, quizSection])
  })

  it('centralizes notes and completion payloads', () => {
    expect(getWatchNotesKey('12')).toBe('kresco_notes_12')
    expect(buildWatchSectionCompletePayload('12', { score: 80, correct_answers: 4, total_questions: 5 })).toEqual({
      section_id: 12,
      score: 80,
      correct_answers: 4,
      total_questions: 5,
    })
  })

  it('derives tab availability and progress labels by section type', () => {
    expect(canUseWatchLab(videoSection)).toBe(true)
    expect(shouldLoadWatchPdfs(videoSection)).toBe(true)
    expect(normalizeWatchTab('lab', quizSection)).toBe('overview')
    expect(buildWatchTabs(videoSection).map((tab) => tab.id)).toEqual(['overview', 'lab', 'notes', 'support'])
    expect(getWatchSectionProgressLabel(chapter.sections, quizSection.id)).toBe('Section 2/2')
    expect(getWatchSectionProgressLabel(chapter.sections, 999)).toBe('')
  })

  it('derives next navigation destinations', () => {
    expect(getNextWatchDestination(videoSection, chapter.sections, toWatchChapterInfo(context))).toMatchObject({
      kind: 'section',
      href: '/watch/13',
    })
    expect(getNextWatchDestination(quizSection, chapter.sections, toWatchChapterInfo(context))).toMatchObject({
      kind: 'subject',
      href: '/home/9',
    })
  })

  it('builds display fallback values and completion feedback', () => {
    expect(getWatchCompletionFeedback(25)).toMatchObject({ mascotMood: 'love', mascotMessage: '+25 XP !' })
    expect(getWatchCompletionFeedback(0)).toMatchObject({ mascotMood: 'happy' })
    expect(getWatchDocumentTitle(videoSection)).toBe('Wave lesson - Kresco')
    expect(getWatchTextHtml({ ...quizSection, text_content: '' })).toBe('<p>Aucun contenu disponible.</p>')
  })
})
