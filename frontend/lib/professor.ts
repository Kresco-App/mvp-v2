import { deleteJson, getJson, patchJson, postJson } from './apiClient'

export type ProgramTrack = {
  id: number
  niveau: string
  filiere: string
  title: string
  status: string
}

export type CourseOffering = {
  id: number
  subject_id: number
  subject_title: string
  track: ProgramTrack
  professor_user_id: number
  title: string
  status: string
}

export type LiveSession = {
  id: number
  course_offering_id: number
  title: string
  description: string
  starts_at: string
  ends_at: string
  status: 'scheduled' | 'live' | 'completed' | 'cancelled' | string
  join_url: string
  vdocipher_live_id: string
  notification_status: string
  created_at: string
}

export type ProfessorLiveSession = LiveSession & {
  has_stream_credentials: boolean
}

export type LiveSessionStreamCredentials = {
  id: number
  stream_ingest_url: string
  stream_key: string
}

export type StudentLiveSession = LiveSession & {
  offering_title: string
  subject_title: string
  niveau: string
  filiere: string
  teacher_name: string
  viewer_url: string
  can_join: boolean
  provider: 'vdocipher' | string
}

export type LiveSessionEmbed = {
  id: number
  title: string
  status: string
  provider: 'vdocipher' | string
  embed_url: string
  chat_embed_url: string
  vdocipher_live_id: string
}

export type LiveProviderConfig = {
  provider: 'vdocipher' | string
  has_api_secret: boolean
  can_auto_create: boolean
  missing: string[]
  create_endpoint_configured: boolean
}

