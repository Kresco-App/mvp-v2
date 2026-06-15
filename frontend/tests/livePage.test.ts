import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('student live sessions page', () => {
  it('keeps realtime fallback polling and wraps long descriptions', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/(dashboard)/live/page.tsx'), 'utf8')
    const hookSource = readFileSync(resolve(process.cwd(), 'hooks/useNotificationChannelsSubscription.ts'), 'utf8')

    expect(source).toContain('useNotificationChannelsSubscription({')
    expect(source).toContain('fallbackPoll: pollSessions')
    expect(source).not.toContain('listKrescoRealtimeSubscriptions')
    expect(hookSource).toContain('fallbackIntervalMs = 5000')
    expect(source).toContain('max-w-[520px] break-words')
  })
})
