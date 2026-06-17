import {
  isNewKey,
  type StudioChapter,
  type StudioLesson,
  type StudioOperation,
  type StudioTab,
  type StudioTree,
  type WorkChapter,
  type WorkLesson,
  type WorkTab,
} from './studio'

// Build fast lookups of the pristine server state, including each item's parent
// id and index, so we can detect field, order and parent changes.
type OriginalIndex = {
  chapters: Map<number, { index: number; node: StudioChapter }>
  lessons: Map<number, { index: number; parentId: number; node: StudioLesson }>
  tabs: Map<number, { index: number; parentId: number; node: StudioTab }>
}

function indexOriginal(tree: StudioTree): OriginalIndex {
  const chapters = new Map<number, { index: number; node: StudioChapter }>()
  const lessons = new Map<number, { index: number; parentId: number; node: StudioLesson }>()
  const tabs = new Map<number, { index: number; parentId: number; node: StudioTab }>()
  tree.chapters.forEach((chapter, ci) => {
    chapters.set(chapter.id, { index: ci, node: chapter })
    chapter.lessons.forEach((lesson, li) => {
      lessons.set(lesson.id, { index: li, parentId: chapter.id, node: lesson })
      lesson.tabs.forEach((tab, ti) => {
        tabs.set(tab.id, { index: ti, parentId: lesson.id, node: tab })
      })
    })
  })
  return { chapters, lessons, tabs }
}

function changedFields<T extends Record<string, unknown>>(
  current: T,
  original: Record<string, unknown>,
  fields: (keyof T)[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const field of fields) {
    if (current[field] !== original[field as string]) {
      patch[field as string] = current[field]
    }
  }
  return patch
}

// Snapshot of the prior values for the keys present in `patch`, so the admin
// review screen can render a before -> after diff.
function snapshotFor(original: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const snap: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) snap[key] = original[key]
  return snap
}

const CHAPTER_FIELDS: (keyof WorkChapter)[] = ['title', 'description', 'status', 'is_free_preview', 'required_tier']
const LESSON_FIELDS: (keyof WorkLesson)[] = ['title', 'description', 'item_type', 'status', 'is_free_preview', 'required_tier', 'duration_seconds', 'video_id']
const TAB_META_FIELDS: (keyof WorkTab)[] = ['label', 'tab_type', 'status', 'renderer_key']

