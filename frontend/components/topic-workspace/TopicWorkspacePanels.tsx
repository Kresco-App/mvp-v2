'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronUp, CornerDownRight, Loader2, Send, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
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
import { CourseContentRenderer, courseDocumentFromConfig } from '@/components/topic-workspace/CourseContentRenderer'
import { EmptyTabPanel } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'
import { TopicWorkspaceNotesTab } from '@/components/topic-workspace/TopicWorkspaceNotesTab'
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
  const reduceMotion = useReducedMotion()
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
    const controller = new AbortController()
    setLoading(true)
    setReplyingTo(null)
    setReplyBodies({})
    setReplyPosting({})
    setExpandedReplies({})
    setLoadingReplies({})
    setLoadedReplies({})
    setRepliesByComment({})
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
      setComments((prev) => [...prev, data])
      if (draftRating > 0) {
        setRatings((prev) => ({ ...prev, [data.id]: draftRating }))
      }
      setBody('')
      setDraftRating(0)
      toast.success('Comment posted.')
    } catch {
      toast.error('Could not post comment.')
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
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }))
      setComments((prev) => prev.map((comment) => (
        comment.id === parentId
          ? { ...comment, reply_count: (comment.reply_count ?? 0) + 1 }
          : comment
      )))
      setReplyBodies((prev) => ({ ...prev, [parentId]: '' }))
      setReplyingTo(null)
      toast.success('Reply posted.')
    } catch {
      toast.error('Could not post reply.')
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
      const data = await getJson<TopicComment[]>('/interactions/comments', {
        params: { topic_item_id: item.id, parent_id: comment.id },
      })
      setRepliesByComment((prev) => ({ ...prev, [comment.id]: data }))
      setLoadedReplies((prev) => ({ ...prev, [comment.id]: true }))
    } catch {
      toast.error('Could not load replies.')
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
    <motion.section
      className="grid w-full max-w-[820px] gap-3"
      aria-label="Comments"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <motion.div
        className="overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white shadow-[0_10px_28px_rgba(24,24,27,0.05)]"
        whileHover={reduceMotion ? undefined : { y: -1 }}
        transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <textarea
          id="topic-comment-input"
          aria-label="Write a comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-[76px] w-full resize-y border-0 bg-transparent px-4 pb-2 pt-4 text-[14px] font-semibold leading-6 text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
          placeholder="Write a comment or question..."
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f4f4f5] bg-[#fbfcff] px-3 py-2.5 transition focus-within:border-[#3a2fd3]">
          <RatingSelector value={draftRating} onChange={setDraftRating} />
          <button
            type="button"
            onClick={postComment}
            disabled={posting || !body.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3.5 text-[13px] font-black text-white transition hover:bg-[#2f27b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a2fd3]/30 disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
          >
            {posting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
            Post
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="grid gap-3" aria-label="Loading comments">
          <div className="h-24 animate-pulse rounded-[16px] bg-[#f4f4f5]" />
          <div className="h-24 animate-pulse rounded-[16px] bg-[#f4f4f5]" />
        </div>
      ) : comments.length === 0 ? (
        <EmptyTabPanel title="No comments yet" message="Comments are enabled for this item, but nobody has posted yet." />
      ) : (
        <div className="grid gap-3">
          <AnimatePresence initial={false}>
          {comments.map((comment, index) => {
            const replies = repliesByComment[comment.id] ?? []
            const replyCount = Math.max(comment.reply_count ?? 0, replies.length)
            const repliesExpanded = Boolean(expandedReplies[comment.id])
            const isReplying = replyingTo === comment.id

            return (
              <motion.article
                key={comment.id}
                layout
                className="rounded-[18px] border border-[#e4e4e7] bg-white p-4 shadow-[0_10px_24px_rgba(24,24,27,0.04)]"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.12), ease: [0.2, 0.8, 0.2, 1] }}
              >
                <CommentCard
                  comment={comment}
                  reaction={reactions[comment.id] ?? null}
                  rating={ratings[comment.id] ?? comment.rating}
                  onReact={(reaction) => toggleReaction(comment.id, reaction)}
                  onReply={() => setReplyingTo((current) => current === comment.id ? null : comment.id)}
                />

                {isReplying && (
                  <ReplyComposer
                    authorName={comment.author.full_name}
                    body={replyBodies[comment.id] ?? ''}
                    posting={Boolean(replyPosting[comment.id])}
                    onBodyChange={(nextBody) => setReplyBodies((prev) => ({ ...prev, [comment.id]: nextBody }))}
                    onCancel={() => setReplyingTo(null)}
                    onPost={() => void postReply(comment.id)}
                  />
                )}

                {replyCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void toggleReplies(comment)}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#e9e5ff] bg-[#f7f5ff] px-3 text-[12px] font-black text-[#3a2fd3] transition hover:border-[#d9d2ff] hover:bg-[#f1eeff]"
                    aria-expanded={repliesExpanded}
                  >
                    {loadingReplies[comment.id] ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : repliesExpanded ? (
                      <ChevronUp size={14} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={14} aria-hidden="true" />
                    )}
                    {repliesExpanded ? 'Hide replies' : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
                  </button>
                )}

                <AnimatePresence initial={false}>
                {repliesExpanded && (
                  <motion.div
                    className="mt-4 grid gap-3 border-l-2 border-[#ede9fe] pl-4"
                    initial={reduceMotion ? false : { opacity: 0, height: 0, y: -4 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, height: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    {loadingReplies[comment.id] ? (
                      <div className="h-16 animate-pulse rounded-[14px] bg-[#f4f4f5]" />
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
                  </motion.div>
                )}
                </AnimatePresence>
              </motion.article>
            )
          })}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  )
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
            className={`grid h-8 w-8 place-items-center rounded-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b800]/30 ${selected ? 'bg-[#fff7db] text-[#d99700]' : 'bg-[#f4f4f5] text-[#a1a1aa] hover:bg-[#f8f9fc] hover:text-[#71717b]'}`}
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
    <div className={`flex min-w-0 gap-3 ${compact ? 'rounded-[14px] bg-[#fbfcff] p-3' : ''}`}>
      <CommentAvatar author={comment.author} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-black text-[#3f3f46]">{comment.author.full_name}</span>
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
              className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#e4e4e7] bg-white px-2.5 text-[12px] font-black text-[#52525c] transition hover:border-[#d7d7dd] hover:bg-[#f8f9fc]"
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
        className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
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
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#fff7db] px-2 text-[11px] font-black text-[#b77900]">
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
      className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-[12px] font-black transition ${active ? 'border-[#c7d2fe] bg-[#eef2ff] text-[#3a2fd3]' : 'border-[#e4e4e7] bg-white text-[#71717b] hover:border-[#d7d7dd] hover:bg-[#f8f9fc] hover:text-[#52525c]'}`}
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
    <motion.div
      className="mt-4 rounded-[14px] border border-[#e9e5ff] bg-[#fbfaff] p-3"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <textarea
        aria-label={`Reply to ${authorName}`}
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        className="min-h-20 w-full resize-y rounded-[12px] border border-[#e4e4e7] bg-white px-3 py-2 text-[13px] font-semibold leading-6 text-[#3f3f46] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#3a2fd3] focus:shadow-[0_0_0_3px_rgba(58,47,211,0.10)]"
        placeholder={`Reply to ${authorName}`}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={posting}
          className="inline-flex h-8 items-center rounded-[9px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onPost}
          disabled={posting || !body.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
        >
          {posting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
          Post reply
        </button>
      </div>
    </motion.div>
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
    return <CourseContentRenderer document={courseDocument} />
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
