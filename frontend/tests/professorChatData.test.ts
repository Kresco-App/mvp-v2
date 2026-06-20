// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiSWRConfig } from '@/lib/apiData'
import {
  parseProfessorChatUrlState,
  professorConversationListParams,
  professorChatUrlStatesEqual,
  professorChatUrlStateToSearchParams,
  professorConversationsSWRKey,
  professorMessagesSWRKey,
  useProfessorChatData,
  type ProfessorConversationFilter,
} from '@/lib/professorChatData'
import type { ProfessorConversation, ProfessorMessage } from '@/lib/professor'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mountedRoots = []
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  mountedRoots = []
})

describe('professor chat SWR data', () => {
  it('builds stable filtered keys and omits false conversation filters from API params', () => {
    expect(professorConversationsSWRKey({ q: ' Sara ', filter: 'unread' })).toEqual([
      '/professor/chat/conversations',
      { q: 'Sara', filter: 'unread' },
    ])
    expect(professorConversationListParams({ q: ' Sara ', filter: 'unread' })).toEqual({
      q: 'Sara',
      unread: true,
    })
    expect(professorConversationListParams({ filter: 'pinned' })).toEqual({ pinned: true })
    expect(professorConversationListParams({ filter: 'all' })).toEqual({})
    expect(professorMessagesSWRKey(81)).toEqual(['/professor/chat/conversations/messages', 81])
    expect(professorMessagesSWRKey(null)).toBeNull()
  })

  it('parses and serializes professor chat URL state', () => {
    expect(parseProfessorChatUrlState(new URLSearchParams('conversation=82&q= Sara &filter=unread'))).toEqual({
      conversationId: 82,
      q: 'Sara',
      filter: 'unread',
    })
    expect(parseProfessorChatUrlState(new URLSearchParams('thread=abc&search= Youssef &filter=missing'))).toEqual({
      conversationId: null,
      q: 'Youssef',
      filter: 'all',
    })

    const params = professorChatUrlStateToSearchParams(
      { conversationId: 82, q: '  Sara ', filter: 'pinned' },
      new URLSearchParams('page=2&conversationId=99&search=old&filter=unread'),
    )

    expect(params.toString()).toBe('page=2&conversation=82&q=Sara&filter=pinned')
    expect(professorChatUrlStateToSearchParams({ conversationId: null, q: '', filter: 'all' }).toString()).toBe('')
    expect(professorChatUrlStatesEqual(
      { conversationId: 82, q: 'Sara', filter: 'pinned' },
      { conversationId: 82, q: 'Sara', filter: 'pinned' },
    )).toBe(true)
  })

  it('loads conversations and active messages through independent SWR resources', async () => {
    mocks.apiGet.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/professor/chat/conversations') {
        expect(config?.params).toEqual({})
        return { data: [conversationFixture(81, 'Sara Benali'), conversationFixture(82, 'Youssef El Idrissi')] }
      }
      if (url === '/professor/chat/conversations/81/messages') {
        return { data: [messageFixture(701, 81, 'Can you review my final proof step?')] }
      }
      if (url === '/professor/chat/conversations/82/messages') {
        return { data: [messageFixture(702, 82, 'Second thread question')] }
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderChatHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('conversations: Sara Benali, Youssef El Idrissi')
      expect(container.textContent).toContain('messages: Can you review my final proof step?')
      expect(container.textContent).toContain('messages loading: no')
    })

    await act(async () => {
      getButton(container, 'Go conversation 82').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('messages: Second thread question')
    })
  })

  it('does not expose previous conversation messages while the next conversation is still loading', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/chat/conversations') {
        return { data: [conversationFixture(81, 'Sara Benali'), conversationFixture(82, 'Youssef El Idrissi')] }
      }
      if (url === '/professor/chat/conversations/81/messages') {
        return { data: [messageFixture(701, 81, 'First thread answer')] }
      }
      if (url === '/professor/chat/conversations/82/messages') {
        return new Promise(() => undefined)
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderChatHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('messages: First thread answer')
    })

    await act(async () => {
      getButton(container, 'Go conversation 82').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('active: 82')
      expect(container.textContent).toContain('messages: none')
      expect(container.textContent).toContain('messages loading: yes')
    })
    expect(container.textContent).not.toContain('First thread answer')
  })

  it('keeps cached messages visible when active thread revalidation fails', async () => {
    let failMessages = false
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/professor/chat/conversations') {
        return { data: [conversationFixture(81, 'Sara Benali')] }
      }
      if (url === '/professor/chat/conversations/81/messages') {
        if (failMessages) throw { response: { status: 503, data: { detail: 'Message service unavailable' } } }
        return { data: [messageFixture(701, 81, 'Cached professor reply')] }
      }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderChatHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('messages: Cached professor reply')
      expect(container.textContent).toContain('messages error: no')
    })

    failMessages = true
    await act(async () => {
      getButton(container, 'Refresh messages').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('messages: Cached professor reply')
      expect(container.textContent).toContain('messages error: yes')
    })
  })

  it('keeps student chat fallback polling bounded and thread derivation memoized', () => {
    const source = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    expect(source).toContain('fallback: { intervalMs: 5000, poll: refreshChat }')
    expect(source).toContain('const threadOptions = useMemo(() => status ? teacherThreads(status) : [], [status])')
    expect(source).toContain('const pendingConversationId = !active && selectedThread?.conversation?.id ? selectedThread.conversation.id : null')
    expect(source).not.toContain('Start a private question')
    expect(source).not.toContain('fallback: { intervalMs: 2500')
    expect(source).not.toContain('{teacherThreads(status).map')
  })

  it('keeps professor chat page selection and filters URL-backed', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain('parseProfessorChatUrlState')
    expect(professorSource).toContain('professorChatUrlStateToSearchParams')
    expect(professorSource).toContain('applyChatUrlState({ q: event.target.value })')
    expect(professorSource).toContain('applyChatUrlState({ filter: item })')
    expect(professorSource).toContain('applyChatUrlState({ conversationId: conversation.id })')
    expect(studentSource).toContain('parseStudentProfessorChatUrlState')
    expect(studentSource).toContain('studentProfessorChatUrlStateToSearchParams')
    expect(studentSource).toContain('applyChatUrlState({ conversationId: conversationId ?? null, offeringId: courseOfferingId })')
  })

  it('keeps student chat timestamps visually attached to their message bubble', () => {
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    expect(studentSource).toContain('<span className={`mt-1 block text-[11px] font-bold text-[#a1a1aa]')
    expect(studentSource).not.toContain('<motion.span layout className={`mt-1 block text-[11px] font-bold text-[#a1a1aa]')
  })

  it('keeps student teacher switching reachable on mobile', () => {
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    expect(studentSource).toContain('className="mt-4 w-full max-w-[720px] lg:hidden" aria-label="Teacher conversations"')
    expect(studentSource).toContain('aria-label={teacherThreadButtonLabel(thread)}')
    expect(studentSource).toContain('onClick={() => selectThread(thread.course_offering_id, thread.conversation?.id)}')
    expect(studentSource).toContain('function teacherThreadButtonLabel')
  })

  it('keeps professor inbox fixed-height behavior scoped to desktop', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain('lg:h-[calc(100vh-210px)] lg:min-h-[620px] lg:grid-cols-[360px_1fr]')
    expect(professorSource).toContain('flex max-h-[420px] min-h-0 flex-col')
    expect(professorSource).toContain('Clear filters')
    expect(professorSource).not.toContain('grid h-[calc(100vh-230px)] min-h-[620px]')
  })

  it('keeps professor chat cached refresh states visible without replacing loaded content', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')
    const professorDataSource = readFileSync(join(process.cwd(), 'lib', 'professorChatData.ts'), 'utf8')

    expect(professorDataSource).toContain('conversationsRefreshing: conversationQuery.isValidating && Boolean(conversationQuery.data)')
    expect(professorDataSource).toContain('messagesRefreshing: Boolean(activeConversationId) && Boolean(activeMessageEnvelope) && messageQuery.isValidating')
    expect(professorSource).toContain('conversationsRefreshing,')
    expect(professorSource).toContain('messagesRefreshing,')
    expect(professorSource).toContain('conversationsRefreshing && conversations.length > 0')
    expect(professorSource).toContain('key="professor-inbox-refreshing"')
    expect(professorSource).toContain('Syncing inbox')
    expect(professorSource).toContain('messagesRefreshing && messages.length > 0')
    expect(professorSource).toContain('key="professor-messages-refreshing"')
    expect(professorSource).toContain('Syncing')
  })

  it('keeps professor replies optimistic with failed-message retry controls', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain('const optimisticMessageIdRef = useRef(-1)')
    expect(professorSource).toContain('const optimisticImageFilesRef = useRef(new Map<number, File>())')
    expect(professorSource).toContain('const optimisticAttachmentUrlsRef = useRef(new Set<string>())')
    expect(professorSource).toContain('createOptimisticProfessorMessage({')
    expect(professorSource).toContain('replaceOptimisticMessage(items, optimisticMessage.id, sent)')
    expect(professorSource).toContain('async function retryFailedMessage')
    expect(professorSource).toContain('async function removeFailedMessage')
    expect(professorSource).toContain("message.status === 'sending'")
    expect(professorSource).toContain("message.status === 'failed'")
    expect(professorSource).toContain("return image\n    ? sendProfessorImageMessage(conversationId, image, body)\n    : sendProfessorMessage(conversationId, body)")
  })

  it('keeps the professor composer multi-line with quick reply actions', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain('const PROFESSOR_QUICK_REPLIES = [')
    expect(professorSource).toContain('const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null)')
    expect(professorSource).toContain('function applyQuickReply(reply: string)')
    expect(professorSource).toContain('aria-label="Professor quick replies"')
    expect(professorSource).toContain('PROFESSOR_QUICK_REPLIES.map((reply) =>')
    expect(professorSource).toContain('ref={draftTextareaRef}')
    expect(professorSource).toContain('event.currentTarget.form?.requestSubmit()')
    expect(professorSource).not.toContain('<input\n                      aria-label={selectedImage ? \'Reply caption\' : \'Reply to this student\'}')
  })

  it('keeps professor image attachments paste and drop aware', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain('const [isComposerDragActive, setIsComposerDragActive] = useState(false)')
    expect(professorSource).toContain('function imageFileFromFileList(files: FileList | null | undefined)')
    expect(professorSource).toContain('function attachComposerTransferImage(file: File | null, emptyMessage: string)')
    expect(professorSource).toContain('function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>)')
    expect(professorSource).toContain('function handleComposerDragEnter(event: DragEvent<HTMLFormElement>)')
    expect(professorSource).toContain('function handleComposerDragOver(event: DragEvent<HTMLFormElement>)')
    expect(professorSource).toContain('function handleComposerDragLeave(event: DragEvent<HTMLFormElement>)')
    expect(professorSource).toContain('function handleComposerDrop(event: DragEvent<HTMLFormElement>)')
    expect(professorSource).toContain('onDragEnter={handleComposerDragEnter}')
    expect(professorSource).toContain('onDragOver={handleComposerDragOver}')
    expect(professorSource).toContain('onDragLeave={handleComposerDragLeave}')
    expect(professorSource).toContain('onDrop={handleComposerDrop}')
    expect(professorSource).toContain('aria-label="Professor reply composer"')
    expect(professorSource).toContain('Drop image to attach')
    expect(professorSource).toContain('onPaste={handleComposerPaste}')
  })

  it('keeps professor inbox student replies visually clustered with avatars', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain('const showStudentAvatar = !mine && shouldShowStudentAvatar(messages, index)')
    expect(professorSource).toContain('<ChatAvatar name={active.student.full_name} src={active.student.avatar_url} />')
    expect(professorSource).toContain('function ChatAvatar({ name, src }: { name: string; src?: string | null })')
    expect(professorSource).toContain('function ChatAvatarSpacer()')
    expect(professorSource).toContain('function shouldShowStudentAvatar(messages: ProfessorMessage[], index: number)')
    expect(professorSource).toContain('!isSameUser(next.sender_user_id, current.sender_user_id) || shouldShowChatTimestamp(messages, index)')
  })

  it('keeps message action menus from stacking with their trigger button', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    for (const source of [professorSource, studentSource]) {
      expect(source).toContain('const isMessageMenuOpen = messageMenuId === message.id')
      expect(source).toContain('data-chat-message-actions')
      expect(source).toContain("target.closest('[data-chat-message-actions]')")
      expect(source).toContain('top-0 z-10 grid min-w-28')
      expect(source).not.toContain('right-0 top-9 z-10 grid min-w-28')
    }
  })

  it('keeps professor switching scoped to the student chat name and messages', () => {
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')
    const frameStart = studentSource.indexOf('key={chatFrameKey}')
    const formStart = studentSource.indexOf('onSubmit={active ? send : startConversationFromComposer}')
    const frameOpening = studentSource.slice(frameStart, studentSource.indexOf('>', frameStart))
    const frameSource = studentSource.slice(frameStart, formStart)

    expect(frameStart).toBeGreaterThan(-1)
    expect(formStart).toBeGreaterThan(frameStart)
    expect(frameSource).toContain('<h1')
    expect(frameSource).toContain('ref={messagesScrollerRef}')
    expect(frameSource).toContain('transition={chatFrameTransition}')
    expect(frameOpening).not.toContain('layout')
    expect(frameOpening).not.toContain('x:')
    expect(frameSource).not.toContain('onSubmit={active ? send : startConversationFromComposer}')
  })

  it('keeps the student chatbox outside professor switch motion', () => {
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')
    const formSubmitStart = studentSource.indexOf('onSubmit={active ? send : startConversationFromComposer}')
    const formTagStart = studentSource.lastIndexOf('<form', formSubmitStart)
    const formOpening = studentSource.slice(formTagStart, studentSource.indexOf('>', formSubmitStart))

    expect(formSubmitStart).toBeGreaterThan(-1)
    expect(formTagStart).toBeGreaterThan(-1)
    expect(formOpening).toContain('<form')
    expect(formOpening).not.toContain('<motion.form')
    expect(formOpening).not.toContain('transition-opacity')
    expect(formOpening).not.toContain('initial={{ opacity')
    expect(formOpening).not.toContain('animate={{ opacity')
    expect(formOpening).not.toContain('layout')
    expect(formOpening).not.toMatch(/[,{]\s*y\s*:/)
    expect(formOpening).not.toMatch(/[,{]\s*x\s*:/)
    expect(studentSource).not.toContain('chatboxVisible')
    expect(studentSource).not.toContain('setChatboxVisible')
    expect(studentSource).not.toContain('chatboxKey')
  })

  it('keeps older-message scroll snapshots scoped to the active chat frame', () => {
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    expect(studentSource).toContain('const chatFrameKey = active')
    expect(studentSource).toContain('frameKey: chatFrameKey')
    expect(studentSource).toContain('snapshot.frameKey !== chatFrameKey')
    expect(studentSource).toContain('olderPaginationSnapshotRef.current = null')
  })

  it('keeps a subtle top fade on the student message scroller', () => {
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    expect(studentSource).toContain('className="relative mt-6 min-h-0 w-full max-w-[720px] flex-1"')
    expect(studentSource).toContain('pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-white via-white/80 to-transparent')
    expect(studentSource).toContain('ref={messagesScrollerRef} className="h-full overflow-y-auto overflow-x-hidden pr-1"')
  })

  it('keeps professor inbox messages visually aligned with the student chat feel', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain("import { AnimatePresence, motion } from 'framer-motion'")
    expect(professorSource).toContain('const professorMessageMotionTransition = { type: \'spring\', stiffness: 520, damping: 42, mass: 0.72 } as const')
    expect(professorSource).toContain('className="relative min-h-[300px] flex-1 bg-[#fbfbfc]"')
    expect(professorSource).toContain('pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-[#fbfbfc] via-[#fbfbfc]/80 to-transparent')
    expect(professorSource).toContain('<AnimatePresence initial={false}>')
    expect(professorSource).toContain('transition={professorMessageMotionTransition}')
    expect(professorSource).toContain('animate={isDeleting ? { opacity: 0, y: -8, scale: 0.96 } : { opacity: 1, y: 0, scale: 1 }}')
  })

  it('keeps the active professor thread header actionable', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain('const [markingReadId, setMarkingReadId] = useState<number | null>(null)')
    expect(professorSource).toContain('async function markConversationRead(conversation: ProfessorConversation)')
    expect(professorSource).toContain('patchProfessorConversation(conversation.id, { mark_read: true })')
    expect(professorSource).toContain('updateProfessorConversationReadState(current, updated.id)')
    expect(professorSource).toContain('function updateProfessorConversationReadState(')
    expect(professorSource).toContain('aria-label="Active thread tools"')
    expect(professorSource).toContain('Latest: {activeLastMessage}')
    expect(professorSource).toContain('<span className="font-black text-[#3f3f46]">{messages.length}</span> loaded messages')
    expect(professorSource).not.toContain('aria-label="Active student brief"')
    expect(professorSource).not.toContain('function ProfessorThreadBrief(')
    expect(professorSource).not.toContain('function buildProfessorThreadBrief(')
    expect(professorSource).toContain('function focusReplyComposer()')
    expect(professorSource).toContain('Reply now')
    expect(professorSource).toContain('Mark read')
    expect(professorSource).toContain('disabled={markingReadId === active.id}')
  })

  it('keeps active professor threads locally searchable without replacing older-message paging', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')

    expect(professorSource).toContain("const [threadSearch, setThreadSearch] = useState('')")
    expect(professorSource).toContain('const normalizedThreadSearch = threadSearch.trim().toLowerCase()')
    expect(professorSource).toContain('const threadSearchMatches = useMemo(() => (')
    expect(professorSource).toContain('professorMessageMatchesThreadSearch(message, normalizedThreadSearch)')
    expect(professorSource).toContain('const messageIndexById = useMemo(() => new Map(messages.map((message, index) => [message.id, index])), [messages])')
    expect(professorSource).toContain('const renderedThreadMessages = hasThreadSearch ? threadSearchMatches : messageWindow.messages')
    expect(professorSource).toContain('setThreadSearch(\'\')\n  }, [activeId])')
    expect(professorSource).toContain('aria-label="Search active thread"')
    expect(professorSource).toContain('aria-label="Search messages in this thread"')
    expect(professorSource).toContain('aria-label="Clear thread search"')
    expect(professorSource).toContain('{threadSearchMatches.length} match{threadSearchMatches.length === 1 ? \'\' : \'es\'}')
    expect(professorSource).toContain('No messages match this search.')
    expect(professorSource).toContain('Clear thread search')
    expect(professorSource).toContain('!hasThreadSearch && messageWindow.canShowOlder')
    expect(professorSource).toContain('renderedThreadMessages.map((message, visibleIndex) =>')
    expect(professorSource).toContain('const index = hasThreadSearch ? messageIndexById.get(message.id) ?? visibleIndex : messageWindow.startIndex + visibleIndex')
    expect(professorSource).toContain('function professorMessageMatchesThreadSearch(message: ProfessorMessage, query: string)')
    expect(professorSource).toContain('message.attachment_name')
    expect(professorSource).toContain('formatTime(message.created_at)')
  })

  it('uses direct message scroller positioning when switching chats', () => {
    const professorSource = readFileSync(join(process.cwd(), 'app', 'professor', 'chat', 'page.tsx'), 'utf8')
    const studentSource = readFileSync(join(process.cwd(), 'app', '(dashboard)', 'professor-chat', 'page.tsx'), 'utf8')

    for (const source of [professorSource, studentSource]) {
      expect(source).toContain('scroller.scrollTop = scroller.scrollHeight')
      expect(source).toContain('olderPaginationSnapshotRef.current = null')
      expect(source).not.toContain('scrollIntoView')
    }
  })
})

