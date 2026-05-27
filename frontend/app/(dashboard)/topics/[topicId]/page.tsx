'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Beaker,
  Bookmark,
  BookOpen,
  Check,
  FileText,
  ListChecks,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import api from '@/lib/axios'
import { apiDataErrorMessage } from '@/lib/apiData'
import {
  defaultTopicWorkspaceDataRequest,
  topicWorkspaceSWRKey,
  useTopicWorkspaceData,
  type TopicWorkspaceDataRequest,
} from '@/lib/topicWorkspaceData'
import {
  activeSectionIdForWorkspace,
  animatedConfigForTab,
  buildRailSections,
  buildTopicLookups,
  defaultSecondaryTabSlotForItem,
  formatTopicItemDuration,
  isCommentsTab,
  isAnimatedTab,
  lockedContentReason,
  lockedVideoSrcDoc,
  missingVideoSrcDoc,
  normalizeOptionKey,
  parseTopicWorkspaceQuery,
  resolveAnimatedRendererKey,
  resolvePrimaryTab,
  resolveTabForSlot,
  secondaryTabSlotSpecsForItem,
  selectTopicWorkspaceQueryState,
  splitOrderingInput,
  tabMatchesSlot,
  topicWorkspaceQueryTargetsFromItemId,
  toggleMultiAnswer,
  youtubeSrcDoc,
  youtubeVideoId,
  youtubeVideoIdForTab,
  type TabContent,
  type TopicItem,
  type TopicWorkspace,
  type WorkspaceTabSlot,
} from '@/lib/topicWorkspaceViewModel'
import { AnimatedContentRenderer } from '@/components/animated/registry'
import type { AnimatedCompletionEvent, AnimatedRendererProps } from '@/components/animated/types'
import { LessonBody, PrimaryContentFrame, VideoLearningWorkspace, VideoPlayerFrame, type FigmaRailItem, type FigmaRailSection, type FigmaTabItem } from '@/components/figma'
import { FigmaVideoWorkspaceSkeleton } from '@/components/figma/skeletons'
import RouteErrorState from '@/components/RouteErrorState'

const workspaceTabIcons: Record<WorkspaceTabSlot, LucideIcon> = {
  course: BookOpen,
  lab: Beaker,
  quiz: ListChecks,
  resources: FileText,
  notes: StickyNote,
  comments: MessageSquare,
}

