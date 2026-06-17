import { deleteJson, getJson, postJson } from './apiClient'
import api from './axios'

// ── Server tree types (mirror app/schemas/professor.py) ─────────────────────

export type StudioTab = {
  id: number
  label: string
  tab_type: string
  status: string
  order: number
  content: string
  resource_url: string
  renderer_key: string
  config_json: Record<string, unknown>
}

export type StudioLesson = {
  id: number
  title: string
  description: string
  item_type: string
  status: string
  order: number
  is_free_preview: boolean
  required_tier: string
  duration_seconds: number
  video_id: string
  tabs: StudioTab[]
}

export type StudioChapter = {
  id: number
  title: string
  description: string
  status: string
  order: number
  is_free_preview: boolean
  required_tier: string
  lessons: StudioLesson[]
}

export type StudioTree = {
  course_offering_id: number
  offering_title: string
  subject_title: string
  chapters: StudioChapter[]
  has_pending_request: boolean
  pending_request_id: number | null
  pending_chapter_ids: number[]
  pending_lesson_ids: number[]
  pending_tab_ids: number[]
}

// ── Operation + change-request types ────────────────────────────────────────

export type StudioEntity = 'chapter' | 'lesson' | 'tab'
export type StudioOpType = 'create' | 'update_fields' | 'update_content' | 'delete' | 'reorder'

export type StudioOperation = {
  op_type: StudioOpType
  entity_type: StudioEntity
  target_id?: number | null
  client_ref?: string
  parent_ref?: string
  payload?: Record<string, unknown>
  snapshot?: Record<string, unknown>
}

export type ChangeOperation = {
  id: number
  seq: number
  op_type: StudioOpType
  entity_type: StudioEntity
  target_id: number | null
  client_ref: string
  parent_ref: string
  payload_json: Record<string, unknown>
  snapshot_json: Record<string, unknown>
  status: string
  applied_target_id: number | null
  error_detail: string
}

export type ChangeRequestDetail = {
  id: number
  course_offering_id: number
  status: string
  summary: string
  professor_name: string
  professor_email: string
  offering_title: string
  admin_note: string
  created_at: string
  reviewed_at?: string | null
  operations: ChangeOperation[]
}

export type AdminChangeRequestListItem = {
  id: number
  course_offering_id: number
  offering_title: string
  professor_name: string
  professor_email: string
  summary: string
  status: string
  operation_count: number
  pending_count: number
  created_at: string
  reviewed_at?: string | null
}

// ── API client ──────────────────────────────────────────────────────────────

export async function getStudioTree(offeringId: number) {
  return getJson<StudioTree>(`/professor/studio/offerings/${offeringId}/tree`)
}

export type StudioSubmitPayload = {
  course_offering_id: number
  summary: string
  operations: StudioOperation[]
}

export async function submitStudioChanges(payload: StudioSubmitPayload) {
  return postJson<ChangeRequestDetail>('/professor/studio/change-requests', payload)
}

export async function getStudioChangeRequest(id: number) {
  return getJson<ChangeRequestDetail>(`/professor/studio/change-requests/${id}`)
}

export async function updateStudioChanges(id: number, payload: StudioSubmitPayload) {
  const { data } = await api.put<ChangeRequestDetail>(`/professor/studio/change-requests/${id}`, payload)
  return data
}

export async function withdrawStudioChange(id: number) {
  return deleteJson<void>(`/professor/studio/change-requests/${id}`)
}

export async function listAdminChangeRequests(status = 'pending') {
  return getJson<AdminChangeRequestListItem[]>(`/admin/change-requests?status=${encodeURIComponent(status)}`)
}

export async function getAdminChangeRequest(id: number) {
  return getJson<ChangeRequestDetail>(`/admin/change-requests/${id}`)
}

export async function reviewAdminChangeRequest(
  id: number,
  decisions: { operation_id: number; decision: 'approve' | 'reject' }[],
  adminNote = '',
) {
  return postJson<ChangeRequestDetail>(`/admin/change-requests/${id}/review`, {
    decisions,
    admin_note: adminNote,
  })
}

// ── Editable working model ───────────────────────────────────────────────────
//
// The studio edits a deep-cloned "working" tree. Each node keeps a stable
// `key`: real items use their numeric id as a string, new items use
// `new:<n>`. At submit time we diff the working tree against the pristine
// server tree and emit the minimal set of operations.

export type WorkTab = {
  key: string
  serverId: number | null
  label: string
  tab_type: string
  status: string
  content: string
  resource_url: string
  renderer_key: string
  config: Record<string, unknown>
}

export type WorkLesson = {
  key: string
  serverId: number | null
  title: string
  description: string
  item_type: string
  status: string
  is_free_preview: boolean
  required_tier: string
  duration_seconds: number
  video_id: string
  tabs: WorkTab[]
}

export type WorkChapter = {
  key: string
  serverId: number | null
  title: string
  description: string
  status: string
  is_free_preview: boolean
  required_tier: string
  lessons: WorkLesson[]
}

let newCounter = 0
export function nextKey(prefix: StudioEntity): string {
  newCounter += 1
  return `new:${prefix}:${newCounter}:${Date.now().toString(36)}`
}

export function isNewKey(key: string): boolean {
  return key.startsWith('new:')
}

export function treeToWorking(tree: StudioTree): WorkChapter[] {
  return tree.chapters.map((chapter) => ({
    key: String(chapter.id),
    serverId: chapter.id,
    title: chapter.title,
    description: chapter.description,
    status: chapter.status,
    is_free_preview: chapter.is_free_preview,
    required_tier: chapter.required_tier,
    lessons: chapter.lessons.map((lesson) => ({
      key: String(lesson.id),
      serverId: lesson.id,
      title: lesson.title,
      description: lesson.description,
      item_type: lesson.item_type,
      status: lesson.status,
      is_free_preview: lesson.is_free_preview,
      required_tier: lesson.required_tier,
      duration_seconds: lesson.duration_seconds ?? 0,
      video_id: lesson.video_id ?? '',
      tabs: lesson.tabs.map((tab) => ({
        key: String(tab.id),
        serverId: tab.id,
        label: tab.label,
        tab_type: tab.tab_type,
        status: tab.status,
        content: tab.content,
        resource_url: tab.resource_url,
        renderer_key: tab.renderer_key,
        config: tab.config_json ?? {},
      })),
    })),
  }))
}

export function emptyChapter(): WorkChapter {
  return {
    key: nextKey('chapter'),
    serverId: null,
    title: 'Nouveau chapitre',
    description: '',
    status: 'published',
    is_free_preview: false,
    required_tier: '',
    lessons: [],
  }
}

export function emptyLesson(): WorkLesson {
  return {
    key: nextKey('lesson'),
    serverId: null,
    title: 'Nouvelle leçon',
    description: '',
    item_type: 'lesson',
    status: 'published',
    is_free_preview: false,
    required_tier: '',
    duration_seconds: 0,
    video_id: '',
    tabs: [],
  }
}

export function emptyTab(): WorkTab {
  return {
    key: nextKey('tab'),
    serverId: null,
    label: 'Nouvel onglet',
    tab_type: 'course',
    status: 'published',
    content: '',
    resource_url: '',
    renderer_key: '',
    config: {},
  }
}
