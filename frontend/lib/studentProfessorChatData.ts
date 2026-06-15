import useSWR from 'swr'
import {
  getStudentProfessorChat,
  listStudentProfessorMessages,
  type ProfessorMessage,
  type StudentProfessorChatStatus,
} from '@/lib/professor'

export const STUDENT_PROFESSOR_CHAT_KEY = '/professor/student-chat'
export const STUDENT_PROFESSOR_MESSAGES_RESOURCE = '/professor/student-chat/conversations/messages'

export type StudentProfessorChatUrlState = {
  conversationId: number | null
  offeringId: number | null
}

export type StudentProfessorChatSearchParams = {
  get(name: string): string | null
}

const studentProfessorChatUrlParamKeys = ['conversation', 'conversationId', 'thread', 'offering', 'offeringId']

export const defaultStudentProfessorChatUrlState: StudentProfessorChatUrlState = {
  conversationId: null,
  offeringId: null,
}

export type StudentProfessorMessagesSWRKey = readonly [
  typeof STUDENT_PROFESSOR_MESSAGES_RESOURCE,
  number,
]

export type StudentProfessorMessagesEnvelope = {
  conversationId: number
  messages: ProfessorMessage[]
}

export function parseStudentProfessorChatUrlState(params: StudentProfessorChatSearchParams): StudentProfessorChatUrlState {
  return {
    conversationId: parsePositiveIntegerParam(params.get('conversation') ?? params.get('conversationId') ?? params.get('thread')),
    offeringId: parsePositiveIntegerParam(params.get('offering') ?? params.get('offeringId')),
  }
}

export function studentProfessorChatUrlStateToSearchParams(state: StudentProfessorChatUrlState, current?: URLSearchParams) {
  const params = new URLSearchParams(current)
  for (const key of studentProfessorChatUrlParamKeys) params.delete(key)

  if (state.conversationId) params.set('conversation', String(state.conversationId))
  if (state.offeringId) params.set('offering', String(state.offeringId))
  return params
}

export function studentProfessorChatUrlStatesEqual(left: StudentProfessorChatUrlState, right: StudentProfessorChatUrlState) {
  return (
    left.conversationId === right.conversationId
    && left.offeringId === right.offeringId
  )
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

function parsePositiveIntegerParam(value: string | null) {
  const normalized = value?.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
