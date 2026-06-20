import { describe, expect, it } from 'vitest'

import {
  EMPTY_OVERVIEW,
  FALLBACK_CRUD,
  filterCrudCatalog,
  formatMoneyCentimes,
  formatNumber,
  groupByDomain,
  numberValue,
  percent,
  publishedRatio,
  recordEntries,
  sumValues,
} from '@/lib/adminOverview'

describe('admin overview utilities', () => {
  it('uses the fallback CRUD catalog for empty overview responses', () => {
    expect(EMPTY_OVERVIEW.crud_catalog).toBe(FALLBACK_CRUD)
    expect(FALLBACK_CRUD.some((item) => item.slug === 'topic')).toBe(true)
    expect(FALLBACK_CRUD.some((item) => item.slug === 'admin-audit-log')).toBe(true)
  })

  it('filters CRUD models by model name, plural name, and domain label', () => {
    expect(filterCrudCatalog(undefined, 'exam bank').map((item) => item.slug)).toContain('exam')
    expect(filterCrudCatalog(undefined, 'Subject Entitlement').map((item) => item.slug)).toEqual(['user-subject-entitlement'])
    expect(filterCrudCatalog(undefined, 'QuestionSet').map((item) => item.slug)).toEqual(['question-set'])
  })

  it('groups CRUD items by domain without changing item order', () => {
    const grouped = groupByDomain(FALLBACK_CRUD)

    expect(grouped.quiz.map((item) => item.slug)).toEqual(['question-set', 'question'])
    expect(grouped['progress-xp'].map((item) => item.slug)).not.toContain('activity-event')
    expect(grouped.notifications.map((item) => item.slug)).toEqual(['notification'])
  })

  it('formats numeric admin metrics defensively', () => {
    expect(numberValue(42)).toBe(42)
    expect(numberValue(Number.NaN)).toBe(0)
    expect(numberValue('42')).toBe(0)
    expect(formatNumber(1234)).toBe('1,234')
    expect(formatMoneyCentimes(123400)).toBe('1,234 MAD')
    expect(percent(12.345)).toBe('12.3%')
    expect(sumValues({ a: 1, b: 2, c: 'ignored' })).toBe(3)
  })

  it('normalizes chart records into sorted numeric entries', () => {
    expect(recordEntries({ paid: 4, failed: 1, empty: 0, ignored: '2' })).toEqual([
      { key: 'paid', value: 4 },
      { key: 'failed', value: 1 },
    ])
  })

  it('computes readiness ratios from published, active, and scheduled statuses', () => {
    expect(publishedRatio({ draft: 2, published: 3, active: 1, scheduled: 1 })).toBe(71)
    expect(publishedRatio({})).toBe(0)
    expect(publishedRatio(undefined)).toBe(0)
  })
})
