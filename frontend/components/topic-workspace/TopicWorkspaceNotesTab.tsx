'use client'

import type { TabContent, TopicItem } from '@/lib/topicWorkspaceViewModel'
import { TopicWorkspaceWhiteboard } from '@/components/topic-workspace/TopicWorkspaceWhiteboard'

export function TopicWorkspaceNotesTab({
  item,
}: {
  tab: TabContent
  item: TopicItem
  topicId: number
  onNoteSaved: () => void
}) {
  return <TopicWorkspaceWhiteboard item={item} />
}
