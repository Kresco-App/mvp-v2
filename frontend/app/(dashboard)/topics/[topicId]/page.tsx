'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Beaker,
  Bookmark,
  BookOpen,
  Check,
  FileText,
  ListChecks,
  Search,
  StickyNote,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import api from '@/lib/axios'
import { AnimatedContentRenderer, type AnimatedCompletionEvent, type AnimatedLessonConfig, type AnimatedRendererProps } from '@/components/animated'
import { LessonBody, VideoLearningWorkspace, type FigmaRailItem, type FigmaRailSection, type FigmaTabItem } from '@/components/figma'
import { FigmaVideoWorkspaceSkeleton } from '@/components/figma/skeletons'

interface Resource {
  id: number
  title: string
  resource_type: string
  provider: string
  provider_resource_id: string
  url: string
  summary: string
}

interface TabContent {
  id: number
  label: string
  tab_type: string
  content: string
  config_json: any
  renderer_key: string
  order: number
  resource?: Resource | null
}

interface TopicItem {
  id: number
  topic_id: number
  section_id: number
  title: string
  description: string
  item_type: string
  renderer_key: string
  duration_seconds: number
  progress_status: string
  primary_resource?: Resource | null
  tabs: TabContent[]
}

interface TopicSection {
  id: number
  title: string
  section_type: string
  order: number
  items: TopicItem[]
}

interface TopicWorkspace {
  id: number
  subject_title: string
  title: string
  description: string
  progress_pct: number
  completed_count: number
  item_count: number
  active_item_id: number | null
  sections: TopicSection[]
  active_item: TopicItem | null
  study_tools: {
    quizzes: TabContent[]
    interactive: TabContent[]
    resources: Resource[]
    notes: { id: number; topic_item_id: number; body: string; updated_at: string }[]
  }
  search_results: TopicItem[]
}

type WorkspaceMode = 'path' | 'tools'

type WorkspaceTabSlot = 'course' | 'lab' | 'quiz' | 'resources' | 'notes'

const workspaceTabSlots: { id: WorkspaceTabSlot; label: string; icon: LucideIcon; tabTypes: string[] }[] = [
  { id: 'course', label: 'Course', icon: BookOpen, tabTypes: ['course', 'summary', 'transcript', 'formula', 'definitions', 'vocabulary', 'methods', 'mistakes', 'text'] },
  { id: 'lab', label: 'Lab', icon: Beaker, tabTypes: ['lab', 'interactive', 'simulator'] },
  { id: 'quiz', label: 'Quiz', icon: ListChecks, tabTypes: ['quiz', 'checkpoint_quiz', 'questions'] },
  { id: 'resources', label: 'Resources', icon: FileText, tabTypes: ['resources', 'resource', 'pdf', 'attachment', 'worksheet'] },
  { id: 'notes', label: 'Notes', icon: StickyNote, tabTypes: ['notes'] },
]

const animatedTabTypes = new Set([
  'activity',
  'animated',
  'animated_course',
  'course_animation',
  'interactive',
  'interactive_course',
  'lab',
  'simulator',
])

const animatedItemTypes = new Set([
  'activity',
  'animated_course',
  'checkpoint_activity',
  'interactive',
  'interactive_course',
  'lab',
  'simulator',
])

const nonAnimatedRendererKeys = new Set(['pdf', 'resource', 'vdocipher', 'video', 'youtube_embed'])


function duration(seconds: number) {
  if (!seconds) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function youtubeVideoId(item: TopicItem) {
  const raw = item.primary_resource?.provider_resource_id || item.primary_resource?.url || ''
  const match = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/) || raw.match(/^[A-Za-z0-9_-]{6,}$/)
  return match?.[1] || match?.[0] || 'dQw4w9WgXcQ'
}