function ChatHarness() {
  const [activeId, setActiveId] = useState<number | null>(81)
  const [filter, setFilter] = useState<ProfessorConversationFilter>('all')
  const [q, setQ] = useState('')
  const {
    conversations,
    conversationsError,
    conversationsLoading,
    messages,
    messagesError,
    messagesLoading,
    mutateMessages,
  } = useProfessorChatData({ q, filter }, activeId)

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `active: ${activeId ?? 'none'}`),
    React.createElement('p', null, `conversations: ${conversations.map((conversation) => conversation.student.full_name).join(', ') || 'none'}`),
    React.createElement('p', null, `conversations loading: ${conversationsLoading ? 'yes' : 'no'}`),
    React.createElement('p', null, `conversations error: ${conversationsError ? 'yes' : 'no'}`),
    React.createElement('p', null, `messages: ${messages.map((message) => message.body).join(', ') || 'none'}`),
    React.createElement('p', null, `messages loading: ${messagesLoading ? 'yes' : 'no'}`),
    React.createElement('p', null, `messages error: ${messagesError ? 'yes' : 'no'}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setActiveId(82),
      },
      'Go conversation 82',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setFilter('pinned'),
      },
      'Pinned filter',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setQ('Sara'),
      },
      'Search Sara',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          void mutateMessages().catch(() => undefined)
        },
      },
      'Refresh messages',
    ),
  )
}

function renderChatHarness() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(
      SWRConfig,
      {
        value: {
          ...apiSWRConfig,
          provider: () => new Map(),
          dedupingInterval: 0,
          errorRetryCount: 0,
        },
      },
      React.createElement(ChatHarness),
    ))
  })

  return { container, root }
}

function conversationFixture(id: number, studentName: string): ProfessorConversation {
  return {
    id,
    course_offering_id: 11,
    offering_title: 'Mathematics - 2BAC Sciences Math B',
    subject_title: 'Mathematics',
    niveau: '2BAC',
    filiere: 'Sciences Math B',
    professor: {
      id: 7,
      full_name: 'Kresco Professor',
      avatar_url: '',
      tier: 'professor',
    },
    student: {
      id: 100 + id,
      full_name: studentName,
      avatar_url: '',
      tier: 'vip',
    },
    status: 'active',
    last_message_preview: 'Can you review my final proof step?',
    unread_for_professor: id === 81 ? 1 : 0,
    unread_for_student: 0,
    is_pinned_by_professor: id === 81,
    created_at: '2026-05-27T00:00:00Z',
    updated_at: '2026-05-27T00:00:00Z',
    last_message_at: '2026-05-27T00:00:00Z',
  }
}

function messageFixture(id: number, conversationId: number, body: string): ProfessorMessage {
  return {
    id,
    conversation_id: conversationId,
    sender_user_id: 7,
    sender_role: 'professor',
    body,
    attachment_url: '',
    attachment_mime_type: '',
    attachment_name: '',
    attachment_size: 0,
    status: 'sent',
    created_at: '2026-05-27T00:00:00Z',
  }
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  return button
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 30; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
  }
  throw lastError
}
