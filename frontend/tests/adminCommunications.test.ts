import { describe, expect, it } from 'vitest'

import { communicationAttentionTotal, urgentReportRate, type AdminCommunicationsSummary } from '@/lib/adminCommunications'

describe('admin communications helpers', () => {
  it('calculates the combined attention queue', () => {
    expect(communicationAttentionTotal(summary({
      unread_for_professors: 5,
      pending_live_interactions: 2,
      open_reports: 3,
    }))).toBe(10)
  })

  it('calculates urgent report rate safely', () => {
    expect(urgentReportRate(summary({ open_reports: 8, urgent_open_reports: 2 }))).toBe(25)
    expect(urgentReportRate(summary({ open_reports: 0, urgent_open_reports: 2 }))).toBe(0)
  })
})

function summary(patch: Partial<AdminCommunicationsSummary>): AdminCommunicationsSummary {
  return {
    total_conversations: 0,
    open_conversations: 0,
    unread_for_professors: 0,
    unread_for_students: 0,
    messages_7d: 0,
    live_sessions_live: 0,
    pending_live_interactions: 0,
    open_reports: 0,
    urgent_open_reports: 0,
    ...patch,
  }
}
