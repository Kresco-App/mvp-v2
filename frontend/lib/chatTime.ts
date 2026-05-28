export const DEFAULT_CHAT_TIMESTAMP_GAP_MS = 10 * 60 * 1000
export const CHAT_MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000

type DatedMessage = { created_at: string }

export function parseChatTimestamp(value: string): Date | null {
  const normalized = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
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

  const current = parseChatTimestamp(messages[index]?.created_at)
  if (!current) return false

  if (index === messages.length - 1) return true

  const next = parseChatTimestamp(messages[index + 1]?.created_at)
  if (!next) return true

  if (!isSameCalendarDay(current, next)) return true

  const deltaMs = next.getTime() - current.getTime()
  if (deltaMs < 0) return true

  return deltaMs >= gapMs
}

export function canEditChatMessage(createdAt: string, now = Date.now()) {
  const sentAt = parseChatTimestamp(createdAt)?.getTime() ?? Number.NaN
  if (Number.isNaN(sentAt)) return false
  return now - sentAt <= CHAT_MESSAGE_EDIT_WINDOW_MS
}