export function buildOperations(original: StudioTree, working: WorkChapter[]): StudioOperation[] {
  const idx = indexOriginal(original)
  const ops: StudioOperation[] = []

  const seenChapters = new Set<number>()
  const seenLessons = new Set<number>()
  const seenTabs = new Set<number>()

  working.forEach((chapter, ci) => {
    const chapterRef = chapter.serverId != null ? String(chapter.serverId) : chapter.key

    if (chapter.serverId == null) {
      ops.push({
        op_type: 'create',
        entity_type: 'chapter',
        client_ref: chapter.key,
        payload: {
          title: chapter.title,
          description: chapter.description,
          status: chapter.status,
          is_free_preview: chapter.is_free_preview,
          required_tier: chapter.required_tier,
          order: ci,
        },
      })
    } else {
      seenChapters.add(chapter.serverId)
      const orig = idx.chapters.get(chapter.serverId)
      if (orig) {
        const node = orig.node as unknown as Record<string, unknown>
        const patch = changedFields(chapter, node, CHAPTER_FIELDS)
        if (Object.keys(patch).length > 0) {
          ops.push({ op_type: 'update_fields', entity_type: 'chapter', target_id: chapter.serverId, payload: patch, snapshot: snapshotFor(node, patch) })
        }
        if (orig.index !== ci) {
          ops.push({ op_type: 'reorder', entity_type: 'chapter', target_id: chapter.serverId, payload: { order: ci }, snapshot: { order: orig.index } })
        }
      }
    }

    chapter.lessons.forEach((lesson, li) => {
      const lessonRef = lesson.serverId != null ? String(lesson.serverId) : lesson.key

      if (lesson.serverId == null) {
        ops.push({
          op_type: 'create',
          entity_type: 'lesson',
          client_ref: lesson.key,
          parent_ref: chapterRef,
          payload: {
            title: lesson.title,
            description: lesson.description,
            item_type: lesson.item_type,
            status: lesson.status,
            is_free_preview: lesson.is_free_preview,
            required_tier: lesson.required_tier,
            duration_seconds: lesson.duration_seconds,
            video_id: lesson.video_id,
            order: li,
          },
        })
      } else {
        seenLessons.add(lesson.serverId)
        const orig = idx.lessons.get(lesson.serverId)
        if (orig) {
          const node = orig.node as unknown as Record<string, unknown>
          const patch = changedFields(lesson, node, LESSON_FIELDS)
          if (Object.keys(patch).length > 0) {
            ops.push({ op_type: 'update_fields', entity_type: 'lesson', target_id: lesson.serverId, payload: patch, snapshot: snapshotFor(node, patch) })
          }
          const parentChanged = chapter.serverId == null || orig.parentId !== chapter.serverId
          if (parentChanged || orig.index !== li) {
            ops.push({
              op_type: 'reorder',
              entity_type: 'lesson',
              target_id: lesson.serverId,
              parent_ref: parentChanged ? chapterRef : '',
              payload: { order: li },
              snapshot: { order: orig.index },
            })
          }
        }
      }

      lesson.tabs.forEach((tab, ti) => {
        if (tab.serverId == null) {
          ops.push({
            op_type: 'create',
            entity_type: 'tab',
            client_ref: tab.key,
            parent_ref: lessonRef,
            payload: {
              label: tab.label,
              tab_type: tab.tab_type,
              status: tab.status,
              content: tab.content,
              resource_url: tab.resource_url,
              renderer_key: tab.renderer_key,
              config_json: tab.config,
              order: ti,
            },
          })
        } else {
          seenTabs.add(tab.serverId)
          const orig = idx.tabs.get(tab.serverId)
          if (orig) {
            const node = orig.node as unknown as Record<string, unknown>
            const meta = changedFields(tab, node, TAB_META_FIELDS)
            if (Object.keys(meta).length > 0) {
              ops.push({ op_type: 'update_fields', entity_type: 'tab', target_id: tab.serverId, payload: meta, snapshot: snapshotFor(node, meta) })
            }
            const content: Record<string, unknown> = {}
            const contentSnap: Record<string, unknown> = {}
            if (tab.content !== orig.node.content) { content.content = tab.content; contentSnap.content = orig.node.content }
            if (tab.resource_url !== orig.node.resource_url) { content.resource_url = tab.resource_url; contentSnap.resource_url = orig.node.resource_url }
            if (JSON.stringify(tab.config ?? {}) !== JSON.stringify(orig.node.config_json ?? {})) {
              content.config_json = tab.config
              contentSnap.config_json = orig.node.config_json
            }
            if (Object.keys(content).length > 0) {
              ops.push({ op_type: 'update_content', entity_type: 'tab', target_id: tab.serverId, payload: content, snapshot: contentSnap })
            }
            const parentChanged = lesson.serverId == null || orig.parentId !== lesson.serverId
            if (parentChanged || orig.index !== ti) {
              ops.push({
                op_type: 'reorder',
                entity_type: 'tab',
                target_id: tab.serverId,
                parent_ref: parentChanged ? lessonRef : '',
                payload: { order: ti },
                snapshot: { order: orig.index },
              })
            }
          }
        }
      })
    })
  })

  // Deletions: emit the top-most removed node only (cascades handle children).
  for (const [chapterId, { node }] of idx.chapters) {
    if (!seenChapters.has(chapterId)) {
      ops.push({ op_type: 'delete', entity_type: 'chapter', target_id: chapterId, snapshot: { title: node.title } })
    }
  }
  for (const [lessonId, { parentId, node }] of idx.lessons) {
    if (!seenLessons.has(lessonId) && seenChapters.has(parentId)) {
      ops.push({ op_type: 'delete', entity_type: 'lesson', target_id: lessonId, snapshot: { title: node.title } })
    }
  }
  for (const [tabId, { parentId, node }] of idx.tabs) {
    if (!seenTabs.has(tabId) && seenLessons.has(parentId)) {
      ops.push({ op_type: 'delete', entity_type: 'tab', target_id: tabId, snapshot: { label: node.label } })
    }
  }

  return ops
}

const ENTITY_LABELS: Record<string, string> = { chapter: 'chapitre', lesson: 'leçon', tab: 'onglet' }

export function describeOperation(op: StudioOperation): string {
  const entity = ENTITY_LABELS[op.entity_type] ?? op.entity_type
  const payload = op.payload ?? {}
  switch (op.op_type) {
    case 'create': {
      const name = (payload.title as string) || (payload.label as string) || ''
      return `Créer ${entity}${name ? ` « ${name} »` : ''}`
    }
    case 'update_fields': {
      const keys = Object.keys(payload).filter((k) => k !== 'order')
      return `Modifier ${entity} (${keys.join(', ')})`
    }
    case 'update_content':
      return `Modifier le contenu de l’${entity}`
    case 'reorder':
      return op.parent_ref ? `Déplacer ${entity}` : `Réordonner ${entity}`
    case 'delete': {
      const name = (op.snapshot?.title as string) || (op.snapshot?.label as string) || ''
      return `Supprimer ${entity}${name ? ` « ${name} »` : ''}`
    }
    default:
      return `${op.op_type} ${entity}`
  }
}
