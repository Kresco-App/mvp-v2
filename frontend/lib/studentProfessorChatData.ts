import useSWR from 'swr'
import {
  getStudentProfessorChat,
  listStudentProfessorMessages,
  type ProfessorMessage,
  type StudentProfessorChatStatus,
} from '@/lib/professor'

export const STUDENT_PROFESSOR_CHAT_KEY = '/professor/student-chat'
export const STUDENT_PROFESSOR_MESSAGES_RESOURCE = '/professor/student-chat/conversations/messages'

export type StudentProfessorMessagesSWRKey = readonly [
  typeof STUDENT_PROFESSOR_MESSAGES_RESOURCE,
  number,
]

export type StudentProfessorMessagesEnvelope = {
  conversationId: number
  messages: ProfessorMessage[]
}

export function studentProfessorMessagesSWRKey(conversationId: number | null | undefined): StudentProfessorMessagesSWRKey | null {
  if (!conversationId || !Number.isFinite(conversationId)) return null
  return [STUDENT_PROFESSOR_MESSAGES_RESOURCE, conversationId] as const
}

export function useStudentProfessorChatData(activeConversationId: number | null) {
  const statusQuery = useSWR<StudentProfessorChatStatus>(
    STUDENT_PROFESSOR_CHAT_KEY,
    () => getStudentProfessorChat(),
    { keepPreviousData: true },
  )

  const messageQuery = useSWR<StudentProfessorMessagesEnvelope, unknown, StudentProfessorMessagesSWRKey | null>(
    studentProfessorMessagesSWRKey(activeConversationId),
    async (key) => {
      const conversationId = key[1]
      const messages = await listStudentProfessorMessages(conversationId)
      return { conversationId, messages }
    },
    { keepPreviousData: true },
  )

  const activeEnvelope = messageQuery.data?.conversationId === activeConversationId
    ? messageQuery.data
    : null

  return {
    status: statusQuery.data ?? null,
    statusError: statusQuery.error ?? null,
    statusLoading: statusQuery.isLoading && !statusQuery.data,
    messages: activeEnvelope?.messages ?? [],
    messagesError: messageQuery.error ?? null,
    messagesLoading: Boolean(activeConversationId) && !activeEnvelope && messageQuery.isLoading,
    mutateStatus: statusQuery.mutate,
    mutateMessages: messageQuery.mutate,
  }
}

export function updateStudentProfessorMessagesEnvelope(
  current: StudentProfessorMessagesEnvelope | undefined,
  conversationId: number,
  update: (messages: ProfessorMessage[]) => ProfessorMessage[],
): StudentProfessorMessagesEnvelope {
  return {
    conversationId,
    messages: update(current?.conversationId === conversationId ? current.messages : []),
  }
}
