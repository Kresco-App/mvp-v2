import { describe, expect, it } from 'vitest'

import {
  courseFiltersEqual,
  courseFiltersToSearchParams,
  defaultCourseFilters,
  parseCourseFilters,
  parseCourseStatusFilter,
} from '@/lib/courseFilters'

describe('course filter URL helpers', () => {
  it('parses canonical course filter params', () => {
    expect(parseCourseFilters(new URLSearchParams('q=limits&subject=Physics&status=in-progress'))).toEqual({
      query: 'limits',
      subject: 'Physics',
      status: 'in_progress',
    })
    expect(parseCourseFilters(new URLSearchParams('search=waves&filter=locked'))).toEqual({
      query: '',
      subject: '',
      status: 'all',
    })
    expect(parseCourseStatusFilter('not-real')).toBeNull()
  })

  it('serializes filters canonically while preserving unrelated params', () => {
    const params = courseFiltersToSearchParams(
      { query: '  waves ', subject: 'Physics', status: 'completed' },
      new URLSearchParams('page=2&search=old&filter=locked'),
    )

    expect(params.toString()).toBe('page=2&q=waves&subject=Physics&status=completed')
  })

  it('omits default filters from the URL', () => {
    expect(courseFiltersToSearchParams(defaultCourseFilters, new URLSearchParams('q=old&status=locked')).toString()).toBe('')
    expect(courseFiltersEqual(defaultCourseFilters, parseCourseFilters(new URLSearchParams()))).toBe(true)
  })
})
