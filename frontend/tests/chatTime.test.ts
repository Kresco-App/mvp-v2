import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { canEditChatMessage, parseChatTimestamp, shouldShowChatTimestamp } from '@/lib/chatTime'

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n?/g, '\n')
}

describe('chat time helpers', () => {
  it('normalizes timezone-less timestamps as UTC', () => {
    expect(parseChatTimestamp('2026-06-27T12:30:00')?.toISOString()).toBe('2026-06-27T12:30:00.000Z')
    expect(parseChatTimestamp('not-a-date')).toBeNull()
  })

  it('keeps timestamp clustering and edit windows stable', () => {
    const messages = [
      { created_at: '2026-06-27T12:00:00' },
      { created_at: '2026-06-27T12:05:00' },
      { created_at: '2026-06-27T12:20:00' },
    ]

    expect(shouldShowChatTimestamp(messages, 0)).toBe(false)
    expect(shouldShowChatTimestamp(messages, 1)).toBe(true)
    expect(shouldShowChatTimestamp(messages, 2)).toBe(true)
    expect(canEditChatMessage('2026-06-27T12:05:00', Date.parse('2026-06-27T12:15:00Z'))).toBe(true)
    expect(canEditChatMessage('2026-06-27T12:05:00', Date.parse('2026-06-27T12:25:01Z'))).toBe(false)
  })

  it('caches parsed timestamp milliseconds instead of reparsing chat strings', () => {
    const chatTimeSource = source('lib', 'chatTime.ts')

    expect(chatTimeSource).toContain('const CHAT_TIMESTAMP_CACHE_MAX = 512')
    expect(chatTimeSource).toContain('const chatTimestampMsCache = new Map<string, number | null>()')
    expect(chatTimeSource).toContain('function readChatTimestampMs(value: string): number | null')
    expect(chatTimeSource).toContain('if (chatTimestampMsCache.has(value))')
    expect(chatTimeSource).toContain('rememberChatTimestampMs(value, result)')
    expect(chatTimeSource).toContain('const currentTimestamp = readChatTimestampMs(messages[index]?.created_at)')
    expect(chatTimeSource).toContain('const sentAt = readChatTimestampMs(createdAt)')
  })
})
