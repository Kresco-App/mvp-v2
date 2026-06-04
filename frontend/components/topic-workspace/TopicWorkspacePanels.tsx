'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { getJson, postJson } from '@/lib/apiClient'
import {
  animatedConfigForTab,
  isAnimatedTab,
  isCommentsTab,
  lockedContentReason,
  resolveAnimatedRendererKey,
  tabMatchesSlot,
  type TabContent,
  type TopicItem,
} from '@/lib/topicWorkspaceViewModel'
import { AnimatedContentRenderer } from '@/components/animated/registry'
import type { AnimatedCompletionEvent, AnimatedRendererProps } from '@/components/animated/types'
import { EmptyTabPanel } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'
import { TopicWorkspaceNotesTab } from '@/components/topic-workspace/TopicWorkspaceNotesTab'
import { TopicWorkspaceQuizTab } from '@/components/topic-workspace/TopicWorkspaceQuizTab'
import { TopicWorkspaceResourcePanel } from '@/components/topic-workspace/TopicWorkspaceResourcePanel'

export function LockedContentPanel({
  reason,
  title,
  summary,
}: {
  reason?: string
  title?: string
  summary?: string
}) {
  return (
    <div className="rounded-[16px] border border-[#e4e4e7] bg-[#f7f8fb] p-5">
      <p className="m-0 text-[13px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">Locked preview</p>
      <p className="m-0 mt-2 text-[16px] font-black text-[#3f3f46]">{title || lockedContentReason(reason)}</p>
      <p className="m-0 mt-2 text-[13px] font-semibold leading-6 text-[#71717b]">
        {summary || 'This learning item is visible in the topic path, but the protected lesson content is not available for the current account.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
          {lockedContentReason(reason)}
        </span>
        <Link className="rounded-full bg-[#fff7df] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#b76b00] transition hover:bg-[#ffe8ad]" href="/pricing">
          Upgrade to unlock
        </Link>
      </div>
    </div>
  )
}

function AnimatedTabPanel({
  tab,
  item,
  topicId,
  onComplete,
}: {
  tab: TabContent
  item: TopicItem
  topicId: number
  onComplete?: () => void | Promise<void>
}) {
  const rendererKey = resolveAnimatedRendererKey(tab, item)
  const rendererProps: AnimatedRendererProps & { topicId: number; activeItem: TopicItem } = {
    rendererKey,
    config: animatedConfigForTab(tab, item, topicId),
    tab,
    item,
    topicId,
    activeItem: item,
    onComplete: (event: AnimatedCompletionEvent) => {
      if (event.completed) void onComplete?.()
    },
  }

  return <AnimatedContentRenderer {...rendererProps} />
}

type TopicComment = {
  id: number
  topic_item_id: number
  body: string
  author: {
    id: number
    full_name: string
    avatar_url: string
  }
  created_at: string
}

function CommentsTab({ item }: { item: TopicItem }) {
  const [comments, setComments] = useState<TopicComment[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    getJson<TopicComment[]>('/interactions/comments', {
      params: { topic_item_id: item.id },
      signal: controller.signal,
    })
      .then((data) => {
        setComments(data)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setComments([])
        toast.error('Could not load comments.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [item.id])

  async function postComment() {
    if (!body.trim()) return
    setPosting(true)
    try {
      const data = await postJson<TopicComment>('/interactions/comments', {
        topic_item_id: item.id,
        body: body.trim(),
      })
      setComments((prev) => [...prev, data])
      setBody('')
      toast.success('Comment posted.')
    } catch {
      toast.error('Could not post comment.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="grid max-w-[760px] gap-4">
      <div className="rounded-[14px] border border-[#e4e4e7] bg-white">
        <textarea
          aria-label="Topic item comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-24 w-full resize-y rounded-t-[14px] border-0 bg-white px-4 py-3 text-[14px] font-semibold leading-6 text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
          placeholder="Ask a question or add context for this item"
        />
        <div className="flex items-center justify-end border-t border-[#f4f4f5] px-3 py-2">
          <button
            type="button"
            onClick={postComment}
            disabled={posting || !body.trim()}
            className="inline-flex h-8 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
          >
            <Send size={13} />
            Post
          </button>
        </div>
      </div>

      {loading ? (
        <p className="m-0 text-[13px] font-bold text-[#9f9fa9]">Loading comments...</p>
      ) : comments.length === 0 ? (
        <EmptyTabPanel title="No comments yet" message="Comments are enabled for this item, but nobody has posted yet." />
      ) : (
        <div className="grid gap-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3 rounded-[14px] border border-[#e4e4e7] bg-white p-4">
              {comment.author.avatar_url ? (
                <Image
                  src={comment.author.avatar_url}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#f7f8fb] text-[12px] font-black text-[#71717b]">
                  {comment.author.full_name?.[0] || '?'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-black text-[#3f3f46]">{comment.author.full_name}</span>
                  <span className="text-[11px] font-bold text-[#9f9fa9]">{new Date(comment.created_at).toLocaleDateString()}</span>
                </div>
                <p className="m-0 mt-1 whitespace-pre-line break-words text-[13px] font-semibold leading-6 text-[#52525c]">{comment.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TabPanel({
  tab,
  item,
  topicId,
  onNoteSaved,
  onItemComplete,
}: {
  tab: TabContent
  item: TopicItem
  topicId: number
  onNoteSaved: () => void
  onItemComplete?: () => void | Promise<void>
}) {
  if (item.can_access === false || tab.can_access === false) {
    return (
      <LockedContentPanel
        reason={item.locked_reason || tab.locked_reason}
        title={item.title}
        summary={item.description || tab.content || tab.resource?.summary}
      />
    )
  }

  if (tab.is_missing) {
    return (
      <EmptyTabPanel
        title={tab.empty_title || 'Content unavailable'}
        message={tab.empty_message || 'This tab does not have content attached yet.'}
      />
    )
  }

  if (tabMatchesSlot(tab, 'quiz')) return <TopicWorkspaceQuizTab tab={tab} />

  if (isCommentsTab(tab)) return <CommentsTab item={item} />

  if (tabMatchesSlot(tab, 'notes')) {
    return <TopicWorkspaceNotesTab tab={tab} item={item} topicId={topicId} onNoteSaved={onNoteSaved} />
  }

  if (isAnimatedTab(tab, item)) {
    return (
      <AnimatedTabPanel
        tab={tab}
        item={item}
        topicId={topicId}
        onComplete={onItemComplete}
      />
    )
  }

  const body = tab.content || tab.resource?.summary
  if (!body && !tab.resource) {
    return (
      <EmptyTabPanel
        title="No content yet"
        message="This tab is present, but it does not have displayable content."
      />
    )
  }

  return (
    <div>
      {body && <p className="m-0 whitespace-pre-line text-sm font-semibold leading-7 text-[#52525c]">{body}</p>}
      {tab.resource && <TopicWorkspaceResourcePanel resource={tab.resource} item={item} tab={tab} />}
    </div>
  )
}
