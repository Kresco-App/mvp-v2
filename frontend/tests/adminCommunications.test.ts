import { describe, expect, it } from 'vitest'

import { communicationAttentionTotal, type AdminCommunicationsSummary } from '@/lib/adminCommunications'

describe('admin communications helpers', () => {
  it('calculates the combined attention queue', () => {
    expect(communicationAttentionTotal(summary({
      unread_for_professors: 5,
      unread_for_students: 2,
    }))).toBe(7)
  })
})

function summary(patch: Partial<AdminCommunicationsSummary>): AdminCommunicationsSummary {
  return {
    total_conversations: 0,
    open_conversations: 0,
    total_professors: 0,
    students_in_private_chats: 0,
    unread_for_professors: 0,
    unread_for_students: 0,
    messages_total: 0,
    messages_7d: 0,
    matched_conversations: 0,
    ...patch,
  }
}
