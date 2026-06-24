'use client'

import dynamic from 'next/dynamic'
import type { TabContent, TopicItem } from '@/lib/topicWorkspaceViewModel'

const TopicWorkspaceWhiteboard = dynamic(
  () => import('@/components/topic-workspace/TopicWorkspaceWhiteboard')
    .then((mod) => mod.TopicWorkspaceWhiteboard),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[460px] place-items-center rounded-[18px] border border-[#e4e4e7] bg-[#fbfcff] text-sm font-black text-[#71717b]">
        Loading whiteboard...
      </div>
    ),
  },
)

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
