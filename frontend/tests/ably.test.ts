import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import {
  liveSessionChannelName,
  offeringNotificationsChannelName,
  professorInboxChannelName,
  userNotificationsChannelName,
  userPresenceChannelName,
} from '@/lib/ably'

describe('Ably channel naming', () => {
  it('keeps backend and frontend channel names aligned', () => {
    expect(userNotificationsChannelName(42)).toBe('kresco:user:42:notifications')
    expect(userPresenceChannelName(42)).toBe('kresco:user:42:presence')
    expect(professorInboxChannelName(7)).toBe('kresco:professor:7:inbox')
    expect(offeringNotificationsChannelName(99)).toBe('kresco:offering:99:notifications')
    expect(liveSessionChannelName(123)).toBe('kresco:live:123')
  })

  it('does not silently swallow async subscription failures', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/ably.ts'), 'utf8')

    expect(source).toContain('reportRealtimeAsyncFailure')
    expect(source).not.toContain('.catch(() => undefined)')
  })
})
