import useSWR from 'swr'
import {
  listProfessorConversations,
  listProfessorMessages,
  type ProfessorConversation,
  type ProfessorMessage,
} from '@/lib/professor'

export type ProfessorConversationFilter = 'all' | 'unread' | 'pinned'

export type ProfessorConversationFilters = {
  q?: string
  filter?: ProfessorConversationFilter
}

export type ProfessorConversationRequest = {
  q: string
  filter: ProfessorConversationFilter
}

export type ProfessorMessagesEnvelope = {
  conversationId: number
  messages: ProfessorMessage[]
}

export const PROFESSOR_CONVERSATIONS_RESOURCE = '/professor/chat/conversations'
export const PROFESSOR_MESSAGES_RESOURCE = '/professor/chat/conversations/messages'

export type ProfessorConversationsSWRKey = readonly [
  typeof PROFESSOR_CONVERSATIONS_RESOURCE,
  ProfessorConversationRequest,
]

export type ProfessorMessagesSWRKey = readonly [
  typeof PROFESSOR_MESSAGES_RESOURCE,
  number,
]

export function normalizeProfessorConversationFilters(filters: ProfessorConversationFilters = {}): ProfessorConversationRequest {
  return {
    q: filters.q?.trim() ?? '',
    filter: filters.filter ?? 'all',
  }
}

export function professorConversationListParams(filters: ProfessorConversationFilters = {}) {
  const normalized = normalizeProfessorConversationFilters(filters)

  return {
    ...(normalized.q ? { q: normalized.q } : {}),
    ...(normalized.filter === 'unread' ? { unread: true } : {}),
    ...(normalized.filter === 'pinned' ? { pinned: true } : {}),
  }
}

export function professorConversationsSWRKey(filters: ProfessorConversationFilters = {}): ProfessorConversationsSWRKey {
  return [
    PROFESSOR_CONVERSATIONS_RESOURCE,
    normalizeProfessorConversationFilters(filters),
  ] as const
}

export function professorMessagesSWRKey(conversationId: number | null | undefined): ProfessorMessagesSWRKey | null {
  if (!conversationId || !Number.isFinite(conversationId)) return null
  return [PROFESSOR_MESSAGES_RESOURCE, conversationId] as const
}

export function useProfessorChatData(filters: ProfessorConversationFilters, activeConversationId: number | null) {
  const conversationQuery = useSWR<ProfessorConversation[], unknown, ProfessorConversationsSWRKey>(
    professorConversationsSWRKey(filters),
    (key) => listProfessorConversations(professorConversationListParams(key[1])),
    { keepPreviousData: true },
  )

  const messageQuery = useSWR<ProfessorMessagesEnvelope, unknown, ProfessorMessagesSWRKey | null>(
    professorMessagesSWRKey(activeConversationId),
    async (key) => {
      const conversationId = key[1]
      const messages = await listProfessorMessages(conversationId)
      return { conversationId, messages }
    },
    { keepPreviousData: true },
  )

  const activeMessageEnvelope = messageQuery.data?.conversationId === activeConversationId
    ? messageQuery.data
    : null

  return {
    conversations: conversationQuery.data ?? [],
    conversationsError: conversationQuery.error ?? null,
    conversationsLoading: conversationQuery.isLoading && !conversationQuery.data,
    conversationsRefreshing: conversationQuery.isValidating,
    messages: activeMessageEnvelope?.messages ?? [],
    messagesError: messageQuery.error ?? null,
    messagesLoading: Boolean(activeConversationId) && !activeMessageEnvelope && messageQuery.isLoading,
    messagesRefreshing: messageQuery.isValidating,
    mutateConversations: conversationQuery.mutate,
    mutateMessages: messageQuery.mutate,
  }
}
