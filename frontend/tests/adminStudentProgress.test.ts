import { describe, expect, it } from 'vitest'

import {
  quizPassRate,
  studentProgressCoverage,
  type AdminStudentProgressSummary,
} from '@/lib/adminStudentProgress'

describe('admin student progress helpers', () => {
  it('computes progress coverage and quiz pass rates defensively', () => {
    const summary: AdminStudentProgressSummary = {
      total_students: 10,
      active_students_7d: 4,
      students_with_progress: 7,
      completed_topic_items: 12,
      total_watch_minutes: 300,
      quiz_attempts: 8,
      quiz_passed: 6,
      total_xp: 1200,
    }

    expect(studentProgressCoverage(summary)).toBe(70)
    expect(quizPassRate(summary)).toBe(75)
    expect(studentProgressCoverage({ ...summary, total_students: 0 })).toBe(0)
    expect(quizPassRate({ ...summary, quiz_attempts: 0 })).toBe(0)
  })
})
