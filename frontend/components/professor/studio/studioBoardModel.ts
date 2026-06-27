import {
  nextKey,
  type StudioOperation,
  type WorkChapter,
  type WorkLesson,
  type WorkTab,
} from '@/lib/studio'

export type StudioSelection = { type: 'chapter' | 'lesson' | 'tab'; key: string } | null

export type StudioReadinessIssue = {
  key: string
  label: string
  detail: string
  level: 'blocker' | 'warning'
  target: StudioSelection
  chapterKey?: string
  lessonKey?: string
}

export type StudioReadiness = {
  blockers: StudioReadinessIssue[]
  warnings: StudioReadinessIssue[]
}

type OperationTarget = {
  selection: NonNullable<StudioSelection>
  chapterKey?: string
  lessonKey?: string
}

export type StudioSearchResult = {
  key: string
  label: string
  detail: string
  badge: 'chapter' | 'lesson' | 'tab'
  target: NonNullable<StudioSelection>
  chapterKey?: string
  lessonKey?: string
}

const VIDEO_LESSON_TYPES = new Set(['lesson_video', 'lesson'])
const TEXT_TAB_TYPES = new Set(['course', 'summary', 'text'])

export function cloneChapter(chapter: WorkChapter): WorkChapter {
  return {
    ...chapter,
    key: nextKey('chapter'),
    serverId: null,
    title: copyLabel(chapter.title),
    lessons: chapter.lessons.map(cloneLesson),
  }
}

export function cloneLesson(lesson: WorkLesson): WorkLesson {
  return {
    ...lesson,
    key: nextKey('lesson'),
    serverId: null,
    title: copyLabel(lesson.title),
    tabs: lesson.tabs.map(cloneTab),
  }
}

export function cloneTab(tab: WorkTab): WorkTab {
  return {
    ...tab,
    key: nextKey('tab'),
    serverId: null,
    label: copyLabel(tab.label),
    config: { ...tab.config },
  }
}

function copyLabel(value: string) {
  return `${value} (copie)`
}

export function parseStudioRouteId(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseStudioSelection(value: string | null | undefined): StudioSelection {
  if (!value) return null
  const splitIndex = value.indexOf(':')
  if (splitIndex <= 0) return null
  const type = value.slice(0, splitIndex)
  const key = value.slice(splitIndex + 1)
  if ((type !== 'chapter' && type !== 'lesson' && type !== 'tab') || !key.trim()) return null
  return { type, key }
}

export function serializeStudioSelection(selection: StudioSelection) {
  return selection ? `${selection.type}:${selection.key}` : ''
}

export function sameStudioSelection(left: StudioSelection, right: StudioSelection) {
  return left?.type === right?.type && left?.key === right?.key
}

export function summarizeStudioOperations(operations: StudioOperation[]) {
  return operations.reduce(
    (summary, operation) => {
      if (operation.op_type === 'create') summary.create += 1
      else if (operation.op_type === 'delete') summary.delete += 1
      else if (operation.op_type === 'reorder') summary.reorder += 1
      else summary.update += 1
      return summary
    },
    { create: 0, update: 0, reorder: 0, delete: 0 },
  )
}

export function collectStudioSearchResults(chapters: WorkChapter[], query: string): StudioSearchResult[] {
  if (!query) return []
  const results: StudioSearchResult[] = []

  chapters.forEach((chapter, chapterIndex) => {
    const chapterLabel = chapter.title.trim() || `Chapter ${chapterIndex + 1}`
    if (studioSearchText([chapter.title, `chapter ${chapterIndex + 1}`]).includes(query)) {
      results.push({
        key: `chapter-${chapter.key}`,
        label: chapterLabel,
        detail: `${chapter.lessons.length} lesson${chapter.lessons.length === 1 ? '' : 's'}`,
        badge: 'chapter',
        target: { type: 'chapter', key: chapter.key },
        chapterKey: chapter.key,
      })
    }

    chapter.lessons.forEach((lesson, lessonIndex) => {
      const lessonLabel = lesson.title.trim() || `Lesson ${lessonIndex + 1}`
      if (studioSearchText([lesson.title, lesson.item_type, lesson.video_id, chapterLabel]).includes(query)) {
        results.push({
          key: `lesson-${lesson.key}`,
          label: lessonLabel,
          detail: chapterLabel,
          badge: 'lesson',
          target: { type: 'lesson', key: lesson.key },
          chapterKey: chapter.key,
        })
      }

      lesson.tabs.forEach((tab, tabIndex) => {
        const tabLabel = tab.label.trim() || `Tab ${tabIndex + 1}`
        if (studioSearchText([
          tab.label,
          tab.tab_type,
          tab.content,
          tab.resource_url,
          tab.renderer_key,
          lessonLabel,
          chapterLabel,
        ]).includes(query)) {
          results.push({
            key: `tab-${tab.key}`,
            label: tabLabel,
            detail: `${chapterLabel} / ${lessonLabel}`,
            badge: 'tab',
            target: { type: 'tab', key: tab.key },
            chapterKey: chapter.key,
            lessonKey: lesson.key,
          })
        }
      })
    })
  })

  return results
}

function studioSearchText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(' ').toLowerCase()
}

