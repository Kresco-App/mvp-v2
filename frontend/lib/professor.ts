import api from './axios'

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
  email: string
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

export async function getProfessorDashboard() {
  const { data } = await api.get<ProfessorDashboard>('/professor/dashboard')
  return data
}

export async function listProfessorOfferings() {
  const { data } = await api.get<CourseOffering[]>('/professor/offerings')
  return data
}

export async function listProfessorLiveSessions() {
  const { data } = await api.get<ProfessorLiveSession[]>('/professor/live-sessions')
  return data
}

export async function getProfessorLiveProviderConfig() {
  const { data } = await api.get<LiveProviderConfig>('/professor/live-provider-config')
  return data
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
  const { data } = await api.post<ProfessorLiveSession>('/professor/live-sessions', payload)
  return data
}

export async function updateProfessorLiveSession(id: number, payload: Partial<LiveSessionInput> & { status?: string }) {
  const { data } = await api.patch<ProfessorLiveSession>(`/professor/live-sessions/${id}`, payload)
  return data
}

export async function notifyProfessorLiveSession(id: number) {
  const { data } = await api.post<ProfessorLiveSession>(`/professor/live-sessions/${id}/notify`)
  return data
}

export async function startProfessorLiveSession(id: number) {
  const { data } = await api.post<ProfessorLiveSession>(`/professor/live-sessions/${id}/start`)
  return data
}

export async function endProfessorLiveSession(id: number) {
  const { data } = await api.post<ProfessorLiveSession>(`/professor/live-sessions/${id}/end`)
  return data
}

export async function cancelProfessorLiveSession(id: number) {
  const { data } = await api.post<ProfessorLiveSession>(`/professor/live-sessions/${id}/cancel`)
  return data
}

export async function deleteProfessorLiveSession(id: number) {
  const { data } = await api.delete<{ ok: boolean }>(`/professor/live-sessions/${id}`)
  return data
}

export async function getProfessorLiveEmbed(id: number) {
  const { data } = await api.get<LiveSessionEmbed>(`/professor/live-sessions/${id}/embed`)
  return data
}

export async function listStudentLiveSessions() {
  const { data } = await api.get<StudentLiveSession[]>('/professor/student-live-sessions')
  return data
}

export async function getStudentLiveEmbed(id: number) {
  const { data } = await api.get<LiveSessionEmbed>(`/professor/student-live-sessions/${id}/embed`)
  return data
}

export async function listProfessorLiveInteractions(id: number, status?: string) {
  const { data } = await api.get<LiveSessionInteraction[]>(`/professor/live-sessions/${id}/interactions`, {
    params: status ? { status } : undefined,
  })
  return data
}

export async function answerProfessorLiveInteraction(id: number, answer: string) {
  const { data } = await api.patch<LiveSessionInteraction>(`/professor/live-sessions/interactions/${id}`, { answer })
  return data
}

export async function patchProfessorLiveInteraction(id: number, patch: { status?: string; answer?: string }) {
  const { data } = await api.patch<LiveSessionInteraction>(`/professor/live-sessions/interactions/${id}`, patch)
  return data
}

export async function deleteProfessorLiveInteraction(id: number) {
  const { data } = await api.delete<LiveSessionInteraction>(`/professor/live-sessions/interactions/${id}`)
  return data
}

export async function listStudentLiveInteractions(id: number) {
  const { data } = await api.get<LiveSessionInteraction[]>(`/professor/student-live-sessions/${id}/interactions`)
  return data
}

export async function createStudentLiveInteraction(id: number, body: string, kind = 'question') {
  const { data } = await api.post<LiveSessionInteraction>(`/professor/student-live-sessions/${id}/interactions`, { body, kind })
  return data
}

export async function listProfessorLiveCheckpoints(id: number) {
  const { data } = await api.get<LiveSessionCheckpoint[]>(`/professor/live-sessions/${id}/checkpoints`)
  return data
}

export async function createProfessorLiveCheckpoint(id: number, payload: { title: string; prompt?: string; checkpoint_type?: string }) {
  const { data } = await api.post<LiveSessionCheckpoint>(`/professor/live-sessions/${id}/checkpoints`, payload)
  return data
}

export async function patchProfessorLiveCheckpoint(id: number, patch: { status?: string }) {
  const { data } = await api.patch<LiveSessionCheckpoint>(`/professor/live-sessions/checkpoints/${id}`, patch)
  return data
}

export async function listStudentLiveCheckpoints(id: number) {
  const { data } = await api.get<LiveSessionCheckpoint[]>(`/professor/student-live-sessions/${id}/checkpoints`)
  return data
}

export async function listProfessorChangeRequests(status = 'pending') {
  const { data } = await api.get<ChangeRequest[]>('/professor/change-requests', { params: { status } })
  return data
}

export async function listProfessorConversations(params: { q?: string; unread?: boolean; pinned?: boolean } = {}) {
  const { data } = await api.get<ProfessorConversation[]>('/professor/chat/conversations', { params })
  return data
}

export async function listProfessorMessages(conversationId: number) {
  const { data } = await api.get<ProfessorMessage[]>(`/professor/chat/conversations/${conversationId}/messages`)
  return data
}

export async function sendProfessorMessage(conversationId: number, body: string) {
  const { data } = await api.post<ProfessorMessage>(`/professor/chat/conversations/${conversationId}/messages`, { body })
  return data
}

export async function sendProfessorImageMessage(conversationId: number, file: File, body = '') {
  const form = new FormData()
  form.append('file', file)
  if (body.trim()) form.append('body', body.trim())
  const { data } = await api.post<ProfessorMessage>(`/professor/chat/conversations/${conversationId}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function updateProfessorChatMessage(messageId: number, body: string) {
  const { data } = await api.patch<ProfessorMessage>(`/professor/chat/messages/${messageId}`, { body })
  return data
}

export async function deleteProfessorChatMessage(messageId: number) {
  await api.delete(`/professor/chat/messages/${messageId}`)
}

export async function patchProfessorConversation(conversationId: number, patch: { is_pinned_by_professor?: boolean; mark_read?: boolean }) {
  const { data } = await api.patch<ProfessorConversation>(`/professor/chat/conversations/${conversationId}`, patch)
  return data
}

export async function getStudentProfessorChat() {
  const { data } = await api.get<StudentProfessorChatStatus>('/professor/student-chat')
  return data
}

export async function startStudentProfessorConversation(courseOfferingId: number, body: string) {
  const { data } = await api.post<ProfessorConversation>('/professor/student-chat/conversations', {
    course_offering_id: courseOfferingId,
    body,
  })
  return data
}

export async function listStudentProfessorMessages(conversationId: number) {
  const { data } = await api.get<ProfessorMessage[]>(`/professor/student-chat/conversations/${conversationId}/messages`)
  return data
}

export async function sendStudentProfessorMessage(conversationId: number, body: string) {
  const { data } = await api.post<ProfessorMessage>(`/professor/student-chat/conversations/${conversationId}/messages`, { body })
  return data
}

export async function sendStudentProfessorImageMessage(conversationId: number, file: File, body = '') {
  const form = new FormData()
  form.append('file', file)
  if (body.trim()) form.append('body', body.trim())
  const { data } = await api.post<ProfessorMessage>(`/professor/student-chat/conversations/${conversationId}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export function chatMediaUrl(value?: string | null) {
  if (!value) return ''
  if (/^(https?:|blob:|data:)/i.test(value)) return value
  return value
}
