'use client'

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronUp, ImageIcon, Loader2, MessageCircle, MoreHorizontal, Pencil, Pin, Search, Send, Star, Trash2, UserRoundCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { professorInboxChannelName, subscribeKrescoRealtime } from '@/lib/realtime'
import { apiDataErrorMessage } from '@/lib/apiData'
import { canEditChatMessage, parseChatTimestamp, shouldShowChatTimestamp } from '@/lib/chatTime'
import {
  CHAT_INITIAL_VISIBLE_MESSAGE_COUNT,
  CHAT_OLDER_MESSAGE_BATCH_SIZE,
  getVisibleChatMessageWindow,
  nextVisibleChatMessageCount,
} from '@/lib/chatVirtualization'
import {
  parseProfessorChatUrlState,
  professorChatUrlStateToSearchParams,
  professorChatUrlStatesEqual,
  useProfessorChatData,
  type ProfessorChatUrlState,
  type ProfessorMessagesEnvelope,
} from '@/lib/professorChatData'
import {
  chatMediaUrl,
  deleteProfessorChatMessage,
  patchProfessorConversation,
  sendProfessorImageMessage,
  sendProfessorMessage,
  updateProfessorChatMessage,
  type ProfessorConversation,
  type ProfessorMessage,
} from '@/lib/professor'
import { useAuthStore } from '@/lib/store'