export function selectionFromRoute(
  selection: NonNullable<StudioSelection>,
  chapters: WorkChapter[],
): OperationTarget | null {
  if (selection.type === 'chapter') {
    const chapter = chapters.find((item) => matchesOperationTarget(item, selection.key))
    return chapter ? { selection: { type: 'chapter', key: chapter.key }, chapterKey: chapter.key } : null
  }

  if (selection.type === 'lesson') {
    for (const chapter of chapters) {
      const lesson = chapter.lessons.find((item) => matchesOperationTarget(item, selection.key))
      if (lesson) return { selection: { type: 'lesson', key: lesson.key }, chapterKey: chapter.key }
    }
    return null
  }

  for (const chapter of chapters) {
    for (const lesson of chapter.lessons) {
      const tab = lesson.tabs.find((item) => matchesOperationTarget(item, selection.key))
      if (tab) {
        return {
          selection: { type: 'tab', key: tab.key },
          chapterKey: chapter.key,
          lessonKey: lesson.key,
        }
      }
    }
  }

  return null
}

export function selectionFromOperation(
  operation: StudioOperation,
  chapters: WorkChapter[],
): OperationTarget | null {
  const targetRef = operation.client_ref ?? (operation.target_id != null ? String(operation.target_id) : null)
  if (!targetRef) return null

  if (operation.entity_type === 'chapter') {
    const chapter = chapters.find((item) => matchesOperationTarget(item, targetRef))
    return chapter ? { selection: { type: 'chapter', key: chapter.key }, chapterKey: chapter.key } : null
  }

  if (operation.entity_type === 'lesson') {
    for (const chapter of chapters) {
      const lesson = chapter.lessons.find((item) => matchesOperationTarget(item, targetRef))
      if (lesson) return { selection: { type: 'lesson', key: lesson.key }, chapterKey: chapter.key }
    }
    return null
  }

  for (const chapter of chapters) {
    for (const lesson of chapter.lessons) {
      const tab = lesson.tabs.find((item) => matchesOperationTarget(item, targetRef))
      if (tab) {
        return {
          selection: { type: 'tab', key: tab.key },
          chapterKey: chapter.key,
          lessonKey: lesson.key,
        }
      }
    }
  }

  return null
}

function matchesOperationTarget(
  item: { key: string; serverId: number | null },
  targetRef: string,
) {
  return item.key === targetRef || (item.serverId != null && String(item.serverId) === targetRef)
}

