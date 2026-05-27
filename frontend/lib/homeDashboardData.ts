import useSWR from 'swr'
import type {
  HomeSubjectCard,
  HomeTopicCard,
} from '@/lib/homeDashboardViewModel'

export const HOME_TOPICS_KEY = '/courses/topics'
export const HOME_SUBJECTS_KEY = '/courses/subjects'

export function useHomeDashboardData() {
  const topicsQuery = useSWR<HomeTopicCard[]>(HOME_TOPICS_KEY)
  const subjectsQuery = useSWR<HomeSubjectCard[]>(HOME_SUBJECTS_KEY)

  const topics = Array.isArray(topicsQuery.data) ? topicsQuery.data : []
  const subjects = Array.isArray(subjectsQuery.data) ? subjectsQuery.data : []
  const initialLoading = (
    (topicsQuery.isLoading || subjectsQuery.isLoading)
    && !topicsQuery.data
    && !subjectsQuery.data
    && !topicsQuery.error
    && !subjectsQuery.error
  )

  return {
    topics,
    subjects,
    loading: initialLoading,
    error: topicsQuery.error ?? subjectsQuery.error ?? null,
    isValidating: topicsQuery.isValidating || subjectsQuery.isValidating,
    retry: () => Promise.all([
      topicsQuery.mutate(),
      subjectsQuery.mutate(),
    ]),
  }
}
