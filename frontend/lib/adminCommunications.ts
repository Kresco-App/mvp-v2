export type AdminCommunicationsSummary = {
  total_conversations: number
  open_conversations: number
  total_professors: number
  students_in_private_chats: number
  unread_for_professors: number
  unread_for_students: number
  messages_total: number
  messages_7d: number
  matched_conversations: number
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

export type AdminProfessorChatGroup = {
  professor_user_id: number
  professor_name: string
  conversation_count: number
  open_conversations: number
  unread_for_professor: number
  unread_for_student: number
  messages_shown: number
  last_message_at: string | null
  conversations: AdminChatConversation[]
}

export type AdminCommunications = {
  generated_at: string
  summary: AdminCommunicationsSummary
  search_query: string
  chat_conversations_by_status: Record<string, number>
  professors: AdminProfessorChatGroup[]
  conversations: AdminChatConversation[]
}

export const EMPTY_ADMIN_COMMUNICATIONS: AdminCommunications = {
  generated_at: '',
  summary: {
    total_conversations: 0,
    open_conversations: 0,
    total_professors: 0,
    students_in_private_chats: 0,
    unread_for_professors: 0,
    unread_for_students: 0,
    messages_total: 0,
    messages_7d: 0,
    matched_conversations: 0,
  },
  search_query: '',
  chat_conversations_by_status: {},
  professors: [],
  conversations: [],
}

export function communicationAttentionTotal(summary: AdminCommunicationsSummary) {
  return summary.unread_for_professors + summary.unread_for_students
}
