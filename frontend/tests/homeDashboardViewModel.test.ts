import { describe, expect, it } from 'vitest'

import {
  canonicalSubjectTitle,
  pickContinueTopics,
  subjectKey,
  toHomeContinueTopics,
  toHomeSubjectShortcuts,
  type HomeTopicCard,
} from '@/lib/homeDashboardViewModel'

function topic(overrides: Partial<HomeTopicCard>): HomeTopicCard {
  return {
    id: 1,
    subject_title: 'Physics',
    title: 'Topic',
    description: 'Description',
    item_count: 5,
    completed_count: 0,
    progress_pct: 0,
    concepts: [],
    ...overrides,
  }
}

describe('home dashboard view model', () => {
  it('keeps chemistry distinct from physics', () => {
    expect(subjectKey('Chimie acide-base')).toBe('chemistry')
    expect(subjectKey('Physics')).toBe('physics')
    expect(canonicalSubjectTitle('Chimie acide-base')).toBe('Chimie')
  })

  it('builds ordered subject shortcuts with canonical titles and no fake learner count', () => {
    const shortcuts = toHomeSubjectShortcuts([
      { id: 1, title: 'Mathematiques' },
      { id: 2, title: 'Physics' },
      { id: 3, title: 'Chimie acide-base' },
      { id: 4, title: 'English' },
      { id: 5, title: 'Unknown elective' },
    ])

    expect(shortcuts.map((subject) => subject.title)).toEqual(['Mathematiques', 'Physique-Chimie', 'Chimie', 'Anglais'])
    expect(shortcuts[2]).toMatchObject({
      id: 3,
      href: '/courses?subject=Chimie',
    })
    expect(shortcuts.some((subject) => subject.learner_count === '25k Learner')).toBe(false)
  })

  it('prefers canonical subject labels when duplicate subjects normalize to the same key', () => {
    const shortcuts = toHomeSubjectShortcuts([
      { id: 'long', title: 'Mathematics' },
      { id: 'canonical', title: 'Math' },
    ])

    expect(shortcuts).toHaveLength(1)
    expect(shortcuts[0]).toMatchObject({ id: 'long', title: 'Mathematiques' })
  })

  it('prioritizes accessible in-progress topics before locked fallbacks', () => {
    const topics = [
      topic({ id: 1, progress_pct: 40, can_access: false }),
      topic({ id: 2, progress_pct: 100, can_access: true }),
      topic({ id: 3, progress_pct: 30, can_access: true }),
      topic({ id: 4, progress_pct: 0, can_access: true }),
    ]

    expect(pickContinueTopics(topics, 2).map((item) => item.id)).toEqual([3, 2])
    expect(toHomeContinueTopics(topics, 1)).toEqual([
      expect.objectContaining({ id: 3, href: '/topics/3' }),
    ])
  })

  it('falls back to locked topics only when no accessible topics can fill the limit', () => {
    const topics = [
      topic({ id: 1, progress_pct: 10, can_access: false }),
      topic({ id: 2, progress_pct: 0, can_access: false }),
    ]

    expect(pickContinueTopics(topics, 2).map((item) => item.id)).toEqual([1, 2])
  })
})