export function collectStudioReadiness(chapters: WorkChapter[]): StudioReadiness {
  const issues: StudioReadinessIssue[] = []

  if (chapters.length === 0) {
    issues.push({
      key: 'empty-course',
      label: 'No chapters',
      detail: 'Add at least one chapter before submitting.',
      level: 'blocker',
      target: null,
    })
  }

  chapters.forEach((chapter, chapterIndex) => {
    const chapterName = chapter.title.trim() || `Chapter ${chapterIndex + 1}`
    if (!chapter.title.trim()) {
      issues.push({
        key: `chapter-title-${chapter.key}`,
        label: chapterName,
        detail: 'Chapter title is required.',
        level: 'blocker',
        target: { type: 'chapter', key: chapter.key },
        chapterKey: chapter.key,
      })
    }
    if (chapter.lessons.length === 0) {
      issues.push({
        key: `chapter-lessons-${chapter.key}`,
        label: chapterName,
        detail: 'Add at least one lesson or remove this chapter.',
        level: 'warning',
        target: { type: 'chapter', key: chapter.key },
        chapterKey: chapter.key,
      })
    }

    chapter.lessons.forEach((lesson, lessonIndex) => {
      const lessonName = lesson.title.trim() || `${chapterName} / Lesson ${lessonIndex + 1}`
      if (!lesson.title.trim()) {
        issues.push({
          key: `lesson-title-${lesson.key}`,
          label: lessonName,
          detail: 'Lesson title is required.',
          level: 'blocker',
          target: { type: 'lesson', key: lesson.key },
          chapterKey: chapter.key,
        })
      }
      if (VIDEO_LESSON_TYPES.has(lesson.item_type) && !lesson.video_id.trim()) {
        issues.push({
          key: `lesson-video-${lesson.key}`,
          label: lessonName,
          detail: 'Attach the VdoCipher video ID before publishing this lesson.',
          level: 'warning',
          target: { type: 'lesson', key: lesson.key },
          chapterKey: chapter.key,
        })
      }
      if (lesson.tabs.length === 0) {
        issues.push({
          key: `lesson-tabs-${lesson.key}`,
          label: lessonName,
          detail: 'Add a course, lab or resource tab so students have content.',
          level: 'warning',
          target: { type: 'lesson', key: lesson.key },
          chapterKey: chapter.key,
        })
      }

      lesson.tabs.forEach((tab, tabIndex) => {
        const tabName = tab.label.trim() || `${lessonName} / Tab ${tabIndex + 1}`
        if (!tab.label.trim()) {
          issues.push({
            key: `tab-label-${tab.key}`,
            label: tabName,
            detail: 'Tab label is required.',
            level: 'blocker',
            target: { type: 'tab', key: tab.key },
            chapterKey: chapter.key,
            lessonKey: lesson.key,
          })
        }
        if (TEXT_TAB_TYPES.has(tab.tab_type) && !tab.content.trim()) {
          issues.push({
            key: `tab-content-${tab.key}`,
            label: tabName,
            detail: 'Course text is empty.',
            level: 'warning',
            target: { type: 'tab', key: tab.key },
            chapterKey: chapter.key,
            lessonKey: lesson.key,
          })
        }
        if (tab.tab_type === 'resources' && !tab.resource_url.trim()) {
          issues.push({
            key: `tab-resource-${tab.key}`,
            label: tabName,
            detail: 'Resource URL is required.',
            level: 'blocker',
            target: { type: 'tab', key: tab.key },
            chapterKey: chapter.key,
            lessonKey: lesson.key,
          })
        }
        if (tab.tab_type === 'lab' && !tab.renderer_key.trim()) {
          issues.push({
            key: `tab-lab-${tab.key}`,
            label: tabName,
            detail: 'Choose a simulator for this lab tab.',
            level: 'blocker',
            target: { type: 'tab', key: tab.key },
            chapterKey: chapter.key,
            lessonKey: lesson.key,
          })
        }
      })
    })
  })

  return {
    blockers: issues.filter((issue) => issue.level === 'blocker'),
    warnings: issues.filter((issue) => issue.level === 'warning'),
  }
}
