'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ListChecks, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { getJson, postJson } from '@/lib/apiClient'
import {
  animatedConfigForTab,
  isAnimatedTab,
  isCommentsTab,
  lockedContentReason,
  normalizeOptionKey,
  resolveAnimatedRendererKey,
  splitOrderingInput,
  tabMatchesSlot,
  toggleMultiAnswer,
  type TabContent,
  type TopicItem,
} from '@/lib/topicWorkspaceViewModel'
import { AnimatedContentRenderer } from '@/components/animated/registry'
import type { AnimatedCompletionEvent, AnimatedRendererProps } from '@/components/animated/types'

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
        <span className="rounded-full bg-[#fff7df] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#b76b00]">
          Upgrade to unlock
        </span>
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

function QuizQuestion({
  question,
  value,
  onChange,
}: {
  question: any
  value: any
  onChange: (value: any) => void
}) {
  const type = question.type || 'multiple_choice'
  const options = question.options || ['true', 'false']
  const normalizeOption = (option: any) => {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const optionValue = option.id ?? option.value ?? option.key ?? option.text ?? option.label
      return {
        key: String(optionValue),
        value: optionValue,
        label: String(option.text ?? option.label ?? optionValue),
      }
    }
    return {
      key: String(option),
      value: option,
      label: String(option),
    }
  }

  if (type === 'multiple_choice' || type === 'true_false') {
    return (
      <div className="grid gap-2">
        {options.map((rawOption: any) => {
          const option = normalizeOption(rawOption)
          return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${
              String(value) === String(option.value) ? 'border-[#29aee4] bg-[#29aee4] text-white' : 'border-[#e4e4e7] bg-[#f7f8fb] text-[#71717b]'
            }`}
          >
            {option.label}
          </button>
        )})}
      </div>
    )
  }

  if (type === 'multi_select') {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="grid gap-2">
        {(question.options || []).map((rawOption: any) => {
          const option = normalizeOption(rawOption)
          const isSelected = selected.includes(String(option.value))
          return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(toggleMultiAnswer(value, option.value))}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${
              isSelected ? 'border-[#29aee4] bg-[#eaf8ff] text-[#1292cf]' : 'border-[#e4e4e7] bg-[#f7f8fb] text-[#71717b]'
            }`}
          >
            {isSelected ? 'Selected: ' : ''}{option.label}
          </button>
        )})}
      </div>
    )
  }

  if (type === 'matching') {
    const pairs = question.pairs || Object.keys(question.answer || {}).map((left) => ({ left, right: question.answer[left] }))
    const answers = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return (
      <div className="grid gap-2">
        {pairs.map((pair: any) => (
          <label key={pair.left} className="grid gap-1 rounded-2xl border border-[#e4e4e7] bg-[#f7f8fb] p-3">
            <span className="text-xs font-black text-[#71717b]">{pair.left}</span>
            <input
              aria-label={`Match for ${pair.left}`}
              className="figma-input w-full bg-white"
              value={answers[pair.left] || ''}
              onChange={(event) => onChange({ ...answers, [pair.left]: event.target.value })}
              placeholder="Match"
            />
          </label>
        ))}
      </div>
    )
  }

  if (type === 'ordering') {
    const orderingValue = Array.isArray(value) ? value.join(', ') : normalizeOptionKey(value)
    return (
      <div className="grid gap-2">
        {question.items && (
          <div className="flex flex-wrap gap-2">
            {question.items.map((item: string) => (
              <span key={item} className="rounded-full bg-[#f7f8fb] px-3 py-1 text-xs font-black text-[#71717b]">{item}</span>
            ))}
          </div>
        )}
        <input
          aria-label="Comma-separated order"
          className="figma-input w-full"
          value={orderingValue}
          onChange={(event) => onChange(splitOrderingInput(event.target.value))}
          placeholder="Comma-separated order"
        />
      </div>
    )
  }

  if (type === 'drag_and_drop') {
    const answers = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const items = question.items || Object.keys(question.answer || {}).map((id) => ({ id, label: id }))
    const zones = question.zones || Array.from(new Set(Object.values(question.answer || {})))
    return (
      <div className="grid gap-2">
        {items.map((item: any) => (
          <label key={item.id} className="grid gap-1 rounded-2xl border border-[#e4e4e7] bg-[#f7f8fb] p-3">
            <span className="text-xs font-black text-[#71717b]">{item.label || item.id}</span>
            <select
              aria-label={`Zone for ${item.label || item.id}`}
              className="figma-input w-full bg-white"
              value={answers[item.id] || ''}
              onChange={(event) => onChange({ ...answers, [item.id]: event.target.value })}
            >
              <option value="">Choose zone</option>
              {zones.map((zone: any) => (
                <option key={String(zone)} value={String(zone)}>{String(zone)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    )
  }

  const placeholder = type === 'numeric_answer' ? 'Numeric answer' : type === 'fill_in_blank' ? 'Fill the blank' : type === 'interactive_checkpoint' ? 'Checkpoint answer' : 'Short answer'

  return (
    <input
      aria-label={placeholder}
      className="figma-input w-full"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      inputMode={type === 'numeric_answer' ? 'decimal' : 'text'}
    />
  )
}

const QuizQuestionCard = memo(function QuizQuestionCard({
  question,
  index,
  value,
  onAnswerChange,
}: {
  question: any
  index: number
  value: any
  onAnswerChange: (questionId: string | number, value: any) => void
}) {
  return (
    <div className="rounded-2xl border border-[#e4e4e7] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="m-0 text-sm font-black text-[#3f3f46]">{index + 1}. {question.prompt}</p>
        <span className="rounded-full bg-[#f7f8fb] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
          {String(question.type || 'multiple_choice').replace(/_/g, ' ')}
        </span>
      </div>
      <QuizQuestion
        question={question}
        value={value}
        onChange={(nextValue) => onAnswerChange(question.id, nextValue)}
      />
    </div>
  )
})

function QuizTab({ tab }: { tab: TabContent }) {
  const questions = useMemo(
    () => (Array.isArray(tab.config_json?.questions) ? tab.config_json.questions : []),
    [tab.config_json],
  )
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [result, setResult] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const setQuestionAnswer = useCallback((questionId: string | number, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  if (questions.length === 0) {
    return (
      <EmptyTabPanel
        title="No quiz questions yet"
        message="This quiz tab is present, but it does not contain any questions."
      />
    )
  }

  async function submit() {
    if (!tab.id) return
    setSubmitting(true)
    try {
      const data = await postJson<any>(`/courses/tabs/${tab.id}/quiz/submit`, { answers })
      setResult(data)
      toast.success(`Quiz submitted: ${data.score}%`)
    } catch {
      toast.error('Quiz submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {questions.map((question: any, index: number) => (
        <QuizQuestionCard
          key={question.id}
          question={question}
          index={index}
          value={answers[question.id]}
          onAnswerChange={setQuestionAnswer}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={submitting} className="figma-button disabled:opacity-50">
          {submitting ? 'Submitting...' : 'Submit quiz'}
        </button>
        {result && (
          <span className="rounded-full bg-[#fff7df] px-4 py-2 text-xs font-black text-[#b76b00]">
            Score {result.score}% - +{result.xp_earned} XP
          </span>
        )}
      </div>
    </div>
  )
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
                <p className="m-0 mt-1 whitespace-pre-line text-[13px] font-semibold leading-6 text-[#52525c]">{comment.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyTabPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="grid min-h-[156px] max-w-[760px] place-items-center rounded-[16px] border border-dashed border-[#d4d4d8] bg-[#f7f8fb] px-6 py-8 text-center">
      <div>
        <p className="m-0 text-[16px] font-black text-[#3f3f46]">{title}</p>
        <p className="m-0 mt-2 text-[13px] font-semibold leading-6 text-[#71717b]">{message}</p>
      </div>
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
  const [note, setNote] = useState('')

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

  async function saveNote() {
    if (!note.trim()) return
    try {
      await postJson('/interactions/notes', {
        topic_id: topicId,
        topic_item_id: item.id,
        ...(tab.id ? { tab_content_id: tab.id } : {}),
        body: note,
      })
      setNote('')
      onNoteSaved()
      toast.success('Note saved.')
    } catch {
      toast.error('Could not save note.')
    }
  }

  if (tabMatchesSlot(tab, 'quiz')) return <QuizTab tab={tab} />

  if (isCommentsTab(tab)) return <CommentsTab item={item} />

  if (tabMatchesSlot(tab, 'notes')) {
    return (
      <div className="max-w-[760px] rounded-[14px] border border-[#e4e4e7] bg-white">
        <textarea
          aria-label="Topic note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-24 w-full resize-y rounded-t-[14px] border-0 bg-white px-4 py-3 text-[14px] font-semibold leading-6 text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
          placeholder="Write a short note for this item"
        />
        <div className="flex items-center justify-between border-t border-[#f4f4f5] px-3 py-2">
          <span className="text-[11px] font-bold text-[#9f9fa9]">Saved locally to your notes hub</span>
          <button
            type="button"
            onClick={saveNote}
            disabled={!note.trim()}
            className="inline-flex h-8 items-center rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white transition hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#9f9fa9]"
          >
            Save note
          </button>
        </div>
      </div>
    )
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
      {tab.resource && (
        <div className="mt-4 rounded-2xl border border-[#e4e4e7] bg-[#f7f8fb] p-4">
          <p className="m-0 text-sm font-black text-[#3f3f46]">{tab.resource.title}</p>
          <p className="m-0 mt-1 text-xs font-bold text-[#71717b]">{tab.resource.resource_type}</p>
        </div>
      )}
    </div>
  )
}

export function TopicWorkspaceToolbar({
  query,
  resultCount,
  onQueryChange,
  onSearch,
}: {
  query: string
  resultCount: number
  onQueryChange: (value: string) => void
  onSearch: () => void
}) {
  return (
    <div className="kresco-enter grid w-[351px] max-w-full justify-items-start gap-3" style={{ animationDelay: '40ms' }}>
      <form
        className="relative w-full"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch()
        }}
      >
        <Search size={17} className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-[#9f9fa9]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="figma-input h-[52px] w-full !pl-[52px] !pr-[18px] text-[15px]"
          placeholder="Search this topic"
          aria-label="Search this topic"
        />
      </form>

      <div className="inline-flex h-[48px] items-center gap-2 rounded-[16px] bg-[#f7f8fb] px-4 text-[13px] font-black text-[#3f3f46]">
        <ListChecks size={15} />
        Main Path
      </div>

      {query.trim() && (
        <span className="text-[12px] font-black text-[#71717b]">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

export function TopicSearchResults({
  query,
  items,
  onSelect,
}: {
  query: string
  items: TopicItem[]
  onSelect: (item: TopicItem) => void
}) {
  if (!query.trim()) return null

  return (
    <section className="rounded-[16px] border border-[#e4e4e7] bg-[#f7f8fb] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <strong className="text-[13px] font-black text-[#3f3f46]">Topic search</strong>
        <span className="text-[12px] font-black text-[#9f9fa9]">{items.length} match{items.length === 1 ? '' : 'es'}</span>
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="rounded-[12px] bg-white px-4 py-3 text-left text-[13px] font-black text-[#3f3f46] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(24,24,27,0.08)]"
            >
              {item.title}
              <span className="ml-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9f9fa9]">{item.item_type}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="m-0 text-[13px] font-bold text-[#71717b]">No item, tab, resource, or concept tag matched this search.</p>
      )}
    </section>
  )
}
