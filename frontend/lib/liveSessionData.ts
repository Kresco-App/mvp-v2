import { useCallback, useEffect } from 'react'
import useSWR, { type KeyedMutator } from 'swr'
import { liveApiSWRConfig } from '@/lib/apiData'
import { isLiveInteraction, mergeLiveInteraction, mergeLiveInteractions, sortLiveInteractions } from '@/lib/liveInteractions'
import {
  getProfessorLiveEmbed,
  getProfessorLiveProviderConfig,
  getStudentLiveEmbed,
  listProfessorLiveInteractions,
  listProfessorLiveSessions,
  listProfessorOfferings,
  listStudentLiveInteractions,
  listStudentLiveSessions,
  type CourseOffering,
  type LiveProviderConfig,
  type LiveSessionEmbed,
  type LiveSessionInteraction,
  type ProfessorLiveSession,
  type StudentLiveSession,
} from '@/lib/professor'

type RealtimeModule = typeof import('@/lib/realtime')

export const PROFESSOR_OFFERINGS_KEY = '/professor/offerings'
export const PROFESSOR_LIVE_SESSIONS_KEY = '/professor/live-sessions'
export const PROFESSOR_LIVE_PROVIDER_CONFIG_KEY = '/professor/live-provider-config'
export const PROFESSOR_LIVE_EMBED_RESOURCE = '/professor/live-sessions/embed'
export const PROFESSOR_LIVE_INTERACTIONS_RESOURCE = '/professor/live-sessions/interactions'
export const STUDENT_LIVE_SESSIONS_KEY = '/professor/student-live-sessions'
export const STUDENT_LIVE_EMBED_RESOURCE = '/professor/student-live-sessions/embed'
export const STUDENT_LIVE_INTERACTIONS_RESOURCE = '/professor/student-live-sessions/interactions'

type SessionKey<Resource extends string> = readonly [Resource, number]

export type LiveEmbedEnvelope = {
  sessionId: number
  embed: LiveSessionEmbed
}

export type LiveInteractionsEnvelope = {
  sessionId: number
  interactions: LiveSessionInteraction[]
}

type LiveSessionRealtimeOptions = {
  sessionId: number | null
  mutateAll: () => Promise<unknown>
  mutateInteractions: KeyedMutator<LiveInteractionsEnvelope>
  refreshInteractions: (
    current: LiveInteractionsEnvelope | undefined,
    sessionId: number,
  ) => Promise<LiveInteractionsEnvelope>
  fallbackPoll?: () => Promise<unknown>
}

let realtimeModulePromise: Promise<RealtimeModule> | null = null

function loadRealtimeModule() {
  realtimeModulePromise ??= import('@/lib/realtime')
  return realtimeModulePromise
}

