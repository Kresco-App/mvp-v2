'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  MessageSquareText,
  Star,
  ThumbsDown,
  ThumbsUp,
  Video,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
} from '@/components/admin/AdminDesign'
import { getJson } from '@/lib/apiClient'
import { formatNumber } from '@/lib/adminOverview'
import {
  EMPTY_ADMIN_VIDEO_FEEDBACK,
  sortAdminVideoFeedbackItems,
  type AdminVideoFeedback,
  type AdminVideoFeedbackComment,
  type AdminVideoFeedbackItem,
  type AdminVideoFeedbackSort,
} from '@/lib/adminVideoFeedback'

const card = adminPanelClass

const sortLabels: Record<AdminVideoFeedbackSort, string> = {
  needs_attention: 'Needs attention',
  lowest_rating: 'Lowest rating',
  most_negative: 'Most negative',
  most_reviewed: 'Most reviewed',
  best_rating: 'Best rating',
}

export default function AdminVideoFeedbackPage() {
  const [data, setData] = useState<AdminVideoFeedback>(EMPTY_ADMIN_VIDEO_FEEDBACK)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<AdminVideoFeedbackSort>('needs_attention')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    getJson<AdminVideoFeedback>('/admin/video-feedback?limit=120')
      .then((response) => {
        if (!alive) return
        setData(response ?? EMPTY_ADMIN_VIDEO_FEEDBACK)
      })
      .catch(() => {
        if (!alive) return
        setData(EMPTY_ADMIN_VIDEO_FEEDBACK)
        setError('Could not load video feedback.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [nonce])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? data.items.filter((item) => [
        item.title,
        item.topic_title,
        item.subject_title,
        item.item_type,
      ].join(' ').toLowerCase().includes(needle))
      : data.items
    return sortAdminVideoFeedbackItems(filtered, sort)
  }, [data.items, query, sort])

  useEffect(() => {
    if (!visibleItems.length) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (selectedId !== null && visibleItems.some((item) => item.topic_item_id === selectedId)) return
    setSelectedId(visibleItems[0].topic_item_id)
  }, [selectedId, visibleItems])

  const selectedItem = visibleItems.find((item) => item.topic_item_id === selectedId) ?? visibleItems[0] ?? null
  const summary = data.summary

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Star}
        title="Video feedback"
        syncLabel={data.generated_at ? `Last sync: ${new Date(data.generated_at).toLocaleString('fr-FR')}` : undefined}
        action={<AdminRefreshButton loading={loading} onClick={() => setNonce((value) => value + 1)} />}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripClass}>
        <FeedbackMetric icon={Video} label="Reviewed videos" value={summary.videos_reviewed} hint={`${formatNumber(summary.watchlist_videos)} watchlist`} loading={loading} />
        <FeedbackMetric icon={Star} label="Average rating" value={`${ratingValue(summary.average_rating)}/5`} hint={`${formatNumber(summary.rated_comments)} ratings`} loading={loading} />
        <FeedbackMetric icon={ThumbsDown} label="Negative" value={summary.negative_comments} hint="1-2 star comments" loading={loading} tone="warn" />
        <FeedbackMetric icon={ThumbsUp} label="Positive" value={summary.positive_comments} hint="4-5 star comments" loading={loading} tone="good" />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-[color:var(--border)] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="m-0 text-[16px] font-black text-[color:var(--text-primary)]">Average ratings per video</h2>
              <p className="m-0 mt-1 text-[12px] font-bold text-[color:var(--text-tertiary)] tabular-nums">
                {formatNumber(visibleItems.length)} shown
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <AdminSearchBox
                value={query}
                onChange={setQuery}
                label="Search video feedback"
                placeholder="Video, subject, topic"
                className="w-full sm:w-[280px]"
              />
              <label
                data-video-feedback-sort-control
                className="group relative inline-flex h-10 min-w-[220px] cursor-pointer select-none items-center gap-2 overflow-hidden rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-3 text-[13px] font-black text-[color:var(--text-primary)] shadow-[var(--shadow-border)] transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:border-[color:var(--primary)] hover:shadow-[var(--shadow-border-hover)] focus-within:border-[color:var(--primary)] focus-within:ring-4 focus-within:ring-[color:var(--primary-soft)] motion-reduce:transition-none sm:w-[220px]"
              >
                <span className="pointer-events-none grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
                  <ArrowDownUp size={14} aria-hidden="true" />
                </span>
                <span className="pointer-events-none min-w-0 flex-1 truncate">{sortLabels[sort]}</span>
                <ChevronDown size={15} className="pointer-events-none shrink-0 text-[color:var(--text-tertiary)] transition-[color,transform] duration-150 ease-out group-hover:text-[color:var(--primary)] motion-reduce:transition-none" aria-hidden="true" />
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as AdminVideoFeedbackSort)}
                  aria-label="Sort video feedback"
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 bg-transparent opacity-0 outline-none"
                >
                  {Object.entries(sortLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-2 p-3">
            {loading ? (
              [1, 2, 3, 4].map((item) => (
                <div key={item} className="h-[104px] rounded-[16px] bg-[color:var(--surface-page)] motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none" />
              ))
            ) : visibleItems.length ? (
              visibleItems.map((item) => (
                <VideoFeedbackRow
                  key={item.topic_item_id}
                  item={item}
                  selected={selectedItem?.topic_item_id === item.topic_item_id}
                  onSelect={() => setSelectedId(item.topic_item_id)}
                />
              ))
            ) : (
              <div className="grid min-h-[320px] place-items-center px-6 text-center">
                <div>
                  <MessageSquareText size={34} className="mx-auto mb-3 text-[#d4d4d8]" />
                  <p className="m-0 text-[15px] font-black text-[color:var(--text-primary)]">No rated video feedback.</p>
                  <p className="m-0 mt-1 text-[12px] font-semibold text-[color:var(--text-tertiary)]">
                    Clear search or wait for rated video comments.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <VideoFeedbackDetail item={selectedItem} />
      </div>
    </main>
  )
}

function FeedbackMetric({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint: string
  loading: boolean
  tone?: 'default' | 'good' | 'warn'
}) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[color:var(--text-primary)]'
  return (
    <div className={adminMetricTileClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
          <Icon size={18} />
        </span>
      </div>
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[color:var(--text-tertiary)]">{label}</p>
      <p className={`m-0 mt-1 text-[25px] font-black leading-none tabular-nums ${toneClass}`}>
        {loading ? '-' : value}
      </p>
      <p className="m-0 mt-2 text-[12px] font-bold text-[color:var(--text-tertiary)]">{hint}</p>
    </div>
  )
}

function VideoFeedbackRow({
  item,
  selected,
  onSelect,
}: {
  item: AdminVideoFeedbackItem
  selected: boolean
  onSelect: () => void
}) {
  const totalSignal = Math.max(item.positive_count + item.negative_count + item.neutral_count, 1)
  const positiveWidth = `${Math.round((item.positive_count / totalSignal) * 100)}%`
  const negativeWidth = `${Math.round((item.negative_count / totalSignal) * 100)}%`
  return (
    <button
      type="button"
      onClick={onSelect}
      data-video-feedback-row={item.topic_item_id}
      className={`grid min-h-[104px] w-full grid-cols-1 gap-4 rounded-[17px] p-4 text-left shadow-[var(--shadow-border)] transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 lg:grid-cols-[minmax(0,1fr)_180px] ${
        selected
          ? 'bg-[color:var(--primary-soft)] shadow-[inset_0_0_0_1px_rgba(69,61,238,0.2)]'
          : 'bg-white hover:bg-[#fbfbfc] hover:shadow-[var(--shadow-border-hover)]'
      }`}
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${feedbackDecisionClass(item)}`}>
            {feedbackDecision(item)}
          </span>
          <span className="text-[11px] font-black uppercase tracking-[0.04em] text-[color:var(--text-tertiary)]">
            {formatDuration(item.duration_seconds)}
          </span>
        </div>
        <h3 className="m-0 text-balance text-[15px] font-black leading-snug text-[color:var(--text-primary)]">{item.title}</h3>
        <p className="m-0 mt-1 truncate text-[12px] font-bold text-[color:var(--text-tertiary)]">
          {[item.subject_title, item.topic_title].filter(Boolean).join(' / ') || item.item_type || 'Video'}
        </p>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[color:var(--text-tertiary)]">Avg</p>
            <p className="m-0 text-[24px] font-black leading-none text-[color:var(--text-primary)] tabular-nums">{ratingValue(item.average_rating)}</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[color:var(--text-secondary)] tabular-nums">
            {formatNumber(item.rating_count)} ratings
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#eef2f7]">
          <div className="flex h-full w-full">
            <span className="h-full bg-[#10b981]" style={{ width: positiveWidth }} />
            <span className="h-full bg-[#f59e0b]" style={{ width: negativeWidth }} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-black tabular-nums">
          <span className="text-[#059669]">{formatNumber(item.positive_count)} positive</span>
          <span className="text-[#d97706]">{formatNumber(item.negative_count)} negative</span>
        </div>
      </div>
    </button>
  )
}

function VideoFeedbackDetail({ item }: { item: AdminVideoFeedbackItem | null }) {
  if (!item) {
    return (
      <aside className={`${card} grid min-h-[420px] place-items-center p-6 text-center`}>
        <div>
          <Video size={34} className="mx-auto mb-3 text-[#d4d4d8]" />
          <p className="m-0 text-[15px] font-black text-[color:var(--text-primary)]">Select a video.</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className={`${card} overflow-hidden`}>
      <div className="border-b border-[color:var(--border)] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[color:var(--text-tertiary)]">Selected video</p>
            <h2 className="m-0 mt-1 text-balance text-[20px] font-black leading-tight text-[color:var(--text-primary)]">{item.title}</h2>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${feedbackDecisionClass(item)}`}>
            {feedbackDecision(item)}
          </span>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-[16px] bg-[color:var(--surface-page)] shadow-[var(--shadow-border)]">
          <MiniStat label="Avg" value={ratingValue(item.average_rating)} />
          <MiniStat label="Bad" value={item.negative_count} tone="warn" />
          <MiniStat label="Good" value={item.positive_count} tone="good" />
        </div>
      </div>

      <div className="grid max-h-[620px] gap-4 overflow-y-auto p-5">
        <CommentBucket
          icon={ThumbsDown}
          title="Negative comments"
          comments={item.negative_comments}
          empty="No 1-2 star comments."
          tone="warn"
        />
        <CommentBucket
          icon={ThumbsUp}
          title="Positive comments"
          comments={item.positive_comments}
          empty="No 4-5 star comments."
          tone="good"
        />
      </div>
    </aside>
  )
}

function MiniStat({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[color:var(--text-primary)]'
  return (
    <div className="border-r border-[color:var(--border)] p-3 last:border-r-0">
      <p className="m-0 text-[10px] font-black uppercase tracking-[0.04em] text-[color:var(--text-tertiary)]">{label}</p>
      <p className={`m-0 mt-1 text-[18px] font-black tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function CommentBucket({
  icon: Icon,
  title,
  comments,
  empty,
  tone,
}: {
  icon: LucideIcon
  title: string
  comments: AdminVideoFeedbackComment[]
  empty: string
  tone: 'good' | 'warn'
}) {
  const iconClass = tone === 'good' ? 'bg-[#ecfdf5] text-[#059669]' : 'bg-[#fff7ed] text-[#d97706]'
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-[10px] ${iconClass}`}>
          <Icon size={15} />
        </span>
        <h3 className="m-0 text-[14px] font-black text-[color:var(--text-primary)]">{title}</h3>
      </div>
      {comments.length ? (
        <div className="grid gap-2">
          {comments.map((comment) => (
            <article key={comment.comment_id} className="rounded-[15px] bg-[color:var(--surface-page)] p-3 shadow-[var(--shadow-border)]">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[12px] font-black text-[color:var(--text-secondary)]">{comment.author_name}</span>
                <span className="shrink-0 text-[11px] font-black text-[color:var(--text-tertiary)] tabular-nums">{comment.rating}/5</span>
              </div>
              <p className="m-0 text-pretty whitespace-pre-line break-words text-[13px] font-semibold leading-6 text-[color:var(--text-secondary)]">{comment.body}</p>
              {comment.created_at && <p className="m-0 mt-2 text-[11px] font-bold text-[color:var(--text-tertiary)]">{formatDate(comment.created_at)}</p>}
            </article>
          ))}
        </div>
      ) : (
        <p className="m-0 rounded-[14px] bg-[color:var(--surface-page)] p-3 text-[13px] font-bold text-[color:var(--text-tertiary)]">{empty}</p>
      )}
    </section>
  )
}

function ratingValue(value: number) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('fr-FR')
}

function formatDuration(seconds: number) {
  if (!seconds) return 'No duration'
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${formatNumber(minutes)} min`
}

function feedbackDecision(item: AdminVideoFeedbackItem) {
  if (item.negative_count >= 3 || item.average_rating < 3) return 'Rework'
  if (item.negative_count > 0 || item.average_rating < 4) return 'Monitor'
  return 'Strong'
}

function feedbackDecisionClass(item: AdminVideoFeedbackItem) {
  const decision = feedbackDecision(item)
  if (decision === 'Rework') return 'bg-[#fff7ed] text-[#d97706]'
  if (decision === 'Monitor') return 'bg-[color:var(--primary-soft)] text-[color:var(--primary)]'
  return 'bg-[#ecfdf5] text-[#059669]'
}
