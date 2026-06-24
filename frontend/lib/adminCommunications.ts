export type AdminCommunicationsSummary = {
  total_conversations: number
  open_conversations: number
  unread_for_professors: number
  unread_for_students: number
  messages_7d: number
  live_sessions_live: number
  pending_live_interactions: number
  open_reports: number
  urgent_open_reports: number
}

export type AdminChatConversation = {
  conversation_id: number
  status: string
  course_offering_id: number
  course_title: string
  professor_user_id: number
  professor_name: string
  student_user_id: number
  student_name: string
  unread_for_professor: number
  unread_for_student: number
  last_message_preview: string
  last_message_at: string | null
  updated_at: string | null
  messages: AdminChatMessage[]
}

export type AdminChatMessage = {
  message_id: number
  conversation_id: number
  sender_user_id: number
  sender_name: string
  sender_role: 'student' | 'professor' | 'staff' | string
  body: string
  attachment_url: string
  attachment_name: string
  attachment_mime_type: string
  attachment_size: number
  status: string
  created_at: string | null
  read_at: string | null
}

export type AdminLiveInteraction = {
  interaction_id: number
  live_session_id: number
  session_title: string
  kind: string
  status: string
  professor_user_id: number
  professor_name: string
  student_user_id: number
  student_name: string
  body: string
  answer: string
  created_at: string | null
  answered_at: string | null
}

export type AdminReportQueueItem = {
  report_id: number
  target_type: string
  target_id: string
  reason: string
  status: string
  priority: string
  title: string
  description: string
  reporter_user_id: number
  reporter_name: string
  assigned_to_user_id: number | null
  assigned_to_name: string
  created_at: string | null
  updated_at: string | null
}

export type AdminCommunications = {
  generated_at: string
  summary: AdminCommunicationsSummary
  chat_conversations_by_status: Record<string, number>
  live_interactions_by_status: Record<string, number>
  reports_by_status: Record<string, number>
  reports_by_priority: Record<string, number>
  conversations: AdminChatConversation[]
  live_interactions: AdminLiveInteraction[]
  reports: AdminReportQueueItem[]
}

export const EMPTY_ADMIN_COMMUNICATIONS: AdminCommunications = {
  generated_at: '',
  summary: {
    total_conversations: 0,
    open_conversations: 0,
    unread_for_professors: 0,
    unread_for_students: 0,
    messages_7d: 0,
    live_sessions_live: 0,
    pending_live_interactions: 0,
    open_reports: 0,
    urgent_open_reports: 0,
  },
  chat_conversations_by_status: {},
  live_interactions_by_status: {},
  reports_by_status: {},
  reports_by_priority: {},
  conversations: [],
  live_interactions: [],
  reports: [],
}

export function communicationAttentionTotal(summary: AdminCommunicationsSummary) {
  return summary.unread_for_professors + summary.pending_live_interactions + summary.open_reports
}

export function urgentReportRate(summary: AdminCommunicationsSummary) {
  if (!summary.open_reports) return 0
  return Math.round((summary.urgent_open_reports / summary.open_reports) * 100)
}
