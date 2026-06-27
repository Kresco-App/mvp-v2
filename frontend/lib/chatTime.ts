export const DEFAULT_CHAT_TIMESTAMP_GAP_MS = 10 * 60 * 1000
export const CHAT_MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000
const CHAT_TIMESTAMP_CACHE_MAX = 512

type DatedMessage = { created_at: string }

export function parseChatTimestamp(value: string): Date | null {
  const timestamp = readChatTimestampMs(value)
  return timestamp === null ? null : new Date(timestamp)
}

function readChatTimestampMs(value: string): number | null {
  if (chatTimestampMsCache.has(value)) {
    return chatTimestampMsCache.get(value) ?? null
  }

  const normalized = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
  const timestamp = new Date(normalized).getTime()
  const result = Number.isNaN(timestamp) ? null : timestamp
  rememberChatTimestampMs(value, result)
  return result
}

const chatTimestampMsCache = new Map<string, number | null>()

function rememberChatTimestampMs(value: string, timestamp: number | null) {
  if (chatTimestampMsCache.size >= CHAT_TIMESTAMP_CACHE_MAX) {
    const first = chatTimestampMsCache.keys().next().value
    if (first !== undefined) chatTimestampMsCache.delete(first)
  }

  chatTimestampMsCache.set(value, timestamp)
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export function shouldShowChatTimestamp(
  messages: readonly DatedMessage[],
  index: number,
  gapMs = DEFAULT_CHAT_TIMESTAMP_GAP_MS,
) {
  if (index < 0 || index >= messages.length) return false

  const currentTimestamp = readChatTimestampMs(messages[index]?.created_at)
  if (currentTimestamp === null) return false

  if (index === messages.length - 1) return true

  const nextTimestamp = readChatTimestampMs(messages[index + 1]?.created_at)
  if (nextTimestamp === null) return true

  const current = new Date(currentTimestamp)
  const next = new Date(nextTimestamp)
  if (!isSameCalendarDay(current, next)) return true

  const deltaMs = nextTimestamp - currentTimestamp
  if (deltaMs < 0) return true

  return deltaMs >= gapMs
}

export function canEditChatMessage(createdAt: string, now = Date.now()) {
  const sentAt = readChatTimestampMs(createdAt)
  if (sentAt === null) return false
  return now - sentAt <= CHAT_MESSAGE_EDIT_WINDOW_MS
}