function youtubeSrcDoc(item: TopicItem, videoId: string) {
  const title = item.title.replace(/"/g, '&quot;')
  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; overflow: hidden; background: #f4f4f5; font-family: system-ui, sans-serif; }
      a { position: absolute; inset: 0; display: grid; place-items: center; color: white; text-decoration: none; }
        img { width: 100%; height: 100%; object-fit: cover; filter: saturate(.88) brightness(1.05); }
      span { position: absolute; width: 66px; height: 49px; border-radius: 14px; background: rgba(0,0,0,.36); display: grid; place-items: center; }
      span:before { content: ""; margin-left: 4px; border-left: 17px solid white; border-top: 11px solid transparent; border-bottom: 11px solid transparent; }
      </style>
      <a href="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1" aria-label="Play ${title}">
        <img src="/figma-assets/course-video-frame.png" alt="${title}" />
        <span></span>
      </a>
    `
}

function sectionCopy(section: TopicSection) {
  const key = `${section.title} ${section.section_type}`.toLowerCase()
  if (key.includes('lesson')) return 'Learn the basics of the subject.'
  if (key.includes('exercise')) return 'Learn by doing with interactive tasks.'
  if (key.includes('homework')) return 'Learn by practicing with real-world problems.'
  if (key.includes('bac') || key.includes('exam')) return 'Get yourself familiarized with the final boss'
  return section.items[0]?.description || 'Keep the flow of knowledge ongoing!'
}

function railLabel(section: TopicSection, item: TopicItem, index: number) {
  const base = section.title.replace(/s$/i, '')
  return item.title?.trim() || `${base} ${index + 1}`
}

function buildRailSections(workspace: TopicWorkspace, activeItemId: number | null, openIds: Set<string | number>): FigmaRailSection[] {
  return workspace.sections.map((section) => ({
    id: section.id,
    title: section.title,
    copy: sectionCopy(section),
    open: openIds.has(section.id),
    items: section.items.map((item, index) => ({
      id: item.id,
      label: railLabel(section, item, index),
      active: item.id === activeItemId,
      completed: item.progress_status === 'completed',
    })),
  }))
}

function tabMatchesSlot(tab: TabContent, slot: WorkspaceTabSlot) {
  const spec = workspaceTabSlots.find((item) => item.id === slot)
  if (!spec) return false
  const type = tab.tab_type.toLowerCase()
  const label = tab.label.toLowerCase()
  return spec.tabTypes.some((candidate) => type === candidate || label.includes(candidate))
}

function fallbackTabForSlot(slot: WorkspaceTabSlot, item: TopicItem): TabContent {
  const base = workspaceTabSlots.find((entry) => entry.id === slot)!
  const fallback: TabContent = {
    id: 0,
    label: base.label,
    tab_type: slot,
    content: '',
    config_json: {},
    renderer_key: '',
    order: 999,
    resource: null,
  }

  if (slot === 'course') {
    return {
      ...fallback,
      content: item.description || 'The result is quite intuitive: if a continuous function takes two distinct values on an interval, it necessarily takes all the values between those two.',
    }
  }

  if (slot === 'lab') {
    return {
      ...fallback,
      tab_type: 'lab',
      renderer_key: item.renderer_key || 'interactive_component',
      content: 'Local registry placeholder. This keeps the Lab tab available while the simulator mapping is hardened.',
    }
  }

  if (slot === 'resources') {
    return {
      ...fallback,
      tab_type: 'resources',
      content: item.primary_resource?.summary || 'No resources attached to this item yet.',
      resource: item.primary_resource ?? null,
    }
  }

  return fallback
}

function resolveTabForSlot(tabs: TabContent[], slot: WorkspaceTabSlot, item: TopicItem) {
  return tabs.find((tab) => tabMatchesSlot(tab, slot)) || fallbackTabForSlot(slot, item)
}

function tabConfig(tab: TabContent): Record<string, any> {
  return tab.config_json && typeof tab.config_json === 'object' && !Array.isArray(tab.config_json)
    ? tab.config_json
    : {}
}

function normalizeRendererKey(value?: string | null) {
  const key = value?.trim()
  if (!key) return ''
  return key
}

function isAnimatedTab(tab: TabContent, item: TopicItem) {
  const config = tabConfig(tab)
  const type = tab.tab_type.toLowerCase()
  const itemType = item.item_type.toLowerCase()
  const rendererKey = normalizeRendererKey(tab.renderer_key)
  const configRendererKey = normalizeRendererKey(config.renderer_key || config.rendererKey)
  const itemRendererKey = normalizeRendererKey(item.renderer_key)

  if (rendererKey && !nonAnimatedRendererKeys.has(rendererKey.toLowerCase())) return true
  if (configRendererKey && !nonAnimatedRendererKeys.has(configRendererKey.toLowerCase())) return true
  if (animatedTabTypes.has(type)) return true
  return Boolean(itemRendererKey && animatedItemTypes.has(itemType) && !nonAnimatedRendererKeys.has(itemRendererKey.toLowerCase()))
}

function resolveAnimatedRendererKey(tab: TabContent, item: TopicItem) {
  const config = tabConfig(tab)
  const explicitKey = [
    tab.renderer_key,
    config.renderer_key,
    config.rendererKey,
  ].find((value) => typeof value === 'string' && value.trim())

  if (explicitKey) return normalizeRendererKey(explicitKey)

  const type = tab.tab_type.toLowerCase()
  const itemType = item.item_type.toLowerCase()
  if ((animatedTabTypes.has(type) || animatedItemTypes.has(itemType)) && item.renderer_key) {
    return normalizeRendererKey(item.renderer_key)
  }

  if (animatedTabTypes.has(type) || animatedItemTypes.has(itemType)) return 'interactive_component'

  return ''
}

function animatedConfigForTab(tab: TabContent, item: TopicItem, topicId: number): AnimatedLessonConfig {
  const config = tabConfig(tab) as AnimatedLessonConfig
  return {
    ...config,
    renderer_key: resolveAnimatedRendererKey(tab, item) || config.renderer_key,
    title: config.title ?? tab.label ?? item.title,
    description: config.description ?? tab.content ?? item.description,
    metadata: {
      ...(config.metadata ?? {}),
      topic_id: topicId,
      topic_item_id: item.id,
      ...(tab.id ? { tab_content_id: tab.id } : {}),
      tab_type: tab.tab_type,
      tab_content: tab.content,
    },
  }
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

function normalizeOptionKey(value: unknown) {
  return String(value ?? '')
}

function splitOrderingInput(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function toggleMultiAnswer(current: unknown, option: string) {
  const values = Array.isArray(current) ? current.map(String) : []
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option]
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
      className="figma-input w-full"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      inputMode={type === 'numeric_answer' ? 'decimal' : 'text'}
    />
  )
}

function QuizTab({ tab }: { tab: TabContent }) {
  const questions = tab.config_json?.questions || []
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [result, setResult] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

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

  if (tab.tab_type === 'quiz') return <QuizTab tab={tab} />

  if (tab.tab_type === 'notes') {
    return (
      <div className="space-y-3">
        <textarea value={note} onChange={(event) => setNote(event.target.value)} className="figma-input min-h-36 w-full py-3" placeholder="Write notes for this item" />
        <button type="button" onClick={saveNote} className="figma-button">Save note</button>
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

  return (
    <div>
      <p className="m-0 whitespace-pre-line text-sm font-semibold leading-7 text-[#52525c]">{tab.content || tab.resource?.summary || 'No content yet.'}</p>
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
  mode,
  resultCount,
  onQueryChange,
  onSearch,
  onModeChange,
}: {
  query: string
  mode: WorkspaceMode
  resultCount: number
  onQueryChange: (value: string) => void
  onSearch: () => void
  onModeChange: (mode: WorkspaceMode) => void
}) {
  return (
    <div className="kresco-enter flex max-w-[1057px] flex-wrap items-center justify-between gap-3 pt-2" style={{ animationDelay: '40ms' }}>
      <form
        className="relative min-w-[280px] flex-1"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch()
        }}
      >
        <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9f9fa9]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="figma-input w-full pl-11"
          placeholder="Search this topic"
          aria-label="Search this topic"
        />
      </form>

      <div className="inline-flex h-[44px] rounded-[14px] bg-[#f7f8fb] p-1">
        <button
          type="button"
          onClick={() => onModeChange('path')}
          className={`inline-flex items-center gap-2 rounded-[11px] px-4 text-[13px] font-black transition ${
            mode === 'path' ? 'bg-white text-[#3f3f46] shadow-[0_4px_12px_rgba(24,24,27,0.08)]' : 'text-[#71717b]'
          }`}
        >
          <ListChecks size={15} />
          Main Path
        </button>
        <button
          type="button"
          onClick={() => onModeChange('tools')}
          className={`inline-flex items-center gap-2 rounded-[11px] px-4 text-[13px] font-black transition ${
            mode === 'tools' ? 'bg-white text-[#3f3f46] shadow-[0_4px_12px_rgba(24,24,27,0.08)]' : 'text-[#71717b]'
          }`}
        >
          <Wrench size={15} />
          Study Tools
        </button>
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

function StudyToolsPanel({
  workspace,
  onTabSelect,
}: {
  workspace: TopicWorkspace
  onTabSelect: (itemId: number, slot: WorkspaceTabSlot) => void
}) {
  const notes = workspace.study_tools.notes
  const itemByTabId = new Map<number, TopicItem>()
  workspace.sections.forEach((section) => {
    section.items.forEach((item) => {
      item.tabs.forEach((tab) => itemByTabId.set(tab.id, item))
    })
  })
  const tools = [
    { label: 'Quizzes', count: workspace.study_tools.quizzes.length },
    { label: 'Interactive', count: workspace.study_tools.interactive.length },
    { label: 'Resources', count: workspace.study_tools.resources.length },
    { label: 'Notes', count: notes.length },
  ]

  return (
    <section className="grid gap-4 rounded-[16px] border border-[#e4e4e7] bg-white p-4">
      <div className="grid grid-cols-4 gap-2 max-[800px]:grid-cols-2">
        {tools.map((tool) => (
          <div key={tool.label} className="rounded-[14px] bg-[#f7f8fb] px-4 py-3">
            <strong className="block text-[20px] font-black leading-none text-[#3f3f46]">{tool.count}</strong>
            <span className="text-[12px] font-black text-[#71717b]">{tool.label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        {workspace.study_tools.quizzes.slice(0, 4).map((tab) => (
          <button
            key={`quiz-${tab.id}`}
            type="button"
            onClick={() => {
              const item = itemByTabId.get(tab.id)
              if (item) onTabSelect(item.id, 'quiz')
            }}
            className="rounded-[12px] border border-[#e4e4e7] px-4 py-3 text-left text-[13px] font-black text-[#3f3f46]"
          >
            Quiz: {tab.label}
          </button>
        ))}
        {workspace.study_tools.resources.slice(0, 4).map((resource) => (
          <div key={`resource-${resource.id}`} className="rounded-[12px] border border-[#e4e4e7] px-4 py-3">
            <strong className="block text-[13px] font-black text-[#3f3f46]">{resource.title}</strong>
            <span className="text-[12px] font-bold text-[#71717b]">{resource.resource_type}</span>
          </div>
        ))}
        {notes.slice(0, 3).map((note) => (
          <button key={`note-${note.id}`} type="button" onClick={() => onTabSelect(note.topic_item_id, 'notes')} className="rounded-[12px] bg-[#fff7df] px-4 py-3 text-left text-[13px] font-bold text-[#705000]">
            {note.body}
          </button>
        ))}
      </div>
    </section>
  )
}

export default function TopicWorkspacePage() {
  const { topicId } = useParams<{ topicId: string }>()
  const searchParams = useSearchParams()
  const [workspace, setWorkspace] = useState<TopicWorkspace | null>(null)
  const [activeItemId, setActiveItemId] = useState<number | null>(null)
  const [activeTabSlot, setActiveTabSlot] = useState<WorkspaceTabSlot>('course')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('path')
  const [topicQuery, setTopicQuery] = useState('')
  const [openSectionIds, setOpenSectionIds] = useState<Set<string | number>>(new Set())
  const [loading, setLoading] = useState(true)

  async function load(itemId?: number | null, q = '') {
    const params = new URLSearchParams()
    if (itemId) params.set('item_id', String(itemId))
    if (q.trim()) params.set('q', q.trim())
    const { data } = await api.get(`/courses/topics/${topicId}/workspace?${params.toString()}`)
    setWorkspace(data)
    setActiveItemId(data.active_item_id)
    setActiveTabSlot('course')
    setOpenSectionIds((prev) => {
      if (prev.size > 0) return prev
      return new Set()
    })
  }

  useEffect(() => {
    const item = searchParams.get('item')
    load(item ? Number(item) : null)
      .catch(() => toast.error('Could not load topic workspace.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId])

  const activeItem = useMemo(() => {
    if (!workspace) return null
    return workspace.sections.flatMap((section) => section.items).find((item) => item.id === activeItemId) || workspace.active_item
  }, [workspace, activeItemId])

  const activeTab = activeItem ? resolveTabForSlot(activeItem.tabs, activeTabSlot, activeItem) : null
  const railSections = useMemo(() => {
    if (!workspace) return []
    return buildRailSections(workspace, activeItemId, openSectionIds)
  }, [workspace, activeItemId, openSectionIds])
  const workspaceTabs = useMemo<FigmaTabItem[]>(() => {
    return workspaceTabSlots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      icon: slot.icon,
      active: slot.id === activeTabSlot,
    }))
  }, [activeTabSlot])
  const activeVideoId = activeItem ? youtubeVideoId(activeItem) : 'dQw4w9WgXcQ'

  async function selectItem(item: TopicItem) {
    setActiveItemId(item.id)
    setActiveTabSlot('course')
    setOpenSectionIds((prev) => new Set(prev).add(item.section_id))
    try {
      await api.post(`/courses/topic-items/${item.id}/event`, {
        event_type: `${item.item_type}_opened`,
        target_type: 'topic_item',
        target_id: item.id,
        topic_id: workspace?.id,
        topic_item_id: item.id,
      })
    } catch {}
  }

  async function runTopicSearch() {
    if (!activeItem) return
    try {
      await load(activeItem.id, topicQuery)
    } catch {
      toast.error('Topic search failed.')
    }
  }

  function selectToolTarget(itemId: number, slot: WorkspaceTabSlot) {
    if (!workspace) return
    const item = workspace.sections.flatMap((section) => section.items).find((candidate) => candidate.id === itemId)
    if (!item) return
    setActiveItemId(item.id)
    setActiveTabSlot(slot)
    setOpenSectionIds((prev) => new Set(prev).add(item.section_id))
  }

  function toggleSection(section: FigmaRailSection) {
    setOpenSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(section.id)) next.delete(section.id)
      else next.add(section.id)
      return next
    })
  }

  function selectRailItem(railItem: FigmaRailItem) {
    if (!workspace) return
    const item = workspace.sections.flatMap((section) => section.items).find((candidate) => candidate.id === railItem.id)
    if (item) selectItem(item)
  }

  function selectWorkspaceTab(tab: FigmaTabItem) {
    if (tab.id === 'course' || tab.id === 'lab' || tab.id === 'quiz' || tab.id === 'resources' || tab.id === 'notes') {
      setActiveTabSlot(tab.id)
    }
  }

  async function completeActive() {
    if (!activeItem) return
    try {
      const { data } = await api.post(`/courses/topic-items/${activeItem.id}/complete`, { watched_seconds: activeItem.duration_seconds || 0 })
      toast.success(`Progress saved${data.xp_earned ? ` (+${data.xp_earned} XP)` : ''}.`)
      await load(activeItem.id)
    } catch {
      toast.error('Could not save progress.')
    }
  }

  async function saveActive() {
    if (!activeItem || !workspace) return
    try {
      await api.post('/interactions/saves', { target_type: 'topic_item', target_id: activeItem.id, topic_id: workspace.id, topic_item_id: activeItem.id, label: activeItem.title })
      toast.success('Saved.')
    } catch {
      toast.error('Could not save item.')
    }
  }

  if (loading) {
    return <FigmaVideoWorkspaceSkeleton />
  }

  if (!workspace || !activeItem) return null

  return (
    <VideoLearningWorkspace
      breadcrumb={`2eme Bac / ${workspace.subject_title} / ${workspace.title}`}
      title={`${workspace.subject_title}: ${activeItem.title}`}
      videoId={activeVideoId}
      srcDoc={youtubeSrcDoc(activeItem, activeVideoId)}
      toolbar={(
        <TopicWorkspaceToolbar
          query={topicQuery}
          mode={workspaceMode}
          resultCount={workspace.search_results.length}
          onQueryChange={setTopicQuery}
          onSearch={runTopicSearch}
          onModeChange={setWorkspaceMode}
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
          <TopicSearchResults query={topicQuery} items={workspace.search_results} onSelect={selectItem} />
          {workspaceMode === 'tools' && <StudyToolsPanel workspace={workspace} onTabSelect={selectToolTarget} />}
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
                  onNoteSaved={() => load(activeItem.id)}
                  onItemComplete={completeActive}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex flex-wrap items-center gap-[12px]">
            <button type="button" onClick={completeActive} className="figma-button shadow-none">
              <Check size={16} />
              Mark complete
            </button>
            <button type="button" onClick={saveActive} className="figma-button secondary">
              <Bookmark size={15} />
              Save
            </button>
            {duration(activeItem.duration_seconds) && (
              <span className="text-[13px] font-bold text-[#71717b]">{duration(activeItem.duration_seconds)}</span>
            )}
          </div>
        </div>
      </LessonBody>
    </VideoLearningWorkspace>
  )
}
