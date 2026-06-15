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

export type ProfessorChatUrlState = {
  conversationId: number | null
  q: string
  filter: ProfessorConversationFilter
}

export type ProfessorChatSearchParams = {
  get(name: string): string | null
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

const professorChatUrlParamKeys = ['conversation', 'conversationId', 'thread', 'q', 'search', 'filter']

export const defaultProfessorChatUrlState: ProfessorChatUrlState = {
  conversationId: null,
  q: '',
  filter: 'all',
}

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

export function parseProfessorChatUrlState(params: ProfessorChatSearchParams): ProfessorChatUrlState {
  return {
    conversationId: parsePositiveIntegerParam(params.get('conversation') ?? params.get('conversationId') ?? params.get('thread')),
    q: params.get('q')?.trim() || params.get('search')?.trim() || '',
    filter: parseProfessorConversationFilter(params.get('filter')) ?? 'all',
  }
}

export function professorChatUrlStateToSearchParams(state: ProfessorChatUrlState, current?: URLSearchParams) {
  const params = new URLSearchParams(current)
  for (const key of professorChatUrlParamKeys) params.delete(key)

  if (state.conversationId) params.set('conversation', String(state.conversationId))
  const query = state.q.trim()
  if (query) params.set('q', query)
  if (state.filter !== 'all') params.set('filter', state.filter)
  return params
}

export function professorChatUrlStatesEqual(left: ProfessorChatUrlState, right: ProfessorChatUrlState) {
  return (
    left.conversationId === right.conversationId
    && left.q === right.q
    && left.filter === right.filter
  )
}

export function parseProfessorConversationFilter(value: string | null): ProfessorConversationFilter | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'all' || normalized === 'unread' || normalized === 'pinned') return normalized
  return null
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

function parsePositiveIntegerParam(value: string | null) {
  const normalized = value?.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
