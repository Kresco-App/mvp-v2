import { describe, expect, it } from 'vitest'

import { activeUserRate, verifiedUserRate, type AdminUsersAccessSummary } from '@/lib/adminUsers'

describe('admin users helpers', () => {
  it('calculates active and verified user rates safely', () => {
    expect(activeUserRate(summary({ total_users: 10, active_users: 7 }))).toBe(70)
    expect(verifiedUserRate(summary({ total_users: 10, verified_users: 8 }))).toBe(80)
    expect(activeUserRate(summary({ total_users: 0, active_users: 7 }))).toBe(0)
    expect(verifiedUserRate(summary({ total_users: 0, verified_users: 8 }))).toBe(0)
  })
})

function summary(patch: Partial<AdminUsersAccessSummary>): AdminUsersAccessSummary {
  return {
    total_users: 0,
    active_users: 0,
    verified_users: 0,
    staff_users: 0,
    pro_users: 0,
    active_entitlements: 0,
    users_with_active_entitlements: 0,
    active_permissions: 0,
    paid_users: 0,
    paid_revenue_centimes: 0,
    ...patch,
  }
}