export type LiveSessionInteraction = {
  id: number
  live_session_id: number
  course_offering_id: number
  professor_user_id: number
  student_user_id: number
  student_name: string
  kind: 'question' | 'message' | string
  body: string
  status: 'pending' | 'answered' | 'hidden' | 'deleted' | string
  answer: string
  answered_by_user_id?: number | null
  answered_at?: string | null
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export type LiveSessionCheckpoint = {
  id: number
  live_session_id: number
  course_offering_id: number
  professor_user_id: number
  title: string
  prompt: string
  checkpoint_type: 'prompt' | 'quiz' | string
  status: 'active' | 'closed' | 'deleted' | string
  created_at: string
  closed_at?: string | null
}

export type ChangeRequest = {
  id: number
  course_offering_id: number
  target_type: string
  target_id: number
  change_type: string
  proposed_patch_json: Record<string, unknown>
  current_snapshot_json: Record<string, unknown>
  status: string
  admin_note: string
  created_at: string
  reviewed_at?: string | null
}

export type ProfessorDashboard = {
  offerings: CourseOffering[]
  active_offering: CourseOffering | null
  upcoming_live_sessions: ProfessorLiveSession[]
  pending_change_requests: ChangeRequest[]
  chat_unread_count: number
  chat_pinned_count: number
}

export type ChatParticipant = {
  id: number
  full_name: string
  avatar_url: string
  tier: string
}

export type ProfessorConversation = {
  id: number
  course_offering_id: number
  offering_title: string
  subject_title: string
  niveau: string
  filiere: string
  professor: ChatParticipant
  student: ChatParticipant
  status: string
  last_message_preview: string
  unread_for_professor: number
  unread_for_student: number
  is_pinned_by_professor: boolean
  created_at: string
  updated_at: string
  last_message_at: string
}

export type StudentProfessorThread = {
  course_offering_id: number
  offering_title: string
  subject_title: string
  niveau: string
  filiere: string
  professor: ChatParticipant
  conversation: ProfessorConversation | null
  last_message_preview: string
  last_message_sender_role: string
  unread_count: number
  last_message_at?: string | null
}

export type ProfessorMessage = {
  id: number
  conversation_id: number
  sender_user_id: number
  sender_role: string
  body: string
  attachment_url: string
  attachment_mime_type: string
  attachment_name: string
  attachment_size: number
  status: string
  created_at: string
  read_at?: string | null
}

export type StudentProfessorChatStatus = {
  eligible: boolean
  reason: string
  offerings: CourseOffering[]
  conversations: ProfessorConversation[]
  teacher_threads?: StudentProfessorThread[]
}

type OffsetPageParams = { limit?: number; offset?: number }
type CursorPageParams = { limit?: number; before_id?: number }
type LiveInteractionPageParams = CursorPageParams & { status?: string; kind?: string }
type StudentLiveInteractionPageParams = CursorPageParams & { kind?: string }

export async function getProfessorDashboard() {
  return getJson<ProfessorDashboard>('/professor/dashboard')
}

export async function listProfessorOfferings() {
  return getJson<CourseOffering[]>('/professor/offerings')
}

export async function listProfessorLiveSessions() {
  return getJson<ProfessorLiveSession[]>('/professor/live-sessions')
}

export async function getProfessorLiveProviderConfig() {
  return getJson<LiveProviderConfig>('/professor/live-provider-config')
}

export type LiveSessionInput = {
  course_offering_id: number
  title: string
  description: string
  starts_at: string
  ends_at: string
  join_url: string
  vdocipher_live_id?: string
  stream_ingest_url?: string
  stream_key?: string
  auto_create_vdocipher?: boolean
  chat_mode?: string
}

export async function createProfessorLiveSession(payload: LiveSessionInput) {
  return postJson<ProfessorLiveSession>('/professor/live-sessions', payload)
}

export async function updateProfessorLiveSession(id: number, payload: Partial<LiveSessionInput> & { status?: string }) {
  return patchJson<ProfessorLiveSession>(`/professor/live-sessions/${id}`, payload)
}

export async function notifyProfessorLiveSession(id: number) {
  return postJson<ProfessorLiveSession>(`/professor/live-sessions/${id}/notify`)
}

export async function startProfessorLiveSession(id: number) {
  return postJson<ProfessorLiveSession>(`/professor/live-sessions/${id}/start`)
}

export async function endProfessorLiveSession(id: number) {
  return postJson<ProfessorLiveSession>(`/professor/live-sessions/${id}/end`)
}

export async function cancelProfessorLiveSession(id: number) {
  return postJson<ProfessorLiveSession>(`/professor/live-sessions/${id}/cancel`)
}

export async function deleteProfessorLiveSession(id: number) {
  return deleteJson<{ ok: boolean }>(`/professor/live-sessions/${id}`)
}

export async function getProfessorLiveEmbed(id: number) {
  return getJson<LiveSessionEmbed>(`/professor/live-sessions/${id}/embed`)
}

export async function revealProfessorLiveStreamCredentials(id: number) {
  return postJson<LiveSessionStreamCredentials>(`/professor/live-sessions/${id}/stream-credentials/reveal`)
}

export async function listStudentLiveSessions() {
  return getJson<StudentLiveSession[]>('/professor/student-live-sessions')
}

export async function getStudentLiveEmbed(id: number) {
  return getJson<LiveSessionEmbed>(`/professor/student-live-sessions/${id}/embed`)
}

export async function listProfessorLiveInteractions(id: number, paramsOrStatus: string | LiveInteractionPageParams = {}) {
  const params = typeof paramsOrStatus === 'string'
    ? (paramsOrStatus ? { status: paramsOrStatus } : {})
    : paramsOrStatus
  return getJson<LiveSessionInteraction[]>(`/professor/live-sessions/${id}/interactions`, {
    params: Object.keys(params).length ? params : undefined,
  })
}

export async function answerProfessorLiveInteraction(id: number, answer: string) {
  return patchJson<LiveSessionInteraction>(`/professor/live-sessions/interactions/${id}`, { answer })
}

export async function patchProfessorLiveInteraction(id: number, patch: { status?: string; answer?: string }) {
  return patchJson<LiveSessionInteraction>(`/professor/live-sessions/interactions/${id}`, patch)
}

export async function deleteProfessorLiveInteraction(id: number) {
  return deleteJson<LiveSessionInteraction>(`/professor/live-sessions/interactions/${id}`)
}

export async function listStudentLiveInteractions(id: number, params: StudentLiveInteractionPageParams = {}) {
  return getJson<LiveSessionInteraction[]>(`/professor/student-live-sessions/${id}/interactions`, {
    params: Object.keys(params).length ? params : undefined,
  })
}

export async function createStudentLiveInteraction(id: number, body: string, kind = 'question') {
  return postJson<LiveSessionInteraction>(`/professor/student-live-sessions/${id}/interactions`, { body, kind })
}

export async function listProfessorLiveCheckpoints(id: number) {
  return getJson<LiveSessionCheckpoint[]>(`/professor/live-sessions/${id}/checkpoints`)
}

export async function createProfessorLiveCheckpoint(id: number, payload: { title: string; prompt?: string; checkpoint_type?: string }) {
  return postJson<LiveSessionCheckpoint>(`/professor/live-sessions/${id}/checkpoints`, payload)
}

export async function patchProfessorLiveCheckpoint(id: number, patch: { status?: string }) {
  return patchJson<LiveSessionCheckpoint>(`/professor/live-sessions/checkpoints/${id}`, patch)
}

export async function listStudentLiveCheckpoints(id: number) {
  return getJson<LiveSessionCheckpoint[]>(`/professor/student-live-sessions/${id}/checkpoints`)
}

export async function listProfessorChangeRequests(status = 'pending') {
  return getJson<ChangeRequest[]>('/professor/change-requests', { params: { status } })
}

export async function listProfessorConversations(params: { q?: string; unread?: boolean; pinned?: boolean } & OffsetPageParams = {}) {
  return getJson<ProfessorConversation[]>('/professor/chat/conversations', { params })
}

export async function listProfessorMessages(conversationId: number, params: CursorPageParams = {}) {
  return getJson<ProfessorMessage[]>(`/professor/chat/conversations/${conversationId}/messages`, { params })
}

export async function sendProfessorMessage(conversationId: number, body: string) {
  return postJson<ProfessorMessage>(`/professor/chat/conversations/${conversationId}/messages`, { body })
}

export async function sendProfessorImageMessage(conversationId: number, file: File, body = '') {
  const form = new FormData()
  form.append('file', file)
  if (body.trim()) form.append('body', body.trim())
  const data = await postJson<ProfessorMessage>(`/professor/chat/conversations/${conversationId}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function updateProfessorChatMessage(messageId: number, body: string) {
  return patchJson<ProfessorMessage>(`/professor/chat/messages/${messageId}`, { body })
}

export async function deleteProfessorChatMessage(messageId: number) {
  await deleteJson(`/professor/chat/messages/${messageId}`)
}

export async function patchProfessorConversation(conversationId: number, patch: { is_pinned_by_professor?: boolean; mark_read?: boolean }) {
  return patchJson<ProfessorConversation>(`/professor/chat/conversations/${conversationId}`, patch)
}

export async function getStudentProfessorChat() {
  return getJson<StudentProfessorChatStatus>('/professor/student-chat')
}

export async function startStudentProfessorConversation(courseOfferingId: number, body: string) {
  return postJson<ProfessorConversation>('/professor/student-chat/conversations', {
    course_offering_id: courseOfferingId,
    body,
  })
}

export async function listStudentProfessorMessages(conversationId: number, params: CursorPageParams = {}) {
  return getJson<ProfessorMessage[]>(`/professor/student-chat/conversations/${conversationId}/messages`, { params })
}

export async function sendStudentProfessorMessage(conversationId: number, body: string) {
  return postJson<ProfessorMessage>(`/professor/student-chat/conversations/${conversationId}/messages`, { body })
}

export async function sendStudentProfessorImageMessage(conversationId: number, file: File, body = '') {
  const form = new FormData()
  form.append('file', file)
  if (body.trim()) form.append('body', body.trim())
  const data = await postJson<ProfessorMessage>(`/professor/student-chat/conversations/${conversationId}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export function chatMediaUrl(value?: string | null) {
  if (!value) return ''
  if (/^(https?:|blob:|data:)/i.test(value)) return value
  return value
}