export default function ProfessorChatPage() {
  const user = useAuthStore((state) => state.user)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeChatState = useMemo(() => parseProfessorChatUrlState(new URLSearchParams(searchKey)), [searchKey])
  const [activeId, setActiveId] = useState<number | null>(routeChatState.conversationId)
  const [query, setQuery] = useState(routeChatState.q)
  const [filter, setFilter] = useState<'all' | 'unread' | 'pinned'>(routeChatState.filter)
  const [draft, setDraft] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState('')
  const [sending, setSending] = useState(false)
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEditId, setSavingEditId] = useState<number | null>(null)
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<number>>(new Set())
  const [visibleMessageCount, setVisibleMessageCount] = useState(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)
  const messagesScrollerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const conversationErrorRef = useRef<unknown>(null)
  const messageErrorRef = useRef<unknown>(null)
  const chatUrlStateRef = useRef(routeChatState)
  const olderPaginationSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  const {
    conversations,
    conversationsError,
    conversationsLoading,
    messages,
    messagesError,
    messagesLoading,
    mutateConversations,
    mutateMessages,
  } = useProfessorChatData({ q: query, filter }, activeId)

  const conversationErrorMessage = useMemo(
    () => conversationsError ? apiDataErrorMessage(conversationsError, 'Could not load conversations.') : '',
    [conversationsError],
  )
  const messageErrorMessage = useMemo(
    () => messagesError ? apiDataErrorMessage(messagesError, 'Could not load messages.') : '',
    [messagesError],
  )

  const replaceChatUrlState = useCallback((nextState: ProfessorChatUrlState) => {
    const params = professorChatUrlStateToSearchParams(nextState, new URLSearchParams(searchKey))
    const queryString = params.toString()
    const nextUrl = queryString ? `${pathname}?${queryString}` : pathname
    const currentUrl = searchKey ? `${pathname}?${searchKey}` : pathname
    if (nextUrl !== currentUrl) router.replace(nextUrl, { scroll: false })
  }, [pathname, router, searchKey])

  const applyChatUrlState = useCallback((patch: Partial<ProfessorChatUrlState>) => {
    const nextState = { ...chatUrlStateRef.current, ...patch }
    chatUrlStateRef.current = nextState
    setActiveId((current) => (current === nextState.conversationId ? current : nextState.conversationId))
    setQuery((current) => (current === nextState.q ? current : nextState.q))
    setFilter((current) => (current === nextState.filter ? current : nextState.filter))
    replaceChatUrlState(nextState)
  }, [replaceChatUrlState])

  const refreshChat = useCallback(async () => {
    const refreshes: Promise<unknown>[] = [mutateConversations()]
    if (activeId) refreshes.push(mutateMessages())
    await Promise.allSettled(refreshes)
  }, [activeId, mutateConversations, mutateMessages])

  useEffect(() => {
    if (professorChatUrlStatesEqual(chatUrlStateRef.current, routeChatState)) return
    chatUrlStateRef.current = routeChatState
    setActiveId((current) => (current === routeChatState.conversationId ? current : routeChatState.conversationId))
    setQuery((current) => (current === routeChatState.q ? current : routeChatState.q))
    setFilter((current) => (current === routeChatState.filter ? current : routeChatState.filter))
  }, [routeChatState])

  useEffect(() => {
    if (conversationsLoading || (conversationsError && conversations.length === 0)) return
    const nextActiveId = conversations.length === 0
      ? null
      : activeId && conversations.some((conversation) => conversation.id === activeId)
        ? activeId
        : conversations[0]?.id ?? null
    if (nextActiveId !== activeId || chatUrlStateRef.current.conversationId !== nextActiveId) {
      applyChatUrlState({ conversationId: nextActiveId })
    }
  }, [activeId, applyChatUrlState, conversations, conversationsError, conversationsLoading])

  useEffect(() => {
    if (!conversationsError) {
      conversationErrorRef.current = null
      return
    }
    if (conversationErrorRef.current !== conversationsError) {
      conversationErrorRef.current = conversationsError
      toast.error(conversationErrorMessage)
    }
  }, [conversationErrorMessage, conversationsError])

  useEffect(() => {
    if (!messagesError) {
      messageErrorRef.current = null
      return
    }
    if (messageErrorRef.current !== messagesError) {
      messageErrorRef.current = messagesError
      toast.error(messageErrorMessage)
    }
  }, [messageErrorMessage, messagesError])

  useEffect(() => {
    if (messageMenuId === null) return

    function closeMessageMenuOnOutsidePointer(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-chat-message-actions]')) return
      setMessageMenuId(null)
    }

    document.addEventListener('pointerdown', closeMessageMenuOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeMessageMenuOnOutsidePointer)
  }, [messageMenuId])

  useEffect(() => {
    if (!user?.id) return
    const listener = () => {
      void refreshChat()
    }
    return subscribeKrescoRealtime({
      channelName: professorInboxChannelName(user.id),
      onMessage: listener,
      fallback: { intervalMs: 2500, poll: refreshChat },
    })
  }, [refreshChat, user?.id])

  useEffect(() => {
    return () => {
      if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview)
    }
  }, [selectedImagePreview])

  const active = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? null, [activeId, conversations])
  const messageWindow = useMemo(
    () => getVisibleChatMessageWindow(messages, visibleMessageCount),
    [messages, visibleMessageCount],
  )

  useLayoutEffect(() => {
    setVisibleMessageCount(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)
  }, [activeId])

  useLayoutEffect(() => {
    const scroller = messagesScrollerRef.current
    if (!scroller) return

    const snapshot = olderPaginationSnapshotRef.current
    if (!snapshot) {
      scroller.scrollTop = scroller.scrollHeight
      return
    }
    const scrollDelta = scroller.scrollHeight - snapshot.scrollHeight
    scroller.scrollTop = snapshot.scrollTop + scrollDelta
    olderPaginationSnapshotRef.current = null
  }, [activeId, messagesLoading, messageWindow.messages.length])

  const showOlderMessages = useCallback(() => {
    const scroller = messagesScrollerRef.current
    if (scroller) {
      olderPaginationSnapshotRef.current = {
        scrollHeight: scroller.scrollHeight,
        scrollTop: scroller.scrollTop,
      }
    }
    setVisibleMessageCount((current) => nextVisibleChatMessageCount(current, messages.length))
  }, [messages.length])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!active || sending || (!draft.trim() && !selectedImage)) return
    const body = draft.trim()
    const image = selectedImage
    setSending(true)
    setDraft('')
    clearSelectedImage()
    try {
      const sent = image
        ? await sendProfessorImageMessage(active.id, image, body)
        : await sendProfessorMessage(active.id, body)
      await mutateMessages(
        (current) => updateMessageEnvelope(current, active.id, (items) => [...items, sent]),
        { revalidate: false },
      )
      await mutateConversations()
    } catch {
      setDraft(body)
      if (image) setSelectedImageFile(image)
      toast.error('Could not send message.')
    } finally {
      setSending(false)
    }
  }

  async function togglePin(conversation: ProfessorConversation) {
    try {
      const updated = await patchProfessorConversation(conversation.id, {
        is_pinned_by_professor: !conversation.is_pinned_by_professor,
      })
      await mutateConversations((current = []) => (
        current.map((item) => (item.id === updated.id ? updated : item))
      ), { revalidate: false })
      await mutateConversations()
    } catch {
      toast.error('Could not update conversation.')
    }
  }

  function setSelectedImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.')
      return
    }
    if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview)
    setSelectedImage(file)
    setSelectedImagePreview(URL.createObjectURL(file))
  }

  function clearSelectedImage() {
    if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview)
    setSelectedImage(null)
    setSelectedImagePreview('')
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function startEditingMessage(message: ProfessorMessage) {
    setMessageMenuId(null)
    setEditingMessageId(message.id)
    setEditDraft(message.body)
  }

  async function saveMessageEdit(message: ProfessorMessage) {
    const body = editDraft.trim()
    if (!body || savingEditId) return
    setSavingEditId(message.id)
    try {
      const updated = await updateProfessorChatMessage(message.id, body)
      await mutateMessages(
        (current) => updateMessageEnvelope(current, message.conversation_id, (items) => (
          items.map((item) => (item.id === updated.id ? updated : item))
        )),
        { revalidate: false },
      )
      setEditingMessageId(null)
      setEditDraft('')
      await mutateConversations()
    } catch {
      toast.error('Could not edit message.')
    } finally {
      setSavingEditId(null)
    }
  }

  async function removeMessage(message: ProfessorMessage) {
    if (deletingMessageIds.has(message.id)) return
    setMessageMenuId(null)
    setEditingMessageId((current) => (current === message.id ? null : current))
    setDeletingMessageIds((current) => new Set(current).add(message.id))
    await waitForMessageRemoval()
    await mutateMessages(
      (current) => updateMessageEnvelope(current, message.conversation_id, (items) => (
        items.filter((item) => item.id !== message.id)
      )),
      { revalidate: false },
    )
    try {
      await deleteProfessorChatMessage(message.id)
      await mutateConversations()
      setDeletingMessageIds((current) => {
        const next = new Set(current)
        next.delete(message.id)
        return next
      })
    } catch {
      if (activeId) await mutateMessages()
      setDeletingMessageIds((current) => {
        const next = new Set(current)
        next.delete(message.id)
        return next
      })
      toast.error('Could not delete message.')
    }
  }

  return (
    <ProfessorShell>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-8 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <header className="mb-6">
          <p className="m-0 text-[13px] font-black uppercase tracking-[0.12em] text-[#71717b]">VIP student messages</p>
          <h1 className="m-0 mt-2 text-[30px] font-black leading-[1.05] text-[#3f3f46]">Professor Chat</h1>
          <p className="m-0 mt-2 text-[15px] font-bold text-[#71717b]">Student-initiated private conversations, scoped to the active offering.</p>
        </header>

        <section className="grid h-[calc(100vh-230px)] min-h-[620px] overflow-hidden rounded-[16px] border-[2px] border-[#e4e4e7] bg-white lg:grid-cols-[380px_1fr]">
          <aside className="flex min-h-0 flex-col border-b border-[#e4e4e7] bg-[#fbfbfc] lg:border-b-0 lg:border-r">
            <div className="border-b border-[#e4e4e7] p-4">
              <label className="flex h-11 items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-3">
                <Search size={16} className="text-[#71717b]" />
              <input
                aria-label="Search conversations"
                value={query}
                  onChange={(event) => applyChatUrlState({ q: event.target.value })}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] font-bold text-[#3f3f46] outline-none"
                  placeholder="Search conversations"
                />
              </label>
              <div className="mt-3 flex gap-2">
                {(['all', 'unread', 'pinned'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => applyChatUrlState({ filter: item })}
                    aria-pressed={filter === item}
                    className={`h-9 rounded-[12px] px-3 text-[12px] font-black ${filter === item ? 'bg-[#453dee] text-white' : 'border-[2px] border-[#e4e4e7] bg-white text-[#52525c]'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {conversationsLoading ? (
                <div className="p-4 text-[14px] font-bold text-[#71717b]">Loading inbox...</div>
              ) : conversationsError && conversations.length === 0 ? (
                <div className="grid place-items-center gap-3 p-8 text-center">
                  <MessageCircle size={30} className="text-[#71717b]" />
                  <p className="m-0 text-[14px] font-black text-[#3f3f46]">Could not load conversations.</p>
                  <p className="m-0 text-[12px] font-bold text-[#71717b]">{conversationErrorMessage}</p>
                  <button type="button" onClick={() => void mutateConversations()} className="h-9 rounded-[12px] border-0 bg-[#453dee] px-4 text-[12px] font-black text-white">
                    Retry
                  </button>
                </div>
              ) : conversations.length === 0 ? (
                <div className="grid place-items-center gap-3 p-8 text-center">
                  <MessageCircle size={30} className="text-[#71717b]" />
                  <p className="m-0 text-[14px] font-bold text-[#71717b]">No conversations yet.</p>
                </div>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => applyChatUrlState({ conversationId: conversation.id })}
                    aria-pressed={conversation.id === activeId}
                    className={`grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 border-0 border-b border-[#ececf0] bg-transparent p-4 text-left transition hover:bg-white ${conversation.id === activeId ? 'bg-white' : ''}`}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#f0f0ff] text-[14px] font-black text-[#453dee]">
                      {initials(conversation.student.full_name)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <strong className="truncate text-[14px] font-black text-[#3f3f46]">{conversation.student.full_name}</strong>
                        {conversation.is_pinned_by_professor && <Pin size={13} className="text-[#f5900b]" />}
                      </span>
                      <span className="mt-1 block truncate text-[12px] font-bold text-[#71717b]">{conversation.last_message_preview || conversation.offering_title}</span>
                    </span>
                    {conversation.unread_for_professor > 0 && (
                      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#f5900b] px-2 text-[11px] font-black text-white">
                        {conversation.unread_for_professor}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            {active ? (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-[#e4e4e7] p-4">
                  <div className="min-w-0">
                    <h2 className="m-0 truncate text-[18px] font-black text-[#3f3f46]">{active.student.full_name}</h2>
                    <p className="m-0 mt-1 truncate text-[12px] font-bold text-[#71717b]">{active.subject_title} - {active.niveau} {active.filiere}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void togglePin(active)}
                    className={`grid h-10 w-10 place-items-center rounded-[13px] border-[2px] ${active.is_pinned_by_professor ? 'border-[#f5900b] bg-[#fff7df] text-[#f5900b]' : 'border-[#e4e4e7] bg-white text-[#71717b]'}`}
                    title="Pin conversation"
                    aria-label={active.is_pinned_by_professor ? 'Unpin conversation' : 'Pin conversation'}
                    aria-pressed={active.is_pinned_by_professor}
                  >
                    <Pin size={17} />
                  </button>
                </div>
                <div ref={messagesScrollerRef} className="min-h-0 flex-1 overflow-auto bg-[#fbfbfc] p-5">
                  <div className="mx-auto grid max-w-[760px] gap-2">
                    <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-[12px] bg-[#fff7df] px-3 py-2 text-[12px] font-black text-[#7c5200]">
                      <Star size={14} />
                      VIP private thread
                    </div>
                    {messagesLoading && (
                      <div className="rounded-[14px] border-[2px] border-[#e4e4e7] bg-white p-4 text-[14px] font-bold text-[#71717b]">
                        Loading messages...
                      </div>
                    )}
                    {messagesError && messages.length === 0 && !messagesLoading && (
                      <div className="rounded-[14px] border-[2px] border-[#e4e4e7] bg-white p-4">
                        <p className="m-0 text-[14px] font-black text-[#3f3f46]">Could not load messages.</p>
                        <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">{messageErrorMessage}</p>
                        <button type="button" onClick={() => void mutateMessages()} className="mt-3 h-9 rounded-[12px] border-0 bg-[#453dee] px-4 text-[12px] font-black text-white">
                          Retry
                        </button>
                      </div>
                    )}
                    {messagesError && messages.length > 0 && (
                      <div role="status" className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-[12px] font-black text-[#9a3412]">
                        Could not refresh messages.
                        <button type="button" onClick={() => void mutateMessages()} className="ml-2 underline">
                          Retry
                        </button>
                      </div>
                    )}
                    {messageWindow.canShowOlder && (
                      <div className="flex justify-center py-1">
                        <button
                          type="button"
                          onClick={showOlderMessages}
                          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#71717b] transition hover:-translate-y-px hover:text-[#3f3f46]"
                          aria-label={`Show ${Math.min(CHAT_OLDER_MESSAGE_BATCH_SIZE, messageWindow.hiddenBeforeCount)} older messages`}
                        >
                          <ChevronUp size={14} />
                          Show older
                        </button>
                      </div>
                    )}
                    {messageWindow.messages.map((message, visibleIndex) => {
                      const index = messageWindow.startIndex + visibleIndex
                      const mine = isSameUser(message.sender_user_id, user?.id)
                      const showTimestamp = shouldShowChatTimestamp(messages, index)
                      const isEditing = editingMessageId === message.id
                      const isDeleting = deletingMessageIds.has(message.id)
                      const isMessageMenuOpen = messageMenuId === message.id
                      const canEdit = mine && canEditChatMessage(message.created_at)
                      return (
                        <div key={message.id} className={`flex transition duration-150 ${showTimestamp ? 'mb-3' : 'mb-0'} ${mine ? 'justify-end' : 'justify-start'} ${isDeleting ? '-translate-y-1 scale-[0.98] opacity-0' : 'translate-y-0 opacity-100'}`}>
                          <div className={`group flex max-w-[72%] items-start ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`relative min-w-0 rounded-[16px] px-4 py-3 ${mine ? 'bg-[#453dee] text-white' : 'border-[2px] border-[#e4e4e7] bg-white text-[#3f3f46]'}`}>
                              {mine && !isEditing && (
                                <div data-chat-message-actions className={`absolute right-[calc(100%+6px)] top-1 z-10 h-8 w-8 transition duration-150 ${isMessageMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                                  {isMessageMenuOpen ? (
                                    <div className="absolute right-0 top-0 z-10 grid min-w-28 gap-1 rounded-[12px] border border-[#e4e4e7] bg-white p-1 text-[#3f3f46] shadow-[0_12px_30px_rgba(24,24,27,0.14)]">
                                      {canEdit && (
                                        <button type="button" onClick={() => startEditingMessage(message)} className="flex h-8 items-center gap-2 rounded-[9px] border-0 bg-transparent px-2 text-left text-[12px] font-black text-[#52525c] hover:bg-[#f4f4f5]">
                                          <Pencil size={13} />
                                          Edit
                                        </button>
                                      )}
                                      <button type="button" onClick={() => void removeMessage(message)} className="flex h-8 items-center gap-2 rounded-[9px] border-0 bg-transparent px-2 text-left text-[12px] font-black text-red-500 hover:bg-red-50">
                                        <Trash2 size={13} />
                                        Delete
                                      </button>
                                    </div>
                                  ) : (
                                    <button type="button" onClick={() => setMessageMenuId(message.id)} className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#71717b] shadow-sm transition hover:-translate-y-px hover:text-[#3f3f46]" aria-label="Message actions">
                                      <MoreHorizontal size={15} />
                                    </button>
                                  )}
                                </div>
                              )}
                              {isEditing ? (
                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault()
                                    void saveMessageEdit(message)
                                  }}
                                  className="grid min-w-[260px] gap-2"
                                >
                                  <textarea
                                    aria-label="Edit message"
                                    value={editDraft}
                                    onChange={(event) => setEditDraft(event.target.value)}
                                    className={`min-h-20 w-full resize-none rounded-[10px] border px-3 py-2 text-[14px] font-bold leading-[1.35] outline-none ${mine ? 'border-white/20 bg-white/10 text-white placeholder:text-white/50' : 'border-[#e4e4e7] bg-white text-[#3f3f46]'}`}
                                    autoFocus
                                  />
                                  <span className="flex justify-end gap-1">
                                    <button type="button" onClick={() => setEditingMessageId(null)} className={`grid h-8 w-8 place-items-center rounded-[9px] border-0 ${mine ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'bg-[#f4f4f5] text-[#71717b] hover:text-[#3f3f46]'}`} aria-label="Cancel edit">
                                      <X size={14} />
                                    </button>
                                    <button type="submit" disabled={!editDraft.trim() || savingEditId === message.id} className={`grid h-8 w-8 place-items-center rounded-[9px] border-0 disabled:cursor-not-allowed disabled:opacity-50 ${mine ? 'bg-white text-[#453dee]' : 'bg-[#453dee] text-white'}`} aria-label="Save edit">
                                      {savingEditId === message.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                    </button>
                                  </span>
                                </form>
                              ) : (
                                <>
                                  {message.body && <p className="m-0 whitespace-pre-wrap text-[14px] font-bold leading-[1.4]">{message.body}</p>}
                                  {message.attachment_url && (
                                    <a href={chatMediaUrl(message.attachment_url)} target="_blank" rel="noreferrer" className={message.body ? 'mt-3 block overflow-hidden rounded-[12px] border border-black/10 bg-white/10' : 'block overflow-hidden rounded-[12px] border border-black/10 bg-white/10'}>
                                      <Image
                                        src={chatMediaUrl(message.attachment_url)}
                                        alt={message.attachment_name || 'Chat image'}
                                        width={520}
                                        height={280}
                                        unoptimized
                                        className="max-h-[280px] w-full object-cover"
                                      />
                                    </a>
                                  )}
                                  {showTimestamp && (
                                    <span className={`mt-2 block text-[11px] font-bold ${mine ? 'text-white/70' : 'text-[#71717b]'}`}>{formatTime(message.created_at)}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                <form onSubmit={submit} className="border-t border-[#e4e4e7] bg-white p-4">
                  {selectedImagePreview && (
                    <div className="mb-3 flex items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-[#fbfbfc] p-2">
                      <Image src={selectedImagePreview} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded-[10px] object-cover" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#52525c]">{selectedImage?.name}</span>
                      <button type="button" onClick={clearSelectedImage} className="grid h-9 w-9 place-items-center rounded-[11px] border-0 bg-white text-[#71717b]" aria-label="Remove image">
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <input
                      aria-label="Image attachment"
                      ref={imageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) setSelectedImageFile(file)
                      }}
                    />
                    <button type="button" onClick={() => imageInputRef.current?.click()} className="grid h-12 w-12 place-items-center rounded-[14px] border-[2px] border-[#e4e4e7] bg-white text-[#71717b]" aria-label="Add image">
                      <ImageIcon size={18} />
                    </button>
                    <input
                      aria-label={selectedImage ? 'Reply caption' : 'Reply to this student'}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      className="h-12 min-w-0 flex-1 rounded-[14px] border-[2px] border-[#e4e4e7] px-4 text-[14px] font-bold text-[#3f3f46] outline-none focus:border-[#5b60f9]"
                      placeholder={selectedImage ? 'Add a caption' : 'Reply to this student'}
                    />
                    <button type="submit" aria-label="Send reply" disabled={sending || (!draft.trim() && !selectedImage)} className="grid h-12 w-12 place-items-center rounded-[14px] border-0 bg-[#453dee] text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <UserRoundCheck size={38} className="mx-auto text-[#71717b]" />
                  <h2 className="m-0 mt-4 text-[20px] font-black text-[#3f3f46]">Select a conversation</h2>
                  <p className="m-0 mt-2 text-[14px] font-bold text-[#71717b]">VIP students must start the private thread first.</p>
                </div>
              </div>
            )}
          </section>
        </section>
      </main>
    </ProfessorShell>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
}

function formatTime(value: string) {
  const date = parseChatTimestamp(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function waitForMessageRemoval() {
  return new Promise((resolve) => setTimeout(resolve, 140))
}

function isSameUser(senderId: number | string, userId: number | string | undefined | null) {
  return userId !== undefined && userId !== null && String(senderId) === String(userId)
}

function updateMessageEnvelope(
  current: ProfessorMessagesEnvelope | undefined,
  conversationId: number,
  update: (messages: ProfessorMessage[]) => ProfessorMessage[],
): ProfessorMessagesEnvelope {
  return {
    conversationId,
    messages: update(current?.conversationId === conversationId ? current.messages : []),
  }
}
