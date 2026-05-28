export const CHAT_INITIAL_VISIBLE_MESSAGE_COUNT = 120
export const CHAT_OLDER_MESSAGE_BATCH_SIZE = 80

export type ChatMessageWindow<T> = {
  canShowOlder: boolean
  hiddenBeforeCount: number
  messages: T[]
  startIndex: number
  totalCount: number
}

export function getVisibleChatMessageWindow<T>(
  messages: readonly T[],
  visibleCount = CHAT_INITIAL_VISIBLE_MESSAGE_COUNT,
): ChatMessageWindow<T> {
  const totalCount = messages.length
  const normalizedVisibleCount = Math.max(1, Math.floor(visibleCount))
  const startIndex = Math.max(0, totalCount - normalizedVisibleCount)

  return {
    canShowOlder: startIndex > 0,
    hiddenBeforeCount: startIndex,
    messages: messages.slice(startIndex),
    startIndex,
    totalCount,
  }
}

export function nextVisibleChatMessageCount(
  currentCount: number,
  totalCount: number,
  batchSize = CHAT_OLDER_MESSAGE_BATCH_SIZE,
) {
  const normalizedCurrentCount = Math.max(1, Math.floor(currentCount))
  const normalizedBatchSize = Math.max(1, Math.floor(batchSize))
  return Math.min(Math.max(1, totalCount), normalizedCurrentCount + normalizedBatchSize)
}
