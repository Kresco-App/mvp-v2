'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown, ChevronUp, CornerDownRight, Loader2, Send, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { getJson, postJson } from '@/lib/apiClient'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import { getTopicInteractionData, updateTopicInteractionCache, writeTopicInteractionCache } from '@/lib/topicInteractionCache'
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
import { courseDocumentFromConfig, type CourseDocument } from '@/lib/courseContentDocument'
import type { AnimatedCompletionEvent, AnimatedRendererProps } from '@/components/animated/types'
import { EmptyTabPanel } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'
import { TopicWorkspaceNotesTab } from '@/components/topic-workspace/TopicWorkspaceNotesTab'
import { TopicWorkspaceResourcePanel } from '@/components/topic-workspace/TopicWorkspaceResourcePanel'

const DeferredAnimatedContentRenderer = dynamic<AnimatedRendererProps>(
  () => import('@/components/animated/registry').then((mod) => mod.AnimatedContentRenderer),
  {
    ssr: false,
    loading: () => <DeferredRendererLoading label="Loading interactive lesson..." />,
  },
)

const DeferredCourseContentRenderer = dynamic<{ document: CourseDocument; className?: string }>(
  () => import('@/components/topic-workspace/CourseContentRenderer').then((mod) => mod.CourseContentRenderer),
  {
    ssr: false,
    loading: () => <DeferredRendererLoading label="Loading course content..." />,
  },
)
const topicWorkspaceControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const topicWorkspaceFieldMotionClass = 'transition-[border-color,box-shadow] duration-150 ease-out focus-visible:border-[#3a2fd3] focus-visible:shadow-[0_0_0_3px_rgba(58,47,211,0.10)] motion-reduce:transition-none'
const topicWorkspaceRatingMotionClass = 'transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f5b800]/20 motion-reduce:transition-none motion-reduce:active:scale-100'

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
      <p className="m-0 mt-2 break-words text-[16px] font-black text-[#3f3f46]">{title || lockedContentReason(reason)}</p>
      <p className="m-0 mt-2 break-words text-[13px] font-semibold leading-6 text-[#71717b]">
        {summary || 'This learning item is visible in the topic path, but the protected lesson content is not available for the current account.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
          {lockedContentReason(reason)}
        </span>
        <Link className={`inline-flex min-h-10 items-center rounded-full bg-[#fff7df] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#b76b00] hover:bg-[#ffe8ad] ${topicWorkspaceControlMotionClass}`} href="/pricing">
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

  return <DeferredAnimatedContentRenderer {...rendererProps} />
}

function DeferredRendererLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[16px] border border-[#e4e4e7] bg-[#fbfcff] px-4 text-center text-[13px] font-black text-[#71717b]" role="status" aria-label={label}>
      {label}
    </div>
  )
}

type TopicComment = {
  id: number
  topic_item_id: number
  parent_id?: number | null
  reply_count?: number
  body: string
  rating?: number
  author: {
    id: number
    full_name: string
    avatar_url: string
  }
  created_at: string
}

type CommentReaction = 'like' | 'dislike'

