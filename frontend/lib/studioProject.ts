import {
  treeToWorking,
  type ChangeOperation,
  type StudioTree,
  type WorkChapter,
  type WorkLesson,
  type WorkTab,
} from './studio'
import { emptyChapter, emptyLesson, emptyTab } from './studio'

// Rebuild the "proposed" working tree by replaying a pending change request's
// operations on top of the live tree. Created items keep serverId=null so that
// re-diffing the working tree against the live tree reproduces them as creates
// (the request is replaced, not appended to, on resubmit).

type Ctx = {
  chapters: WorkChapter[]
  // client_ref -> created node, so later ops can target/parent onto them.
  refChapter: Map<string, WorkChapter>
  refLesson: Map<string, WorkLesson>
  refTab: Map<string, WorkTab>
}

function findChapterByServer(ctx: Ctx, id: number): WorkChapter | undefined {
  return ctx.chapters.find((c) => c.serverId === id)
}
function findLessonByServer(ctx: Ctx, id: number): { chapter: WorkChapter; lesson: WorkLesson } | undefined {
  for (const c of ctx.chapters) {
    const lesson = c.lessons.find((l) => l.serverId === id)
    if (lesson) return { chapter: c, lesson }
  }
  return undefined
}
function findTabByServer(ctx: Ctx, id: number): { lesson: WorkLesson; tab: WorkTab } | undefined {
  for (const c of ctx.chapters) for (const l of c.lessons) {
    const tab = l.tabs.find((t) => t.serverId === id)
    if (tab) return { lesson: l, tab }
  }
  return undefined
}

function resolveChapter(ctx: Ctx, op: ChangeOperation): WorkChapter | undefined {
  if (op.target_id != null) return findChapterByServer(ctx, op.target_id)
  return ctx.refChapter.get(op.client_ref)
}
function resolveLesson(ctx: Ctx, op: ChangeOperation): WorkLesson | undefined {
  if (op.target_id != null) return findLessonByServer(ctx, op.target_id)?.lesson
  return ctx.refLesson.get(op.client_ref)
}
function resolveTab(ctx: Ctx, op: ChangeOperation): WorkTab | undefined {
  if (op.target_id != null) return findTabByServer(ctx, op.target_id)?.tab
  return ctx.refTab.get(op.client_ref)
}

// parent_ref may be a real id (string) or a client_ref of a created node.
function parentChapter(ctx: Ctx, ref: string): WorkChapter | undefined {
  if (ctx.refChapter.has(ref)) return ctx.refChapter.get(ref)
  const id = Number(ref)
  return Number.isFinite(id) ? findChapterByServer(ctx, id) : undefined
}
function parentLesson(ctx: Ctx, ref: string): WorkLesson | undefined {
  if (ctx.refLesson.has(ref)) return ctx.refLesson.get(ref)
  const id = Number(ref)
  return Number.isFinite(id) ? findLessonByServer(ctx, id)?.lesson : undefined
}

function applyPatch(node: WorkChapter | WorkLesson | WorkTab, payload: Record<string, unknown>) {
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'order') continue
    if (key === 'config_json') {
      ;(node as WorkTab).config = (value as Record<string, unknown>) ?? {}
    } else if (key in node) {
      ;(node as Record<string, unknown>)[key] = value
    }
  }
}

function placeAt<T>(arr: T[], item: T, order: unknown) {
  const idx = typeof order === 'number' ? Math.max(0, Math.min(order, arr.length)) : arr.length
  arr.splice(idx, 0, item)
}

export function projectOperations(tree: StudioTree, operations: ChangeOperation[]): WorkChapter[] {
  const ctx: Ctx = {
    chapters: treeToWorking(tree),
    refChapter: new Map(),
    refLesson: new Map(),
    refTab: new Map(),
  }
  const ops = [...operations].sort((a, b) => a.seq - b.seq)

  for (const op of ops) {
    const payload = op.payload_json || {}
    if (op.op_type === 'create') {
      if (op.entity_type === 'chapter') {
        const ch = { ...emptyChapter(), key: op.client_ref || emptyChapter().key }
        applyPatch(ch, payload)
        placeAt(ctx.chapters, ch, payload.order)
        if (op.client_ref) ctx.refChapter.set(op.client_ref, ch)
      } else if (op.entity_type === 'lesson') {
        const parent = parentChapter(ctx, op.parent_ref)
        if (!parent) continue
        const ls = { ...emptyLesson(), key: op.client_ref || emptyLesson().key }
        applyPatch(ls, payload)
        placeAt(parent.lessons, ls, payload.order)
        if (op.client_ref) ctx.refLesson.set(op.client_ref, ls)
      } else {
        const parent = parentLesson(ctx, op.parent_ref)
        if (!parent) continue
        const tb = { ...emptyTab(), key: op.client_ref || emptyTab().key }
        applyPatch(tb, payload)
        placeAt(parent.tabs, tb, payload.order)
        if (op.client_ref) ctx.refTab.set(op.client_ref, tb)
      }
    } else if (op.op_type === 'update_fields' || op.op_type === 'update_content') {
      const node =
        op.entity_type === 'chapter' ? resolveChapter(ctx, op)
        : op.entity_type === 'lesson' ? resolveLesson(ctx, op)
        : resolveTab(ctx, op)
      if (node) applyPatch(node, payload)
    } else if (op.op_type === 'delete') {
      if (op.entity_type === 'chapter') {
        const ch = resolveChapter(ctx, op)
        if (ch) ctx.chapters = ctx.chapters.filter((c) => c !== ch)
      } else if (op.entity_type === 'lesson') {
        const found = op.target_id != null ? findLessonByServer(ctx, op.target_id) : undefined
        const ls = found?.lesson ?? ctx.refLesson.get(op.client_ref)
        if (ls) for (const c of ctx.chapters) c.lessons = c.lessons.filter((l) => l !== ls)
      } else {
        const found = op.target_id != null ? findTabByServer(ctx, op.target_id) : undefined
        const tb = found?.tab ?? ctx.refTab.get(op.client_ref)
        if (tb) for (const c of ctx.chapters) for (const l of c.lessons) l.tabs = l.tabs.filter((t) => t !== tb)
      }
    } else if (op.op_type === 'reorder') {
      if (op.entity_type === 'chapter') {
        const ch = resolveChapter(ctx, op)
        if (ch) { ctx.chapters = ctx.chapters.filter((c) => c !== ch); placeAt(ctx.chapters, ch, payload.order) }
      } else if (op.entity_type === 'lesson') {
        const ls = resolveLesson(ctx, op)
        if (ls) {
          for (const c of ctx.chapters) c.lessons = c.lessons.filter((l) => l !== ls)
          const target = op.parent_ref ? parentChapter(ctx, op.parent_ref) : ctx.chapters.find((c) => c.lessons.includes(ls)) ?? ctx.chapters[0]
          if (target) placeAt(target.lessons, ls, payload.order)
        }
      } else {
        const tb = resolveTab(ctx, op)
        if (tb) {
          for (const c of ctx.chapters) for (const l of c.lessons) l.tabs = l.tabs.filter((t) => t !== tb)
          const target = op.parent_ref ? parentLesson(ctx, op.parent_ref) : ctx.chapters.flatMap((c) => c.lessons).find((l) => l.tabs.includes(tb))
          if (target) placeAt(target.tabs, tb, payload.order)
        }
      }
    }
  }

  return ctx.chapters
}