export function positiveSessionId(value: number | string | null | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export function professorLiveEmbedSWRKey(sessionId: number | string | null | undefined): SessionKey<typeof PROFESSOR_LIVE_EMBED_RESOURCE> | null {
  const numeric = positiveSessionId(sessionId)
  return numeric ? [PROFESSOR_LIVE_EMBED_RESOURCE, numeric] as const : null
}

export function professorLiveInteractionsSWRKey(sessionId: number | string | null | undefined): SessionKey<typeof PROFESSOR_LIVE_INTERACTIONS_RESOURCE> | null {
  const numeric = positiveSessionId(sessionId)
  return numeric ? [PROFESSOR_LIVE_INTERACTIONS_RESOURCE, numeric] as const : null
}

export function studentLiveEmbedSWRKey(sessionId: number | string | null | undefined, canJoin: boolean): SessionKey<typeof STUDENT_LIVE_EMBED_RESOURCE> | null {
  const numeric = positiveSessionId(sessionId)
  return numeric && canJoin ? [STUDENT_LIVE_EMBED_RESOURCE, numeric] as const : null
}

export function studentLiveInteractionsSWRKey(sessionId: number | string | null | undefined): SessionKey<typeof STUDENT_LIVE_INTERACTIONS_RESOURCE> | null {
  const numeric = positiveSessionId(sessionId)
  return numeric ? [STUDENT_LIVE_INTERACTIONS_RESOURCE, numeric] as const : null
}

export function useProfessorLiveScheduleData() {
  const offeringsQuery = useSWR<CourseOffering[]>(
    PROFESSOR_OFFERINGS_KEY,
    () => listProfessorOfferings(),
    liveApiSWRConfig,
  )
  const sessionsQuery = useSWR<ProfessorLiveSession[]>(
    PROFESSOR_LIVE_SESSIONS_KEY,
    () => listProfessorLiveSessions(),
    liveApiSWRConfig,
  )
  const providerConfigQuery = useSWR<LiveProviderConfig>(
    PROFESSOR_LIVE_PROVIDER_CONFIG_KEY,
    () => getProfessorLiveProviderConfig(),
    liveApiSWRConfig,
  )

  const mutateAll = useCallback(async () => {
    await Promise.allSettled([
      offeringsQuery.mutate(),
      sessionsQuery.mutate(),
      providerConfigQuery.mutate(),
    ])
  }, [offeringsQuery, providerConfigQuery, sessionsQuery])

  return {
    offerings: offeringsQuery.data ?? [],
    sessions: sessionsQuery.data ?? [],
    providerConfig: providerConfigQuery.data ?? null,
    loading: (
      (offeringsQuery.isLoading && !offeringsQuery.data)
      || (sessionsQuery.isLoading && !sessionsQuery.data)
      || (providerConfigQuery.isLoading && !providerConfigQuery.data)
    ),
    error: offeringsQuery.error ?? sessionsQuery.error ?? providerConfigQuery.error ?? null,
    mutateOfferings: offeringsQuery.mutate,
    mutateSessions: sessionsQuery.mutate,
    mutateProviderConfig: providerConfigQuery.mutate,
    mutateAll,
  }
}

export function useProfessorLiveControlData(sessionIdValue: number | string | null | undefined) {
  const sessionId = positiveSessionId(sessionIdValue)
  const sessionsQuery = useSWR<ProfessorLiveSession[]>(
    sessionId ? PROFESSOR_LIVE_SESSIONS_KEY : null,
    () => listProfessorLiveSessions(),
    liveApiSWRConfig,
  )
  const embedQuery = useSWR<LiveEmbedEnvelope, unknown, SessionKey<typeof PROFESSOR_LIVE_EMBED_RESOURCE> | null>(
    professorLiveEmbedSWRKey(sessionId),
    async (key) => {
      const embed = await getProfessorLiveEmbed(key[1])
      return { sessionId: key[1], embed }
    },
    liveApiSWRConfig,
  )
  const interactionsQuery = useSWR<LiveInteractionsEnvelope, unknown, SessionKey<typeof PROFESSOR_LIVE_INTERACTIONS_RESOURCE> | null>(
    professorLiveInteractionsSWRKey(sessionId),
    async (key) => {
      const interactions = await listProfessorLiveInteractions(key[1])
      return { sessionId: key[1], interactions: sortLiveInteractions(interactions) }
    },
    liveApiSWRConfig,
  )
  const embedEnvelope = embedQuery.data?.sessionId === sessionId ? embedQuery.data : null
  const interactionsEnvelope = interactionsQuery.data?.sessionId === sessionId ? interactionsQuery.data : null

  const mutateAll = useCallback(async () => {
    await Promise.allSettled([
      sessionsQuery.mutate(),
      embedQuery.mutate(),
      interactionsQuery.mutate(),
    ])
  }, [embedQuery, interactionsQuery, sessionsQuery])

  return {
    sessionId,
    session: sessionsQuery.data?.find((item) => item.id === sessionId) ?? null,
    embed: embedEnvelope?.embed ?? null,
    interactions: interactionsEnvelope?.interactions ?? [],
    loading: Boolean(sessionId) && (
      (sessionsQuery.isLoading && !sessionsQuery.data)
      || (embedQuery.isLoading && !embedEnvelope)
      || (interactionsQuery.isLoading && !interactionsEnvelope)
    ),
    error: sessionsQuery.error ?? embedQuery.error ?? interactionsQuery.error ?? null,
    mutateSessions: sessionsQuery.mutate,
    mutateEmbed: embedQuery.mutate,
    mutateInteractions: interactionsQuery.mutate,
    mutateAll,
  }
}

export function useStudentLiveScheduleData() {
  const sessionsQuery = useSWR<StudentLiveSession[]>(
    STUDENT_LIVE_SESSIONS_KEY,
    async () => sortStudentLiveSessions(await listStudentLiveSessions()),
    liveApiSWRConfig,
  )

  return {
    sessions: sessionsQuery.data ?? [],
    loading: sessionsQuery.isLoading && !sessionsQuery.data,
    error: sessionsQuery.error ?? null,
    mutateSessions: sessionsQuery.mutate,
  }
}

export function useStudentLiveRoomData(sessionIdValue: number | string | null | undefined) {
  const sessionId = positiveSessionId(sessionIdValue)
  const sessionsQuery = useSWR<StudentLiveSession[]>(
    sessionId ? STUDENT_LIVE_SESSIONS_KEY : null,
    async () => sortStudentLiveSessions(await listStudentLiveSessions()),
    liveApiSWRConfig,
  )
  const session = sessionsQuery.data?.find((item) => item.id === sessionId) ?? null
  const embedQuery = useSWR<LiveEmbedEnvelope, unknown, SessionKey<typeof STUDENT_LIVE_EMBED_RESOURCE> | null>(
    studentLiveEmbedSWRKey(sessionId, Boolean(session?.can_join)),
    async (key) => {
      const embed = await getStudentLiveEmbed(key[1])
      return { sessionId: key[1], embed }
    },
    liveApiSWRConfig,
  )
  const interactionsQuery = useSWR<LiveInteractionsEnvelope, unknown, SessionKey<typeof STUDENT_LIVE_INTERACTIONS_RESOURCE> | null>(
    studentLiveInteractionsSWRKey(sessionId),
    async (key) => {
      const interactions = await listStudentLiveInteractions(key[1])
      return { sessionId: key[1], interactions: sortLiveInteractions(interactions) }
    },
    liveApiSWRConfig,
  )
  const embedEnvelope = embedQuery.data?.sessionId === sessionId ? embedQuery.data : null
  const interactionsEnvelope = interactionsQuery.data?.sessionId === sessionId ? interactionsQuery.data : null

  const mutateAll = useCallback(async () => {
    await Promise.allSettled([
      sessionsQuery.mutate(),
      embedQuery.mutate(),
      interactionsQuery.mutate(),
    ])
  }, [embedQuery, interactionsQuery, sessionsQuery])

  return {
    sessionId,
    session,
    embed: embedEnvelope?.embed ?? null,
    interactions: interactionsEnvelope?.interactions ?? [],
    loading: Boolean(sessionId) && (sessionsQuery.isLoading && !sessionsQuery.data),
    embedLoading: Boolean(session?.can_join) && !embedEnvelope && embedQuery.isLoading,
    interactionsLoading: Boolean(sessionId) && !interactionsEnvelope && interactionsQuery.isLoading,
    error: sessionsQuery.error ?? null,
    embedError: embedQuery.error ?? null,
    interactionsError: interactionsQuery.error ?? null,
    mutateSessions: sessionsQuery.mutate,
    mutateEmbed: embedQuery.mutate,
    mutateInteractions: interactionsQuery.mutate,
    mutateAll,
  }
}

export function useLiveSessionRealtimeSubscription({
  sessionId,
  mutateAll,
  mutateInteractions,
  refreshInteractions,
  fallbackPoll,
}: LiveSessionRealtimeOptions) {
  useEffect(() => {
    if (!sessionId) return
    let stopped = false
    let unsubscribe: (() => void) | null = null

    const handleEvent = (message: { name?: string; data?: unknown }) => {
      if (message.name?.startsWith('live.session.')) {
        void mutateAll()
        return
      }
      if (message.name?.startsWith('live.interaction.') && isLiveInteraction(message.data)) {
        const interaction = message.data
        void mutateInteractions(
          (current) => updateLiveInteractionsEnvelope(current, sessionId, (items) => mergeLiveInteraction(items, interaction)),
          { revalidate: false },
        )
      }
    }

    void loadRealtimeModule()
      .then(({ refreshKrescoRealtimeAuthorization, subscribeKrescoRealtime }) => {
        if (stopped) return
        unsubscribe = subscribeKrescoRealtime({
          channelName: liveSessionChannelName(sessionId),
          onMessage: handleEvent,
          beforeSubscribe: refreshKrescoRealtimeAuthorization,
          fallback: {
            intervalMs: 5000,
            initialPoll: false,
            poll: async () => {
              if (fallbackPoll) {
                await fallbackPoll()
                return
              }
              await mutateInteractions(
                (current) => refreshInteractions(current, sessionId),
                { revalidate: false },
              )
            },
          },
        })
      })
      .catch(() => undefined)

    return () => {
      stopped = true
      unsubscribe?.()
    }
  }, [fallbackPoll, mutateAll, mutateInteractions, refreshInteractions, sessionId])
}

export function updateLiveInteractionsEnvelope(
  current: LiveInteractionsEnvelope | undefined,
  sessionId: number,
  update: (interactions: LiveSessionInteraction[]) => LiveSessionInteraction[],
): LiveInteractionsEnvelope {
  return {
    sessionId,
    interactions: sortLiveInteractions(update(current?.sessionId === sessionId ? current.interactions : [])),
  }
}

export function mergeLiveInteractionsEnvelope(
  current: LiveInteractionsEnvelope | undefined,
  sessionId: number,
  next: LiveSessionInteraction[],
): LiveInteractionsEnvelope {
  return updateLiveInteractionsEnvelope(current, sessionId, (items) => mergeLiveInteractions(items, next))
}

export async function refreshProfessorLiveInteractionsEnvelope(
  current: LiveInteractionsEnvelope | undefined,
  sessionId: number,
): Promise<LiveInteractionsEnvelope> {
  const refreshed = await listProfessorLiveInteractions(sessionId)
  return mergeLiveInteractionsEnvelope(current, sessionId, refreshed)
}

export async function refreshStudentLiveInteractionsEnvelope(
  current: LiveInteractionsEnvelope | undefined,
  sessionId: number,
): Promise<LiveInteractionsEnvelope> {
  const refreshed = await listStudentLiveInteractions(sessionId, { limit: 100 })
  return mergeLiveInteractionsEnvelope(current, sessionId, refreshed)
}

function compareStudentLiveSessions(a: StudentLiveSession, b: StudentLiveSession) {
  const statusOrder: Record<string, number> = { live: 0, scheduled: 1, completed: 2, cancelled: 3 }
  const left = statusOrder[a.status] ?? 3
  const right = statusOrder[b.status] ?? 3
  if (left !== right) return left - right
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
}

function sortStudentLiveSessions(sessions: StudentLiveSession[]) {
  return [...sessions].sort(compareStudentLiveSessions)
}

function liveSessionChannelName(liveSessionId: number | string) {
  return `kresco:live:${liveSessionId}`
}
