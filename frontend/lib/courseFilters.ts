export type CourseStatusFilter = 'all' | 'unlocked' | 'locked' | 'in_progress' | 'completed'

export type CourseFilters = {
  query: string
  subject: string
  status: CourseStatusFilter
}

export type CourseFilterSearchParams = {
  get(name: string): string | null
}

const filterParamKeys = ['q', 'search', 'subject', 'status', 'filter']

export const defaultCourseFilters: CourseFilters = {
  query: '',
  subject: '',
  status: 'all',
}

export function parseCourseFilters(params: CourseFilterSearchParams): CourseFilters {
  return {
    query: params.get('q')?.trim() || '',
    subject: params.get('subject')?.trim() || '',
    status: parseCourseStatusFilter(params.get('status')) ?? 'all',
  }
}

export function courseFiltersToSearchParams(filters: CourseFilters, current?: URLSearchParams) {
  const params = new URLSearchParams(current)
  for (const key of filterParamKeys) params.delete(key)

  const query = filters.query.trim()
  const subject = filters.subject.trim()
  if (query) params.set('q', query)
  if (subject) params.set('subject', subject)
  if (filters.status !== 'all') params.set('status', filters.status)
  return params
}

export function courseFiltersEqual(left: CourseFilters, right: CourseFilters) {
  return (
    left.query === right.query
    && left.subject === right.subject
    && left.status === right.status
  )
}

export function parseCourseStatusFilter(value: string | null): CourseStatusFilter | null {
  const normalized = value?.trim().toLowerCase().replace(/[-\s]+/g, '_')
  if (normalized === 'unlocked' || normalized === 'locked' || normalized === 'in_progress' || normalized === 'completed' || normalized === 'all') return normalized
  return null
}
