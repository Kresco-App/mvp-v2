'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  CircleAlert,
  MessageSquareText,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
} from '@/components/admin/AdminDesign'
import { getJson } from '@/lib/apiClient'
import { formatNumber, recordEntries } from '@/lib/adminOverview'
import {
  EMPTY_ADMIN_COMMUNICATIONS,
  type AdminChatConversation,
  type AdminChatMessage,
  type AdminCommunications,
  type AdminProfessorChatGroup,
} from '@/lib/adminCommunications'

const card = adminPanelClass
const transcriptPageSize = 5

const statusLabels: Record<string, string> = {
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
  resolved: 'Resolved',
}
const EMPTY_PROFESSOR_GROUPS: AdminProfessorChatGroup[] = []

export default function AdminCommunicationsPage() {
  const [data, setData] = useState<AdminCommunications>(EMPTY_ADMIN_COMMUNICATIONS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState(() => initialCommunicationQuery())
  const [submittedQuery, setSubmittedQuery] = useState(() => initialCommunicationQuery())
  const [selectedProfessorId, setSelectedProfessorId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ limit: '100' })
    if (submittedQuery.trim()) params.set('q', submittedQuery.trim())

    setLoading(true)
    setError('')
    getJson<AdminCommunications>(`/admin/communications?${params.toString()}`)
      .then((response) => {
        if (!alive) return
        setData(response ?? EMPTY_ADMIN_COMMUNICATIONS)
      })
      .catch(() => {
        if (!alive) return
        setData(EMPTY_ADMIN_COMMUNICATIONS)
        setError('Unable to load private chats.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [nonce, submittedQuery])

  const professorGroups = data.professors ?? EMPTY_PROFESSOR_GROUPS
  const selectedProfessor = useMemo(() => {
    if (!professorGroups.length) return null
    return professorGroups.find((professor) => professor.professor_user_id === selectedProfessorId) ?? professorGroups[0]
  }, [professorGroups, selectedProfessorId])

  function applySearch() {
    setSubmittedQuery(query.trim())
    setSelectedProfessorId(null)
  }

  function clearSearch() {
    setQuery('')
    setSubmittedQuery('')
    setSelectedProfessorId(null)
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={MessageSquareText}
        title="Private messages"
        syncLabel={data.generated_at ? `Last sync: ${formatDate(data.generated_at, true)}` : undefined}
        action={<AdminRefreshButton loading={loading} label="Refresh" onClick={() => setNonce((value) => value + 1)} />}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <CommunicationsCommandBar
        summary={data.summary}
        loading={loading}
        search={(
          <SearchCommand
            query={query}
            submittedQuery={submittedQuery}
            loading={loading}
            matchedCount={data.summary.matched_conversations}
            statusData={recordEntries(data.chat_conversations_by_status, 5)}
            onQueryChange={setQuery}
            onSearch={applySearch}
            onClear={clearSearch}
          />
        )}
      />

      <section className={`${card} overflow-hidden`}>
        <div className="grid min-h-[640px] lg:grid-cols-[360px_minmax(0,1fr)]">
          <ProfessorList
            loading={loading}
            professors={professorGroups}
            selectedProfessorId={selectedProfessor?.professor_user_id ?? null}
            onSelect={setSelectedProfessorId}
          />
          <div className="min-w-0 border-t border-[color:var(--border)] lg:border-l lg:border-t-0">
            {loading ? (
              <div className="grid gap-0">
                {[1, 2, 3, 4].map((item) => <SkeletonConversation key={item} />)}
              </div>
            ) : selectedProfessor ? (
              <ProfessorConversationPanel professor={selectedProfessor} />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function CommunicationsCommandBar({
  summary,
  loading,
  search,
}: {
  summary: AdminCommunications['summary']
  loading: boolean
  search: ReactNode
}) {
  const professorBacklog = summary.unread_for_professors
  const stats = [
    { icon: ShieldCheck, label: 'Open chats', value: summary.open_conversations },
    { icon: Users, label: 'Students', value: summary.students_in_private_chats },
    { icon: MessageSquareText, label: '7d messages', value: summary.messages_7d },
    { icon: CircleAlert, label: 'Awaiting student', value: summary.unread_for_students },
  ]

  return (
    <section className={`${card} mb-5 overflow-hidden`}>
      <div className="grid xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="grid gap-0 border-b border-[color:var(--border)] xl:border-b-0 xl:border-r">
          <div className="flex min-h-[132px] items-center justify-between gap-4 bg-[#111827] px-5 py-4 text-white">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-black uppercase tracking-[0.06em] text-white/52">Professor backlog</p>
              <p className="m-0 mt-2 text-[38px] font-black leading-none tabular-nums">{loading ? '-' : formatNumber(professorBacklog)}</p>
              <p className="m-0 mt-2 text-[12px] font-bold text-white/60">
                {loading ? '-' : `${formatNumber(summary.open_conversations)} open chats - ${formatNumber(summary.students_in_private_chats)} students`}
              </p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white/10 text-white">
              <CircleAlert size={19} />
            </span>
          </div>
          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4 xl:grid-cols-2">
            {stats.map((item) => (
              <MiniStat
                key={item.label}
                icon={item.icon}
                label={item.label}
                value={loading ? '-' : formatNumber(item.value)}
              />
            ))}
          </div>
        </div>
        <div className="min-w-0 p-4 lg:p-5">{search}</div>
      </div>
    </section>
  )
}

function SearchCommand({
  query,
  submittedQuery,
  loading,
  matchedCount,
  statusData,
  onQueryChange,
  onSearch,
  onClear,
}: {
  query: string
  submittedQuery: string
  loading: boolean
  matchedCount: number
  statusData: Array<{ key: string; value: number }>
  onQueryChange: (value: string) => void
  onSearch: () => void
  onClear: () => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch()
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-center">
        <AdminSearchBox
          value={query}
          onChange={onQueryChange}
          placeholder="Student, professor, message"
          label="Search private messages"
          className="h-11 min-w-0 flex-1 rounded-[14px]"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="submit" className={`${adminPrimaryButtonClass} h-11 w-full whitespace-nowrap rounded-[14px] sm:w-[112px]`}>
            <Search size={15} /> Search
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!query && !submittedQuery}
            className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[color:var(--border)] bg-white px-4 text-[13px] font-black text-[color:var(--text-secondary)] transition-[border-color,color,opacity,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 sm:w-[92px] sm:whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px] font-black text-[color:var(--text-secondary)]">
        <span className="inline-flex min-h-8 items-center rounded-full bg-[color:var(--surface-page)] px-3 shadow-[var(--shadow-border)] tabular-nums">
          {loading ? '-' : formatNumber(matchedCount)} match{matchedCount === 1 ? '' : 'es'}
        </span>
        {statusData.map((item) => (
          <span key={item.key} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-[color:var(--surface-page)] px-3 shadow-[var(--shadow-border)]">
            <span className={`h-2 w-2 rounded-full ${item.key === 'open' ? 'bg-[#f59e0b]' : 'bg-[#16a34a]'}`} />
            {statusLabels[item.key] ?? item.key} {formatNumber(item.value)}
          </span>
        ))}
        {submittedQuery && <span className="inline-flex min-h-8 min-w-0 items-center truncate rounded-full bg-[color:var(--primary-soft)] px-3 text-[color:var(--primary)]">Filtered: {submittedQuery}</span>}
      </div>
    </form>
  )
}

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-[70px] items-center gap-2 border-r border-t border-[color:var(--border)] bg-white px-3 py-3 last:border-r-0 sm:[&:nth-child(4n)]:border-r-0 xl:[&:nth-child(2n)]:border-r-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-black leading-none text-[color:var(--text-primary)] tabular-nums">{value}</span>
        <span className="mt-1 block truncate text-[10px] font-black uppercase leading-[1.1] tracking-[0.04em] text-[color:var(--text-tertiary)]">{label}</span>
      </span>
    </div>
  )
}

function ProfessorList({
  loading,
  professors,
  selectedProfessorId,
  onSelect,
}: {
  loading: boolean
  professors: AdminProfessorChatGroup[]
  selectedProfessorId: number | null
  onSelect: (professorId: number) => void
}) {
  return (
    <aside className="min-w-0 bg-[color:var(--surface-card)]">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-[16px] font-black text-[color:var(--text-primary)]">Professor inbox</h2>
          <span className="rounded-full bg-[color:var(--surface-page)] px-2.5 py-1 text-[11px] font-black text-[color:var(--text-secondary)]">
            {loading ? '-' : formatNumber(professors.length)}
          </span>
        </div>
      </div>
      {loading ? (
        <div className="grid gap-0">
          {[1, 2, 3, 4].map((item) => <SkeletonProfessor key={item} />)}
        </div>
      ) : !professors.length ? (
        <div className="px-5 py-10 text-center text-[13px] font-bold text-[color:var(--text-hint)]">No private chats.</div>
      ) : (
        <div className="max-h-[680px] overflow-y-auto">
          {professors.map((professor) => {
            const selected = professor.professor_user_id === selectedProfessorId
            return (
              <button
                key={professor.professor_user_id}
                type="button"
                onClick={() => onSelect(professor.professor_user_id)}
                className={`block w-full border-b border-[color:var(--border)] px-5 py-4 text-left transition-[background-color,box-shadow,color] duration-150 ease-out ${
                  selected ? 'bg-[color:var(--primary-soft)] shadow-[inset_3px_0_0_var(--primary)]' : 'bg-white hover:bg-[color:var(--surface-page)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[14px] font-black text-[color:var(--text-primary)]">
                      {professor.professor_name || `Professor #${professor.professor_user_id}`}
                    </p>
                    <p className="m-0 mt-1 text-[12px] font-bold text-[color:var(--text-hint)]">
                      {formatNumber(professor.conversation_count)} chats - {formatNumber(professor.open_conversations)} open
                    </p>
                  </div>
                  {!!professor.unread_for_professor && (
                    <span className="rounded-full bg-[#fff7ed] px-2.5 py-1 text-[11px] font-black text-[#f5900b] tabular-nums">
                      {formatNumber(professor.unread_for_professor)}
                    </span>
                  )}
                </div>
                <p className="m-0 mt-2 text-[12px] font-semibold text-[color:var(--text-tertiary)]">
                  {formatDate(professor.last_message_at)}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}

function ProfessorConversationPanel({ professor }: { professor: AdminProfessorChatGroup }) {
  return (
    <div className="min-w-0">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[18px] font-black text-[color:var(--text-primary)]">
              {professor.professor_name || `Professor #${professor.professor_user_id}`}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px] font-black">
            <span className="rounded-full bg-[#fff7ed] px-3 py-1 text-[#f5900b]">Awaiting professor {formatNumber(professor.unread_for_professor)}</span>
            <span className="rounded-full bg-[#eef0ff] px-3 py-1 text-[#4f46e5]">Awaiting student {formatNumber(professor.unread_for_student)}</span>
            <span className="rounded-full bg-[color:var(--surface-page)] px-3 py-1 text-[color:var(--text-secondary)]">{formatNumber(professor.conversation_count)} chats</span>
          </div>
        </div>
      </div>
      <div className="divide-y divide-[color:var(--border)]">
        {professor.conversations.map((conversation) => (
          <ConversationCard key={conversation.conversation_id} conversation={conversation} />
        ))}
      </div>
    </div>
  )
}

function ConversationCard({ conversation }: { conversation: AdminChatConversation }) {
  return (
    <article className="grid gap-4 px-5 py-5">
      <div className="grid gap-3 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface-page)] p-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={conversation.status} />
            <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[color:var(--text-tertiary)]">#{conversation.conversation_id}</span>
          </div>
          <h3 className="m-0 mt-2 truncate text-[15px] font-black text-[color:var(--text-primary)]">
            {conversation.student_name || `Student #${conversation.student_user_id}`}
          </h3>
          <p className="m-0 mt-1 truncate text-[13px] font-semibold text-[color:var(--text-secondary)]">
            {conversation.course_title || `Offering #${conversation.course_offering_id}`}
          </p>
          <p className="m-0 mt-2 line-clamp-2 text-[13px] font-semibold text-[color:var(--text-hint)]">
            {conversation.last_message_preview || '-'}
          </p>
        </div>
        <div className="grid content-start gap-2 text-[12px] font-bold text-[color:var(--text-secondary)]">
          <span><strong className="text-[#f5900b]">{formatNumber(conversation.unread_for_professor)}</strong> awaiting professor</span>
          <span>{formatNumber(conversation.unread_for_student)} awaiting student</span>
          <span>Last: {formatDate(conversation.last_message_at, true)}</span>
        </div>
      </div>
      <Transcript conversation={conversation} messages={conversation.messages ?? []} />
    </article>
  )
}

function Transcript({ conversation, messages }: { conversation: AdminChatConversation; messages: AdminChatMessage[] }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(messages.length / transcriptPageSize))
  const safePage = Math.min(page, pageCount)
  const startIndex = (safePage - 1) * transcriptPageSize
  const endIndex = Math.min(startIndex + transcriptPageSize, messages.length)
  const visibleMessages = messages.slice(startIndex, startIndex + transcriptPageSize)

  useEffect(() => {
    setPage(1)
  }, [conversation.conversation_id, messages.length])

  return (
    <div className="rounded-[16px] border border-[color:var(--border)] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="m-0 text-[12px] font-black uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">Messages</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[color:var(--surface-page)] px-2.5 py-1 text-[11px] font-black text-[color:var(--text-secondary)] tabular-nums">
            {messages.length ? `${formatNumber(startIndex + 1)}-${formatNumber(endIndex)} / ${formatNumber(messages.length)}` : '0'}
          </span>
        </div>
      </div>
      {!messages.length ? (
        <p className="m-0 rounded-[12px] border border-dashed border-[color:var(--border)] bg-white px-3 py-4 text-center text-[13px] font-semibold text-[color:var(--text-hint)]">
          -
        </p>
      ) : (
        <>
          <div aria-label="Private conversation messages" className="max-h-[360px] overflow-y-auto pr-1">
            <div className="grid gap-2.5">
              {visibleMessages.map((message, index) => (
                <MessageBubble
                  key={message.message_id}
                  message={message}
                  studentName={conversation.student_name}
                  showSender={index === 0 || visibleMessages[index - 1]?.sender_user_id !== message.sender_user_id}
                />
              ))}
            </div>
          </div>
          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--border)] pt-3">
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex h-10 items-center rounded-[10px] border border-[color:var(--border)] bg-white px-3 text-[12px] font-black text-[color:var(--text-secondary)] transition-[border-color,color,opacity,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-[12px] font-black text-[color:var(--text-tertiary)] tabular-nums">
                Page {formatNumber(safePage)} / {formatNumber(pageCount)}
              </span>
              <button
                type="button"
                disabled={safePage === pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                className="inline-flex h-10 items-center rounded-[10px] border border-[color:var(--border)] bg-white px-3 text-[12px] font-black text-[color:var(--text-secondary)] transition-[border-color,color,opacity,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MessageBubble({ message, studentName, showSender }: { message: AdminChatMessage; studentName: string; showSender: boolean }) {
  const fromStudent = message.sender_role === 'student'
  return (
    <div className={`flex ${fromStudent ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[82%] rounded-[14px] px-3 py-2.5 shadow-sm ${fromStudent ? 'bg-[color:var(--surface-page)] text-[color:var(--text-primary)]' : 'bg-[color:var(--primary)] text-white'}`}>
        {showSender && (
          <div className="mb-1 flex min-w-0 items-center">
            <span className={`truncate text-[12px] font-black ${fromStudent ? 'text-[color:var(--text-secondary)]' : 'text-white/75'}`}>
              {message.sender_name || studentName || `#${message.sender_user_id}`}
            </span>
          </div>
        )}
        <p className="m-0 whitespace-pre-wrap break-words text-[13px] font-semibold leading-5">
          {message.body || 'Empty message.'}
        </p>
        <p className={`m-0 mt-2 text-[11px] font-bold ${fromStudent ? 'text-[color:var(--text-tertiary)]' : 'text-white/60'}`}>
          {formatDate(message.created_at, true)}
        </p>
        {message.attachment_url && (
          <p className={`m-0 mt-2 truncate text-[12px] font-bold ${fromStudent ? 'text-[color:var(--primary)]' : 'text-white'}`}>
            Attachment: {message.attachment_name || message.attachment_url}
          </p>
        )}
      </div>
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  const open = value === 'open'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${open ? 'bg-[#fff7ed] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
      {open && <CircleAlert size={12} />}
      {statusLabels[value] ?? value}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="grid min-h-[420px] place-items-center p-8 text-center">
      <div>
        <MessageSquareText size={30} className="mx-auto mb-3 text-[color:var(--text-tertiary)]" />
        <p className="m-0 text-[15px] font-black text-[color:var(--text-primary)]">No private chats.</p>
      </div>
    </div>
  )
}

function SkeletonProfessor() {
  return (
    <div className="border-b border-[color:var(--border)] px-5 py-4">
      <div className="h-4 w-40 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[color:var(--surface-page)]" />
      <div className="mt-3 h-3 w-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[color:var(--surface-page)]" />
    </div>
  )
}

function SkeletonConversation() {
  return (
    <div className="border-b border-[color:var(--border)] px-5 py-5">
      <div className="h-4 w-56 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[color:var(--surface-page)]" />
      <div className="mt-3 h-3 w-72 max-w-full motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[color:var(--surface-page)]" />
      <div className="mt-5 h-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[16px] bg-[color:var(--surface-page)]" />
    </div>
  )
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return 'No date'
  return new Date(value).toLocaleString('fr-FR', includeTime ? undefined : { dateStyle: 'medium' })
}

function initialCommunicationQuery() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('q')?.trim() ?? ''
}
