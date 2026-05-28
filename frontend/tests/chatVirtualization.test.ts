import { describe, expect, it } from 'vitest'
import {
  CHAT_INITIAL_VISIBLE_MESSAGE_COUNT,
  CHAT_OLDER_MESSAGE_BATCH_SIZE,
  getVisibleChatMessageWindow,
  nextVisibleChatMessageCount,
} from '@/lib/chatVirtualization'

describe('chat virtualization helpers', () => {
  it('returns all messages when the list fits under the initial window', () => {
    const messages = Array.from({ length: 4 }, (_, index) => ({ id: index + 1 }))

    const window = getVisibleChatMessageWindow(messages, CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)

    expect(window).toMatchObject({
      canShowOlder: false,
      hiddenBeforeCount: 0,
      startIndex: 0,
      totalCount: 4,
    })
    expect(window.messages.map((message) => message.id)).toEqual([1, 2, 3, 4])
  })

  it('keeps the newest messages in the default DOM window', () => {
    const messages = Array.from({ length: CHAT_INITIAL_VISIBLE_MESSAGE_COUNT + 5 }, (_, index) => ({ id: index + 1 }))

    const window = getVisibleChatMessageWindow(messages)

    expect(window.canShowOlder).toBe(true)
    expect(window.hiddenBeforeCount).toBe(5)
    expect(window.startIndex).toBe(5)
    expect(window.messages).toHaveLength(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)
    expect(window.messages[0]?.id).toBe(6)
    expect(window.messages.at(-1)?.id).toBe(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT + 5)
  })

  it('increments older-message visibility without exceeding the total count', () => {
    expect(nextVisibleChatMessageCount(120, 250)).toBe(120 + CHAT_OLDER_MESSAGE_BATCH_SIZE)
    expect(nextVisibleChatMessageCount(220, 250)).toBe(250)
  })

  it('normalizes invalid counts instead of producing an empty window', () => {
    const messages = [{ id: 1 }, { id: 2 }, { id: 3 }]

    const window = getVisibleChatMessageWindow(messages, 0)

    expect(window.messages).toEqual([{ id: 3 }])
    expect(nextVisibleChatMessageCount(0, 3, 0)).toBe(2)
  })
})