function LockedContentPanel({
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

  if (type === 'multiple_choice' || type === 'true_false') {
    return (
      <div className="grid gap-2">
        {options.map((option: string) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${
              value === option ? 'border-[#29aee4] bg-[#29aee4] text-white' : 'border-[#e4e4e7] bg-[#f7f8fb] text-[#71717b]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    )
  }

  if (type === 'multi_select') {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="grid gap-2">
        {(question.options || []).map((option: string) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(toggleMultiAnswer(value, option))}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${
              selected.includes(option) ? 'border-[#29aee4] bg-[#eaf8ff] text-[#1292cf]' : 'border-[#e4e4e7] bg-[#f7f8fb] text-[#71717b]'
            }`}
          >
            {selected.includes(option) ? 'Selected: ' : ''}{option}
          </button>
        ))}
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

function QuizTab({ tab }: { tab: TabContent }) {
  const questions = Array.isArray(tab.config_json?.questions) ? tab.config_json.questions : []
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [result, setResult] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

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
      const { data } = await api.post(`/courses/tabs/${tab.id}/quiz/submit`, { answers })
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
        <div key={question.id} className="rounded-2xl border border-[#e4e4e7] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="m-0 text-sm font-black text-[#3f3f46]">{index + 1}. {question.prompt}</p>
            <span className="rounded-full bg-[#f7f8fb] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">
              {String(question.type || 'multiple_choice').replace(/_/g, ' ')}
            </span>
          </div>
          <QuizQuestion
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
          />
        </div>
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
    let cancelled = false
    setLoading(true)
    api.get<TopicComment[]>('/interactions/comments', { params: { topic_item_id: item.id } })
      .then(({ data }) => {
        if (!cancelled) setComments(data)
      })
      .catch(() => {
        if (!cancelled) {
          setComments([])
          toast.error('Could not load comments.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item.id])

  async function postComment() {
    if (!body.trim()) return
    setPosting(true)
    try {
      const { data } = await api.post<TopicComment>('/interactions/comments', {
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

function TabPanel({
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
      await api.post('/interactions/notes', {
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

function TopicWorkspaceToolbar({
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

function TopicSearchResults({
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

export default function TopicWorkspacePage() {
  const { topicId } = useParams<{ topicId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const workspaceSearchKey = searchParams.toString()
  const routeQueryTargets = useMemo(() => (
    parseTopicWorkspaceQuery(new URLSearchParams(workspaceSearchKey))
  ), [workspaceSearchKey])
  const [workspace, setWorkspace] = useState<TopicWorkspace | null>(null)
  const [activeItemId, setActiveItemId] = useState<number | null>(null)
  const [activeTabSlot, setActiveTabSlot] = useState<WorkspaceTabSlot>('course')
  const [topicQuery, setTopicQuery] = useState('')
  const [openSectionIds, setOpenSectionIds] = useState<Set<string | number>>(new Set())
  const [workspaceRequest, setWorkspaceRequest] = useState<TopicWorkspaceDataRequest>(() => ({
    ...defaultTopicWorkspaceDataRequest(),
    targets: routeQueryTargets,
  }))
  const lastWorkspaceErrorToastRef = useRef('')
  const previousTopicIdRef = useRef(topicId)
  const {
    key: workspaceKey,
    workspace: fetchedWorkspace,
    error: workspaceError,
    loading,
    isValidating,
    mutate: mutateWorkspace,
  } = useTopicWorkspaceData(topicId, workspaceRequest)
  const loadError = workspaceError ? apiDataErrorMessage(workspaceError, 'Could not load topic workspace.') : ''

  useEffect(() => {
    const topicChanged = previousTopicIdRef.current !== topicId
    previousTopicIdRef.current = topicId
    setWorkspaceRequest({
      ...defaultTopicWorkspaceDataRequest(),
      targets: routeQueryTargets,
    })
    if (!topicChanged) return
    setWorkspace(null)
    setActiveItemId(null)
    setActiveTabSlot('course')
    setOpenSectionIds(new Set())
  }, [routeQueryTargets, topicId])

  useEffect(() => {
    if (!fetchedWorkspace) return
    const numericTopicId = Number(topicId)
    if (Number.isFinite(numericTopicId) && fetchedWorkspace.id !== numericTopicId) return

    const selection = selectTopicWorkspaceQueryState(fetchedWorkspace, workspaceRequest.targets)
    const nextActiveItemId = selection.activeItemId
      ?? fetchedWorkspace.active_item_id
      ?? workspaceRequest.targets.itemId
      ?? fetchedWorkspace.active_item?.id
      ?? null
    const nextOpenSectionId = activeSectionIdForWorkspace(fetchedWorkspace, nextActiveItemId)

    setWorkspace(fetchedWorkspace)
    setActiveItemId(nextActiveItemId)
    if (!workspaceRequest.preserveActiveTab) setActiveTabSlot(selection.activeTabSlot)
    setOpenSectionIds((prev) => {
      if (nextOpenSectionId == null) return workspaceRequest.preserveOpenSections ? prev : new Set()
      if (!workspaceRequest.preserveOpenSections) return new Set([nextOpenSectionId])
      const next = new Set(prev)
      next.add(nextOpenSectionId)
      return next
    })
  }, [fetchedWorkspace, topicId, workspaceRequest])

  useEffect(() => {
    if (!workspaceError) {
      lastWorkspaceErrorToastRef.current = ''
      return
    }
    if (loadError === lastWorkspaceErrorToastRef.current) return
    lastWorkspaceErrorToastRef.current = loadError
    toast.error(loadError)
  }, [loadError, workspaceError])

  const requestWorkspace = useCallback((
    targets = topicWorkspaceQueryTargetsFromItemId(null),
    q = '',
    options: Pick<TopicWorkspaceDataRequest, 'preserveActiveTab' | 'preserveOpenSections'> = {},
  ) => {
    setWorkspaceRequest({
      targets,
      q,
      ...options,
    })
    if (topicWorkspaceSWRKey(topicId, targets, q) === workspaceKey) {
      void mutateWorkspace()
    }
  }, [mutateWorkspace, topicId, workspaceKey])

  const retryWorkspace = useCallback(async () => {
    try {
      await mutateWorkspace()
    } catch {
      // SWR exposes the latest error through state; the effect above owns reporting.
    }
  }, [mutateWorkspace])

  const topicLookups = useMemo(() => {
    if (!workspace) return null
    return buildTopicLookups(workspace.sections)
  }, [workspace])

  const activeItem = useMemo(() => {
    if (!workspace) return null
    return topicLookups?.itemById.get(activeItemId ?? -1) || workspace.active_item
  }, [activeItemId, topicLookups, workspace])

  const activePrimaryTab = useMemo(() => (
    activeItem ? resolvePrimaryTab(activeItem) : null
  ), [activeItem])
  const availableTabSlots = useMemo(() => (
    activeItem ? secondaryTabSlotSpecsForItem(activeItem, activePrimaryTab) : []
  ), [activeItem, activePrimaryTab])
  const activeTab = useMemo(() => (
    activeItem && availableTabSlots.some((slot) => slot.id === activeTabSlot)
      ? resolveTabForSlot(activeItem.tabs, activeTabSlot, activeItem)
      : null
  ), [activeItem, activeTabSlot, availableTabSlots])
  const railSections = useMemo(() => {
    if (!workspace) return []
    return buildRailSections(workspace, activeItemId, openSectionIds)
  }, [workspace, activeItemId, openSectionIds])
  const workspaceTabs = useMemo<FigmaTabItem[]>(() => {
    return availableTabSlots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      icon: workspaceTabIcons[slot.id],
      active: slot.id === activeTabSlot,
    }))
  }, [activeTabSlot, availableTabSlots])
  useEffect(() => {
    if (!activeItem) return
    if (availableTabSlots.some((slot) => slot.id === activeTabSlot)) return
    setActiveTabSlot(defaultSecondaryTabSlotForItem(activeItem, activePrimaryTab))
  }, [activeItem, activePrimaryTab, activeTabSlot, availableTabSlots])
  const isActiveItemLocked = activeItem?.can_access === false
  const activePrimaryVideoId = useMemo(() => {
    if (!activeItem || isActiveItemLocked) return null
    return youtubeVideoIdForTab(activePrimaryTab, activeItem) ?? (!activePrimaryTab ? youtubeVideoId(activeItem) : null)
  }, [activeItem, activePrimaryTab, isActiveItemLocked])
  const activeDurationLabel = activeItem ? formatTopicItemDuration(activeItem.duration_seconds) : ''

  const selectItem = useCallback(async (item: TopicItem) => {
    setActiveItemId(item.id)
    setActiveTabSlot(defaultSecondaryTabSlotForItem(item, resolvePrimaryTab(item)))
    setOpenSectionIds((prev) => new Set(prev).add(item.section_id))

    if (item.can_access === false) {
      toast.info(lockedContentReason(item.locked_reason))
      return
    }

    router.replace(`/topics/${topicId}?item=${item.id}`, { scroll: false })

    try {
      await api.post(`/courses/topic-items/${item.id}/event`, {
        event_type: `${item.item_type}_opened`,
        target_type: 'topic_item',
        target_id: item.id,
        topic_id: workspace?.id,
        topic_item_id: item.id,
      })
    } catch {}
  }, [router, topicId, workspace?.id])

  const runTopicSearch = useCallback(() => {
    if (!activeItem) return
    requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
      preserveActiveTab: true,
      preserveOpenSections: true,
    })
  }, [activeItem, requestWorkspace, topicQuery])

  const toggleSection = useCallback((section: FigmaRailSection) => {
    setOpenSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(section.id)) next.delete(section.id)
      else next.add(section.id)
      return next
    })
  }, [])

  const selectRailItem = useCallback((railItem: FigmaRailItem) => {
    const item = topicLookups?.itemById.get(Number(railItem.id))
    if (item) selectItem(item)
  }, [selectItem, topicLookups])

  const selectWorkspaceTab = useCallback((tab: FigmaTabItem) => {
    const slotId = tab.id as WorkspaceTabSlot
    if (availableTabSlots.some((slot) => slot.id === slotId)) {
      setActiveTabSlot(slotId)
    }
  }, [availableTabSlots])

  const completeActive = useCallback(async () => {
    if (!activeItem) return
    if (activeItem.can_access === false) {
      toast.info(lockedContentReason(activeItem.locked_reason))
      return
    }
    try {
      const { data } = await api.post(`/courses/topic-items/${activeItem.id}/complete`, { watched_seconds: activeItem.duration_seconds || 0 })
      toast.success(`Progress saved${data.xp_earned ? ` (+${data.xp_earned} XP)` : ''}.`)
      requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
        preserveActiveTab: true,
        preserveOpenSections: true,
      })
    } catch {
      toast.error('Could not save progress.')
    }
  }, [activeItem, requestWorkspace, topicQuery])

  const saveActive = useCallback(async () => {
    if (!activeItem || !workspace) return
    if (activeItem.can_access === false) {
      toast.info(lockedContentReason(activeItem.locked_reason))
      return
    }
    try {
      await api.post('/interactions/saves', { target_type: 'topic_item', target_id: activeItem.id, topic_id: workspace.id, topic_item_id: activeItem.id, label: activeItem.title })
      toast.success('Saved.')
    } catch {
      toast.error('Could not save item.')
    }
  }, [activeItem, workspace])

  const primaryContent = useMemo(() => {
    if (!activeItem) return null
    if (isActiveItemLocked) {
      return <VideoPlayerFrame videoId="" srcDoc={lockedVideoSrcDoc(activeItem)} />
    }
    if (activePrimaryVideoId) {
      return <VideoPlayerFrame videoId={activePrimaryVideoId} srcDoc={youtubeSrcDoc(activeItem, activePrimaryVideoId)} />
    }
    if (activePrimaryTab) {
      return (
        <PrimaryContentFrame>
          <TabPanel
            tab={activePrimaryTab}
            item={activeItem}
            topicId={workspace?.id ?? Number(topicId)}
            onNoteSaved={() => requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
              preserveActiveTab: true,
              preserveOpenSections: true,
            })}
            onItemComplete={completeActive}
          />
        </PrimaryContentFrame>
      )
    }
    return <VideoPlayerFrame videoId="" srcDoc={missingVideoSrcDoc(activeItem)} />
  }, [activeItem, activePrimaryTab, activePrimaryVideoId, completeActive, isActiveItemLocked, requestWorkspace, topicId, topicQuery, workspace?.id])

  if (loading && !workspace) {
    return <FigmaVideoWorkspaceSkeleton />
  }

  if (!workspace || !activeItem) {
    return (
      <main className="grid min-h-[520px] place-items-center py-12">
        <RouteErrorState
          eyebrow="Topic unavailable"
          title="This topic workspace could not be loaded."
          message={loadError || 'The topic data was empty or incomplete. Retry the request or go back home.'}
          homeHref="/home"
          homeLabel="Back home"
          onRetry={() => void retryWorkspace()}
        />
      </main>
    )
  }

  return (
    <VideoLearningWorkspace
      breadcrumb={`2eme Bac / ${workspace.subject_title} / ${workspace.title}`}
      title={`${workspace.subject_title}: ${activeItem.title}`}
      primaryContent={primaryContent}
      toolbar={(
        <TopicWorkspaceToolbar
          query={topicQuery}
          resultCount={workspace.search_results.length}
          onQueryChange={setTopicQuery}
          onSearch={runTopicSearch}
        />
      )}
      tabs={workspaceTabs}
      onTabSelect={selectWorkspaceTab}
      rail={{
        completed: workspace.completed_count,
        total: workspace.item_count,
        value: workspace.progress_pct,
        sections: railSections,
        onSectionToggle: toggleSection,
        onItemSelect: selectRailItem,
      }}
    >
      <LessonBody>
        <div className="grid gap-[24px]">
          {loadError && (
            <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-[#fde68a] bg-[#fffbeb] px-5 py-4">
              <div>
                <p className="m-0 text-[14px] font-black text-[#92400e]">Topic workspace could not be refreshed.</p>
                <p className="m-0 mt-1 text-[13px] font-bold text-[#b45309]">Cached topic data stays visible while you retry.</p>
              </div>
              <button
                type="button"
                onClick={() => void retryWorkspace()}
                disabled={isValidating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#92400e] px-4 text-[13px] font-black text-white disabled:opacity-60"
              >
                <RotateCcw size={15} />
                {isValidating ? 'Retrying...' : 'Retry topic data'}
              </button>
            </section>
          )}
          <TopicSearchResults query={topicQuery} items={workspace.search_results} onSelect={selectItem} />
          <AnimatePresence mode="wait" initial={false}>
            {activeTab && (
              <motion.div
                key={activeTabSlot}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <TabPanel
                  tab={activeTab}
                  item={activeItem}
                  topicId={workspace.id}
                  onNoteSaved={() => requestWorkspace(topicWorkspaceQueryTargetsFromItemId(activeItem.id), topicQuery, {
                    preserveActiveTab: true,
                    preserveOpenSections: true,
                  })}
                  onItemComplete={completeActive}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#f4f4f5] pt-4">
            {activeItem.can_access !== false && (
              <>
                <button
                  type="button"
                  onClick={completeActive}
                  className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#3a2fd3] px-4 text-[13px] font-black text-white transition hover:bg-[#2f27b8]"
                >
                  <Check size={15} />
                  Mark complete
                </button>
                <button
                  type="button"
                  onClick={saveActive}
                  className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#52525c] transition hover:border-[#cfd2dc] hover:bg-[#f8f9fc] hover:text-[#3f3f46]"
                >
                  <Bookmark size={14} />
                  Save
                </button>
              </>
            )}
            {activeDurationLabel && (
              <span className="ml-1 text-[12px] font-bold text-[#9f9fa9]">{activeDurationLabel}</span>
            )}
          </div>
        </div>
      </LessonBody>
    </VideoLearningWorkspace>
  )
}
