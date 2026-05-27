import useSWR from 'swr'
import {
  getProfessorDashboard,
  type ProfessorDashboard,
} from '@/lib/professor'

export const PROFESSOR_DASHBOARD_KEY = '/professor/dashboard'

export function useProfessorDashboardData() {
  const query = useSWR<ProfessorDashboard>(
    PROFESSOR_DASHBOARD_KEY,
    () => getProfessorDashboard(),
    { keepPreviousData: true },
  )

  return {
    dashboard: query.data ?? null,
    error: query.error ?? null,
    loading: query.isLoading && !query.data,
    isValidating: query.isValidating,
    mutate: query.mutate,
  }
}