function CommentsTab({ item }: { item: TopicItem }) {
  const [comments, setComments] = useState<TopicComment[]>([])
  const [body, setBody] = useState('')
  const [draftRating, setDraftRating] = useState(0)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<number | null>(null)
  const [replyBodies, setReplyBodies] = useState<Record<number, string>>({})
  const [replyPosting, setReplyPosting] = useState<Record<number, boolean>>({})
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({})
  const [loadingReplies, setLoadingReplies] = useState<Record<number, boolean>>({})
  const [loadedReplies, setLoadedReplies] = useState<Record<number, boolean>>({})
  const [repliesByComment, setRepliesByComment] = useState<Record<number, TopicComment[]>>({})
  const [reactions, setReactions] = useState<Record<number, CommentReaction | null>>({})
  const [ratings, setRatings] = useState<Record<number, number>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setReplyingTo(null)
    setReplyBodies({})
    setReplyPosting({})
    setExpandedReplies({})
    setLoadingReplies({})
    setLoadedReplies({})
    setRepliesByComment({})
    getTopicInteractionData(
      topicCommentsCacheKey(item.id),
      () => getJson<TopicComment[]>('/interactions/comments', {
        params: { topic_item_id: item.id },
      }),
    )
      .then((data) => {
        if (cancelled) return
        setComments(data)
      })
      .catch(() => {
        if (cancelled) return
        setComments([])
        showToastError('Could not load comments.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item.id])

  async function postComment() {
    const trimmedBody = body.trim()
    if (!trimmedBody) return
    setPosting(true)
    try {
      const payload: { topic_item_id: number; body: string; rating?: number } = {
        topic_item_id: item.id,
        body: trimmedBody,
      }
      if (draftRating > 0) payload.rating = draftRating
      const data = await postJson<TopicComment>('/interactions/comments', payload)
      setComments((prev) => {
        const next = [...prev, data]
        writeTopicInteractionCache(topicCommentsCacheKey(item.id), next)
        return next
      })
      if (draftRating > 0) {
        setRatings((prev) => ({ ...prev, [data.id]: draftRating }))
      }
      setBody('')
      setDraftRating(0)
      showToastSuccess('Comment posted.')
    } catch {
      showToastError('Could not post comment.')
    } finally {
      setPosting(false)
    }
  }

  async function postReply(parentId: number) {
    const trimmedBody = (replyBodies[parentId] ?? '').trim()
    if (!trimmedBody || replyPosting[parentId]) return
    setReplyPosting((prev) => ({ ...prev, [parentId]: true }))
    try {
      const data = await postJson<TopicComment>('/interactions/comments', {
        topic_item_id: item.id,
        parent_id: parentId,
        body: trimmedBody,
      })
      setRepliesByComment((prev) => ({
        ...prev,
        [parentId]: [...(prev[parentId] ?? []), data],
      }))
      updateTopicInteractionCache<TopicComment[]>(topicCommentRepliesCacheKey(item.id, parentId), (cached) => [
        ...(cached.hit ? cached.data : repliesByComment[parentId] ?? []),
        data,
      ])
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }))
      setComments((prev) => {
        const next = prev.map((comment) => (
          comment.id === parentId
            ? { ...comment, reply_count: (comment.reply_count ?? 0) + 1 }
            : comment
        ))
        writeTopicInteractionCache(topicCommentsCacheKey(item.id), next)
        return next
      })
      setReplyBodies((prev) => ({ ...prev, [parentId]: '' }))
      setReplyingTo(null)
      showToastSuccess('Reply posted.')
    } catch {
      showToastError('Could not post reply.')
    } finally {
      setReplyPosting((prev) => ({ ...prev, [parentId]: false }))
    }
  }

  async function toggleReplies(comment: TopicComment) {
    const isExpanded = Boolean(expandedReplies[comment.id])
    if (isExpanded) {
      setExpandedReplies((prev) => ({ ...prev, [comment.id]: false }))
      return
    }

    setExpandedReplies((prev) => ({ ...prev, [comment.id]: true }))
    const knownReplyCount = Math.max(comment.reply_count ?? 0, repliesByComment[comment.id]?.length ?? 0)
    if (loadedReplies[comment.id] || knownReplyCount === 0) return

    setLoadingReplies((prev) => ({ ...prev, [comment.id]: true }))
    try {
      const data = await getTopicInteractionData(
        topicCommentRepliesCacheKey(item.id, comment.id),
        () => getJson<TopicComment[]>('/interactions/comments', {
          params: { topic_item_id: item.id, parent_id: comment.id },
        }),
      )
      setRepliesByComment((prev) => ({ ...prev, [comment.id]: data }))
      setLoadedReplies((prev) => ({ ...prev, [comment.id]: true }))
    } catch {
      showToastError('Could not load replies.')
    } finally {
      setLoadingReplies((prev) => ({ ...prev, [comment.id]: false }))
    }
  }

  function toggleReaction(commentId: number, reaction: CommentReaction) {
    setReactions((prev) => ({
      ...prev,
      [commentId]: prev[commentId] === reaction ? null : reaction,
    }))
  }

  return (
    <section className="grid w-full max-w-[820px] gap-3" aria-label="Comments">
      <div className="overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white shadow-[0_10px_28px_rgba(24,24,27,0.05)]">
        <textarea
          id="topic-comment-input"
          aria-label="Write a comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-[76px] w-full resize-y border-0 bg-transparent px-4 pb-2 pt-4 text-[14px] font-semibold leading-6 text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
          placeholder="Write a comment or question..."
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f4f4f5] bg-[#fbfcff] px-3 py-2.5 transition-[background-color,border-color] duration-150 ease-out focus-within:border-[#3a2fd3] focus-within:bg-white motion-reduce:transition-none">
          <RatingSelector value={draftRating} onChange={setDraftRating} />
          <button
            type="button"
            onClick={postComment}
            disabled={posting || !body.trim()}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3.5 text-[13px] font-black text-white hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9] disabled:active:scale-100 ${topicWorkspaceControlMotionClass}`}
          >
            {posting ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
            Post
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3" aria-label="Loading comments">
          <div className="h-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[16px] bg-[#f4f4f5]" />
          <div className="h-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[16px] bg-[#f4f4f5]" />
        </div>
      ) : comments.length === 0 ? (
        <EmptyTabPanel title="No comments yet" message="Comments are enabled for this item, but nobody has posted yet." />
      ) : (
        <div className="grid gap-3">
          {comments.map((comment) => {
            const replies = repliesByComment[comment.id] ?? []
            const replyCount = Math.max(comment.reply_count ?? 0, replies.length)
            const repliesExpanded = Boolean(expandedReplies[comment.id])
            const isReplying = replyingTo === comment.id

            return (
              <article
                key={comment.id}
                className="grid w-full min-w-0 gap-4 overflow-hidden rounded-[18px] border border-[#e4e4e7] bg-white p-4 shadow-[0_10px_24px_rgba(24,24,27,0.04)]"
              >
                <div data-comment-main className="w-full min-w-0">
                  <CommentCard
                    comment={comment}
                    reaction={reactions[comment.id] ?? null}
                    rating={ratings[comment.id] ?? comment.rating}
                    onReact={(reaction) => toggleReaction(comment.id, reaction)}
                    onReply={() => setReplyingTo((current) => current === comment.id ? null : comment.id)}
                  />
                </div>

                {isReplying && (
                  <div className="w-full min-w-0">
                    <ReplyComposer
                      authorName={comment.author.full_name}
                      body={replyBodies[comment.id] ?? ''}
                      posting={Boolean(replyPosting[comment.id])}
                      onBodyChange={(nextBody) => setReplyBodies((prev) => ({ ...prev, [comment.id]: nextBody }))}
                      onCancel={() => setReplyingTo(null)}
                      onPost={() => void postReply(comment.id)}
                    />
                  </div>
                )}

                {replyCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void toggleReplies(comment)}
                    className={`inline-flex h-10 w-fit items-center gap-2 rounded-[10px] border border-[#e9e5ff] bg-[#f7f5ff] px-3 text-[12px] font-black text-[#3a2fd3] hover:border-[#d9d2ff] hover:bg-[#f1eeff] ${topicWorkspaceControlMotionClass}`}
                    aria-expanded={repliesExpanded}
                  >
                    {loadingReplies[comment.id] ? (
                      <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : repliesExpanded ? (
                      <ChevronUp size={14} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={14} aria-hidden="true" />
                    )}
                    {repliesExpanded ? 'Hide replies' : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
                  </button>
                )}

                {repliesExpanded && (
                  <div
                    data-comment-replies
                    className="relative grid w-full min-w-0 gap-3 rounded-[14px] bg-[#fbfcff] py-3 pl-4 pr-3 shadow-[inset_0_0_0_1px_#eef2f7] before:absolute before:bottom-3 before:left-3 before:top-3 before:w-px before:bg-[#ede9fe]"
                  >
                    {loadingReplies[comment.id] ? (
                      <div className="h-16 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[14px] bg-[#f4f4f5]" />
                    ) : replies.length === 0 ? (
                      <p className="m-0 text-[12px] font-bold text-[#9f9fa9]">No visible replies yet.</p>
                    ) : (
                      replies.map((reply) => (
                        <CommentCard
                          key={reply.id}
                          comment={reply}
                          compact
                          reaction={reactions[reply.id] ?? null}
                          rating={ratings[reply.id] ?? reply.rating}
                          onReact={(reaction) => toggleReaction(reply.id, reaction)}
                        />
                      ))
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function topicCommentsCacheKey(itemId: number) {
  return `topic-comments:${itemId}`
}

function topicCommentRepliesCacheKey(itemId: number, parentId: number) {
  return `topic-comment-replies:${itemId}:${parentId}`
}

function RatingSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((rating) => {
        const selected = rating <= value
        return (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(value === rating ? 0 : rating)}
            className={`grid h-10 w-10 place-items-center rounded-[12px] ${topicWorkspaceRatingMotionClass} ${selected ? 'bg-[#fff7db] text-[#d99700] shadow-[inset_0_0_0_1px_rgba(245,184,0,0.18)]' : 'bg-[#f4f4f5] text-[#a1a1aa] hover:bg-[#f8f9fc] hover:text-[#71717b]'}`}
            role="radio"
            aria-checked={value === rating}
            aria-label={`Rate ${rating} out of 5`}
          >
            <Star size={15} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

function CommentCard({
  comment,
  compact = false,
  reaction,
  rating,
  onReact,
  onReply,
}: {
  comment: TopicComment
  compact?: boolean
  reaction: CommentReaction | null
  rating?: number
  onReact: (reaction: CommentReaction) => void
  onReply?: () => void
}) {
  return (
    <div className={`flex w-full min-w-0 items-start gap-3 ${compact ? 'rounded-[12px] bg-white p-3 shadow-[var(--shadow-border)]' : ''}`}>
      <CommentAvatar author={comment.author} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words text-[13px] font-black text-[#3f3f46]">{comment.author.full_name}</span>
          <span className="text-[11px] font-bold text-[#9f9fa9]">{formatCommentDate(comment.created_at)}</span>
          {rating ? <RatingPill rating={rating} /> : null}
        </div>
        <p className="m-0 mt-2 whitespace-pre-line break-words text-[13px] font-semibold leading-6 text-[#52525c]">{comment.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ReactionButton
            active={reaction === 'like'}
            icon="like"
            label="Like"
            count={reaction === 'like' ? 1 : 0}
            onClick={() => onReact('like')}
          />
          <ReactionButton
            active={reaction === 'dislike'}
            icon="dislike"
            label="Dislike"
            count={reaction === 'dislike' ? 1 : 0}
            onClick={() => onReact('dislike')}
          />
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className={`inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[#e4e4e7] bg-white px-2.5 text-[12px] font-black text-[#52525c] hover:border-[#d7d7dd] hover:bg-[#f8f9fc] ${topicWorkspaceControlMotionClass}`}
            >
              <CornerDownRight size={13} aria-hidden="true" />
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CommentAvatar({ author }: { author: TopicComment['author'] }) {
  if (author.avatar_url) {
    return (
      <Image
        src={author.avatar_url}
        alt=""
        width={36}
        height={36}
        unoptimized
        className="kresco-media-outline h-9 w-9 flex-shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#f7f8fb] text-[12px] font-black text-[#71717b]">
      {author.full_name?.[0] || '?'}
    </div>
  )
}

function RatingPill({ rating }: { rating: number }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#fff7db] px-2 text-[11px] font-black text-[#b77900] tabular-nums">
      <Star size={12} fill="currentColor" aria-hidden="true" />
      {rating}/5
    </span>
  )
}

function ReactionButton({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean
  count: number
  icon: 'like' | 'dislike'
  label: string
  onClick: () => void
}) {
  const Icon = icon === 'like' ? ThumbsUp : ThumbsDown
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-2.5 text-[12px] font-black ${topicWorkspaceControlMotionClass} ${active ? 'border-[#c7d2fe] bg-[#eef2ff] text-[#3a2fd3] shadow-[inset_0_0_0_1px_rgba(58,47,211,0.08)]' : 'border-[#e4e4e7] bg-white text-[#71717b] hover:border-[#d7d7dd] hover:bg-[#f8f9fc] hover:text-[#52525c]'}`}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
      {count > 0 && <span>{count}</span>}
    </button>
  )
}

function ReplyComposer({
  authorName,
  body,
  posting,
  onBodyChange,
  onCancel,
  onPost,
}: {
  authorName: string
  body: string
  posting: boolean
  onBodyChange: (body: string) => void
  onCancel: () => void
  onPost: () => void
}) {
  return (
    <div
      className="mt-4 rounded-[14px] border border-[#e9e5ff] bg-[#fbfaff] p-3"
    >
      <textarea
        aria-label={`Reply to ${authorName}`}
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        className={`min-h-20 w-full resize-y rounded-[12px] border border-[#e4e4e7] bg-white px-3 py-2 text-[13px] font-semibold leading-6 text-[#3f3f46] outline-none placeholder:text-[#a1a1aa] ${topicWorkspaceFieldMotionClass}`}
        placeholder={`Reply to ${authorName}`}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={posting}
          className={`inline-flex h-10 items-center rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] hover:border-[#cfd2dc] hover:bg-[#f8f9fc] disabled:opacity-50 disabled:active:scale-100 ${topicWorkspaceControlMotionClass}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onPost}
          disabled={posting || !body.trim()}
          className={`inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9] disabled:active:scale-100 ${topicWorkspaceControlMotionClass}`}
        >
          {posting ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
          Post reply
        </button>
      </div>
    </div>
  )
}

function formatCommentDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return date.toLocaleDateString()
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
        summary={item.description}
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

  if (isCommentsTab(tab)) return <CommentsTab item={item} />

  if (tabMatchesSlot(tab, 'notes')) {
    return <TopicWorkspaceNotesTab tab={tab} item={item} topicId={topicId} onNoteSaved={onNoteSaved} />
  }

  const courseDocument = tabMatchesSlot(tab, 'course') ? courseDocumentFromConfig(tab.config_json) : null
  if (courseDocument) {
    return <DeferredCourseContentRenderer document={courseDocument} />
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
      {body && <p className="m-0 whitespace-pre-line break-words text-sm font-semibold leading-7 text-[#52525c]">{body}</p>}
      {tab.resource && <TopicWorkspaceResourcePanel resource={tab.resource} item={item} tab={tab} />}
    </div>
  )
}
