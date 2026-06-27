'use client'

import { ClipboardEvent, DragEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronUp, ImageIcon, Loader2, MessageCircle, MoreHorizontal, Pencil, Pin, Search, Send, Trash2, UserRoundCheck, X } from 'lucide-react'
import { showToastError } from '@/lib/lazyToast'
import { useSWRConfig } from 'swr'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { professorInboxChannelName, subscribeKrescoRealtime } from '@/lib/realtime'
import { apiDataErrorMessage } from '@/lib/apiData'
import { canEditChatMessage, parseChatTimestamp, shouldShowChatTimestamp } from '@/lib/chatTime'
import { hasSuccessfulSWRCacheData } from '@/lib/swrCache'
import {
  CHAT_INITIAL_VISIBLE_MESSAGE_COUNT,
  CHAT_OLDER_MESSAGE_BATCH_SIZE,
  getVisibleChatMessageWindow,
  nextVisibleChatMessageCount,
} from '@/lib/chatVirtualization'
import {
  parseProfessorChatUrlState,
  professorMessagesSWRKey,
  professorChatUrlStateToSearchParams,
  professorChatUrlStatesEqual,
  useProfessorChatData,
  type ProfessorChatUrlState,
  type ProfessorMessagesEnvelope,
} from '@/lib/professorChatData'
import {
  chatMediaUrl,
  deleteProfessorChatMessage,
  listProfessorMessages,
  patchProfessorConversation,
  sendProfessorImageMessage,
  sendProfessorMessage,
  updateProfessorChatMessage,
  type ProfessorConversation,
  type ProfessorMessage,
} from '@/lib/professor'
import { useAuthStore } from '@/lib/store'

const PROFESSOR_QUICK_REPLIES = [
  'I will review this and get back to you with the exact correction.',
  'Please send the step where you got stuck and I will check it.',
  'Good question. Try rewriting the condition first, then send me your next attempt.',
]
const PROFESSOR_MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const professorChatControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const professorChatRowMotionClass = 'transition-[background-color,box-shadow,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none'
const professorChatSpinnerClass = 'animate-spin motion-reduce:animate-none'

type ProfessorChatRenderedMessage = {
  message: ProfessorMessage
  mine: boolean
  showTimestamp: boolean
  showStudentAvatar: boolean
  attachmentUrl: string
}

export default function ProfessorChatPage() {
  const user = useAuthStore((state) => state.user)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { cache: swrCache, mutate: mutateSWRCache } = useSWRConfig()
  const searchKey = searchParams.toString()
  const routeChatState = useMemo(() => parseProfessorChatUrlState(new URLSearchParams(searchKey)), [searchKey])
  const [activeId, setActiveId] = useState<number | null>(routeChatState.conversationId)
  const [query, setQuery] = useState(routeChatState.q)
  const [filter, setFilter] = useState<'all' | 'unread' | 'pinned'>(routeChatState.filter)
  const [threadSearch, setThreadSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState('')
  const [isComposerDragActive, setIsComposerDragActive] = useState(false)
  const [sending, setSending] = useState(false)
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEditId, setSavingEditId] = useState<number | null>(null)
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<number>>(new Set())
  const [retryingMessageIds, setRetryingMessageIds] = useState<Set<number>>(new Set())
  const [markingReadId, setMarkingReadId] = useState<number | null>(null)
  const [visibleMessageCount, setVisibleMessageCount] = useState(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)
  const messagesScrollerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const conversationErrorRef = useRef<unknown>(null)
  const messageErrorRef = useRef<unknown>(null)
  const chatUrlStateRef = useRef(routeChatState)
  const optimisticMessageIdRef = useRef(-1)
  const optimisticImageFilesRef = useRef(new Map<number, File>())
  const optimisticAttachmentUrlsRef = useRef(new Set<string>())
  const [optimisticAttachmentUrls, setOptimisticAttachmentUrls] = useState<Set<string>>(() => new Set())
  const olderPaginationSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const prefetchedConversationIdsRef = useRef(new Set<number>())

  const {
    conversations,
    conversationsError,
    conversationsLoading,
    conversationsRefreshing,
    messages,
    messagesError,
    messagesLoading,
    messagesRefreshing,
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

  const prefetchConversationMessages = useCallback((conversationId?: number | null) => {
    if (!conversationId || conversationId === activeId || prefetchedConversationIdsRef.current.has(conversationId)) return
    const preloadKey = professorMessagesSWRKey(conversationId)
    if (!preloadKey || hasSuccessfulSWRCacheData(preloadKey, swrCache)) return
    prefetchedConversationIdsRef.current.add(conversationId)

    void mutateSWRCache(
      preloadKey,
      async () => {
        const prefetchedMessages = await listProfessorMessages(conversationId)
        return { conversationId, messages: prefetchedMessages }
      },
      { populateCache: true, revalidate: false },
    ).catch(() => {
      prefetchedConversationIdsRef.current.delete(conversationId)
    })
  }, [activeId, mutateSWRCache, swrCache])

  const selectConversation = useCallback((conversation: ProfessorConversation) => {
    prefetchConversationMessages(conversation.id)
    applyChatUrlState({ conversationId: conversation.id })
  }, [applyChatUrlState, prefetchConversationMessages])

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
      showToastError(conversationErrorMessage)
    }
  }, [conversationErrorMessage, conversationsError])

  useEffect(() => {
    if (!messagesError) {
      messageErrorRef.current = null
      return
    }
    if (messageErrorRef.current !== messagesError) {
      messageErrorRef.current = messagesError
      showToastError(messageErrorMessage)
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

  useEffect(() => {
    const optimisticAttachmentUrls = optimisticAttachmentUrlsRef.current
    const optimisticImageFiles = optimisticImageFilesRef.current
    return () => {
      for (const url of optimisticAttachmentUrls) URL.revokeObjectURL(url)
      optimisticAttachmentUrls.clear()
      optimisticImageFiles.clear()
    }
  }, [])

  function addOptimisticAttachmentUrl(url: string) {
    optimisticAttachmentUrlsRef.current.add(url)
    setOptimisticAttachmentUrls(new Set(optimisticAttachmentUrlsRef.current))
  }

  function removeOptimisticAttachmentUrl(url: string) {
    if (!optimisticAttachmentUrlsRef.current.delete(url)) return
    URL.revokeObjectURL(url)
    setOptimisticAttachmentUrls(new Set(optimisticAttachmentUrlsRef.current))
  }

  const active = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? null, [activeId, conversations])
  const messageWindow = useMemo(
    () => getVisibleChatMessageWindow(messages, visibleMessageCount),
    [messages, visibleMessageCount],
  )
  const normalizedThreadSearch = threadSearch.trim().toLowerCase()
  const threadSearchMatches = useMemo(() => (
    normalizedThreadSearch
      ? messages.filter((message) => professorMessageMatchesThreadSearch(message, normalizedThreadSearch))
      : []
  ), [messages, normalizedThreadSearch])
  const messageIndexById = useMemo(() => new Map(messages.map((message, index) => [message.id, index])), [messages])
  const hasThreadSearch = normalizedThreadSearch.length > 0
  const renderedThreadMessages = hasThreadSearch ? threadSearchMatches : messageWindow.messages
  const renderedThreadMessageRows = useMemo<ProfessorChatRenderedMessage[]>(() => (
    renderedThreadMessages.map((message, visibleIndex) => {
      const index = hasThreadSearch ? messageIndexById.get(message.id) ?? visibleIndex : messageWindow.startIndex + visibleIndex
      const mine = isSameUser(message.sender_user_id, user?.id)
      const showTimestamp = shouldShowChatTimestamp(messages, index)
      const rawAttachmentUrl = message.attachment_url || ''
      const attachmentUrl = rawAttachmentUrl && optimisticAttachmentUrls.has(rawAttachmentUrl)
        ? rawAttachmentUrl
        : chatMediaUrl(rawAttachmentUrl)

      return {
        message,
        mine,
        showTimestamp,
        showStudentAvatar: !mine && shouldShowStudentAvatar(messages, index, showTimestamp),
        attachmentUrl,
      }
    })
  ), [hasThreadSearch, messageIndexById, messageWindow.startIndex, messages, optimisticAttachmentUrls, renderedThreadMessages, user?.id])
  const hasConversationFilters = Boolean(query.trim() || filter !== 'all')
  const visibleUnreadCount = conversations.reduce((total, conversation) => total + conversation.unread_for_professor, 0)
  const visiblePinnedCount = conversations.filter((conversation) => conversation.is_pinned_by_professor).length
  const activeLastMessage = active?.last_message_preview?.trim() || 'No messages yet'
  const activeNeedsReply = (active?.unread_for_professor ?? 0) > 0

  useLayoutEffect(() => {
    setVisibleMessageCount(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)
    setThreadSearch('')
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
    const attachmentUrl = image ? URL.createObjectURL(image) : ''
    const optimisticMessage = createOptimisticProfessorMessage({
      id: optimisticMessageIdRef.current,
      conversationId: active.id,
      senderUserId: numericUserId(user?.id),
      body,
      image,
      attachmentUrl,
    })
    optimisticMessageIdRef.current -= 1
    if (image) optimisticImageFilesRef.current.set(optimisticMessage.id, image)
    if (attachmentUrl) addOptimisticAttachmentUrl(attachmentUrl)

    setSending(true)
    setDraft('')
    clearSelectedImage()
    await mutateMessages(
      (current) => updateMessageEnvelope(current, active.id, (items) => [...items, optimisticMessage]),
      { revalidate: false },
    )
    void mutateConversations((current = []) => (
      updateProfessorConversationPreview(current, active.id, optimisticMessage)
    ), { revalidate: false })

    try {
      const sent = await sendProfessorChatMessage(active.id, body, image)
      cleanupOptimisticMessage(optimisticMessage)
      await mutateMessages(
        (current) => updateMessageEnvelope(current, active.id, (items) => (
          replaceOptimisticMessage(items, optimisticMessage.id, sent)
        )),
        { revalidate: false },
      )
      await mutateConversations()
    } catch (error) {
      await mutateMessages(
        (current) => updateMessageEnvelope(current, active.id, (items) => (
          items.map((item) => (item.id === optimisticMessage.id ? { ...item, status: 'failed' } : item))
        )),
        { revalidate: false },
      )
      await mutateConversations()
      showToastError(apiDataErrorMessage(error, 'Could not send message.'))
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
      showToastError('Could not update conversation.')
    }
  }

  async function markConversationRead(conversation: ProfessorConversation) {
    if (conversation.unread_for_professor <= 0 || markingReadId === conversation.id) return
    setMarkingReadId(conversation.id)
    try {
      const updated = await patchProfessorConversation(conversation.id, { mark_read: true })
      await mutateConversations((current = []) => (
        updateProfessorConversationReadState(current, updated.id)
      ), { revalidate: false })
      await mutateConversations()
    } catch {
      showToastError('Could not mark conversation as read.')
    } finally {
      setMarkingReadId(null)
    }
  }

  function setSelectedImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      showToastError('Upload an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToastError('Image must be 5 MB or smaller.')
      return
    }
    if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview)
    setSelectedImage(file)
    setSelectedImagePreview(URL.createObjectURL(file))
  }

  function imageFileFromFileList(files: FileList | null | undefined) {
    if (!files) return null
    return Array.from(files).find((file) => file.type.startsWith('image/')) ?? null
  }

  function attachComposerTransferImage(file: File | null, emptyMessage: string) {
    if (!file) {
      showToastError(emptyMessage)
      return
    }
    setSelectedImageFile(file)
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = imageFileFromFileList(event.clipboardData.files)
    if (!file) return
    event.preventDefault()
    attachComposerTransferImage(file, 'Paste an image file to attach it.')
  }

  function handleComposerDragEnter(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsComposerDragActive(true)
  }

  function handleComposerDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsComposerDragActive(true)
  }

  function handleComposerDragLeave(event: DragEvent<HTMLFormElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setIsComposerDragActive(false)
  }

  function handleComposerDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsComposerDragActive(false)
    attachComposerTransferImage(imageFileFromFileList(event.dataTransfer.files), 'Drop an image file to attach it.')
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

  function applyQuickReply(reply: string) {
    setDraft((current) => {
      const separator = current.trim() ? '\n\n' : ''
      return `${current}${separator}${reply}`
    })
    window.requestAnimationFrame(() => draftTextareaRef.current?.focus())
  }

  function focusReplyComposer() {
    window.requestAnimationFrame(() => draftTextareaRef.current?.focus())
  }

  function cleanupOptimisticMessage(message: ProfessorMessage) {
    optimisticImageFilesRef.current.delete(message.id)
    if (message.attachment_url) removeOptimisticAttachmentUrl(message.attachment_url)
  }

  async function retryFailedMessage(message: ProfessorMessage) {
    if (!isFailedChatMessage(message) || retryingMessageIds.has(message.id)) return
    const image = optimisticImageFilesRef.current.get(message.id) ?? null
    setRetryingMessageIds((current) => new Set(current).add(message.id))
    await mutateMessages(
      (current) => updateMessageEnvelope(current, message.conversation_id, (items) => (
        items.map((item) => (item.id === message.id ? { ...item, status: 'sending' } : item))
      )),
      { revalidate: false },
    )

    try {
      const sentMessage = await sendProfessorChatMessage(message.conversation_id, message.body, image)
      cleanupOptimisticMessage(message)
      await mutateMessages(
        (current) => updateMessageEnvelope(current, message.conversation_id, (items) => (
          replaceOptimisticMessage(items, message.id, sentMessage)
        )),
        { revalidate: false },
      )
      await mutateConversations()
    } catch (error) {
      await mutateMessages(
        (current) => updateMessageEnvelope(current, message.conversation_id, (items) => (
          items.map((item) => (item.id === message.id ? { ...item, status: 'failed' } : item))
        )),
        { revalidate: false },
      )
      showToastError(apiDataErrorMessage(error, 'Could not send message.'))
    } finally {
      setRetryingMessageIds((current) => {
        const next = new Set(current)
        next.delete(message.id)
        return next
      })
    }
  }

  async function removeFailedMessage(message: ProfessorMessage) {
    cleanupOptimisticMessage(message)
    await mutateMessages(
      (current) => updateMessageEnvelope(current, message.conversation_id, (items) => (
        items.filter((item) => item.id !== message.id)
      )),
      { revalidate: false },
    )
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
      showToastError('Could not edit message.')
    } finally {
      setSavingEditId(null)
    }
  }

  async function removeMessage(message: ProfessorMessage) {
    if (isFailedChatMessage(message)) {
      await removeFailedMessage(message)
      return
    }
    if (isPendingChatMessage(message)) return
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
      showToastError('Could not delete message.')
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

        <section className="grid overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white lg:h-[calc(100vh-210px)] lg:min-h-[620px] lg:grid-cols-[360px_1fr]">
          <aside className="flex max-h-[420px] min-h-0 flex-col border-b border-[#e4e4e7] bg-[#fbfbfc] lg:max-h-none lg:border-b-0 lg:border-r">
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
                    className={`h-10 rounded-[12px] px-3 text-[12px] font-black ${professorChatControlMotionClass} ${filter === item ? 'bg-[#453dee] text-white shadow-[0_8px_18px_rgba(69,61,238,0.18)]' : 'border-[2px] border-[#e4e4e7] bg-white text-[#52525c] hover:border-[#c7c8ff] hover:bg-[#fbfbff]'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center divide-x divide-[#e4e4e7] rounded-[12px] border border-[#e4e4e7] bg-white" aria-label="Inbox triage">
                <InboxMetric label="Visible" value={conversations.length} />
                <InboxMetric label="Unread" value={visibleUnreadCount} tone={visibleUnreadCount > 0 ? 'attention' : 'calm'} />
                <InboxMetric label="Pinned" value={visiblePinnedCount} />
              </div>
              {conversationsRefreshing && conversations.length > 0 && (
                <div
                  key="professor-inbox-refreshing"
                  role="status"
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white px-3 py-1 text-[11px] font-black text-[#a1a1aa]"
                >
                  <Loader2 size={12} className={professorChatSpinnerClass} />
                  Syncing inbox
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {conversationsLoading ? (
                <div className="flex items-center gap-2 p-4 text-[14px] font-bold text-[#71717b]">
                  <Loader2 size={16} className={professorChatSpinnerClass} />
                  Loading inbox...
                </div>
              ) : conversationsError && conversations.length === 0 ? (
                <div className="grid place-items-center gap-3 p-8 text-center">
                  <MessageCircle size={30} className="text-[#71717b]" />
                  <p className="m-0 text-[14px] font-black text-[#3f3f46]">Could not load conversations.</p>
                  <p className="m-0 text-[12px] font-bold text-[#71717b]">{conversationErrorMessage}</p>
                  <button type="button" onClick={() => void mutateConversations()} className={`h-10 rounded-[12px] border-0 bg-[#453dee] px-4 text-[12px] font-black text-white ${professorChatControlMotionClass}`}>
                    Retry
                  </button>
                </div>
              ) : conversations.length === 0 ? (
                <div className="grid place-items-center gap-3 p-8 text-center">
                  <MessageCircle size={30} className="text-[#71717b]" />
                  <p className="m-0 text-[14px] font-black text-[#3f3f46]">{hasConversationFilters ? 'No conversations match this view.' : 'No conversations yet.'}</p>
                  <p className="m-0 text-[12px] font-bold text-[#71717b]">
                    {hasConversationFilters ? 'Clear the filter or search term to return to all conversations.' : 'VIP students must start the private thread first.'}
                  </p>
                  {hasConversationFilters && (
                    <button type="button" onClick={() => applyChatUrlState({ q: '', filter: 'all', conversationId: null })} className={`h-10 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-4 text-[12px] font-black text-[#453dee] hover:border-[#c7c8ff] hover:bg-[#fbfbff] ${professorChatControlMotionClass}`}>
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onMouseEnter={() => prefetchConversationMessages(conversation.id)}
                    onFocus={() => prefetchConversationMessages(conversation.id)}
                    onClick={() => selectConversation(conversation)}
                    aria-pressed={conversation.id === activeId}
                    aria-label={professorConversationButtonLabel(conversation)}
                    className={`grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 border-0 border-b border-[#ececf0] bg-transparent p-4 text-left ${professorChatRowMotionClass} hover:bg-white hover:shadow-[inset_3px_0_#c7c8ff] ${conversation.id === activeId ? 'bg-white shadow-[inset_3px_0_#453dee]' : ''}`}
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

          <section className="flex min-h-[560px] flex-col lg:min-h-0">
            {active ? (
              <>
                <div className="border-b border-[#e4e4e7] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="m-0 truncate text-[18px] font-black text-[#3f3f46]">{active.student.full_name}</h2>
                      <p className="m-0 mt-1 truncate text-[12px] font-bold text-[#71717b]">{active.subject_title} - {active.niveau} {active.filiere}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void togglePin(active)}
                      className={`grid h-10 w-10 place-items-center rounded-[13px] border-[2px] ${professorChatControlMotionClass} ${active.is_pinned_by_professor ? 'border-[#f5900b] bg-[#fff7df] text-[#f5900b] shadow-[0_8px_18px_rgba(245,144,11,0.14)]' : 'border-[#e4e4e7] bg-white text-[#71717b] hover:border-[#f5900b]/50 hover:bg-[#fffaf0]'}`}
                      title="Pin conversation"
                      aria-label={active.is_pinned_by_professor ? 'Unpin conversation' : 'Pin conversation'}
                      aria-pressed={active.is_pinned_by_professor}
                    >
                      <Pin size={17} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${activeNeedsReply ? 'bg-[#fff7df] text-[#f5900b]' : 'bg-[#f0fdf4] text-[#16a34a]'}`}>
                      {activeNeedsReply ? `${active.unread_for_professor} unread` : 'Up to date'}
                    </span>
                    {active.is_pinned_by_professor && (
                      <span className="rounded-full bg-[#f4f4ff] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#453dee]">Pinned</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#71717b]">Latest: {activeLastMessage}</span>
                    <button type="button" onClick={focusReplyComposer} className={`h-10 rounded-[10px] border border-[#e4e4e7] bg-white px-3 text-[11px] font-black text-[#453dee] hover:border-[#453dee] hover:bg-[#fbfbff] ${professorChatControlMotionClass}`}>
                      Reply now
                    </button>
                    {activeNeedsReply && (
                      <button
                        type="button"
                        onClick={() => void markConversationRead(active)}
                        disabled={markingReadId === active.id}
                        className={`inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[#e4e4e7] bg-white px-3 text-[11px] font-black text-[#52525c] hover:border-[#16a34a] hover:bg-[#f0fdf4] hover:text-[#16a34a] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${professorChatControlMotionClass}`}
                      >
                        {markingReadId === active.id ? <Loader2 size={12} className={professorChatSpinnerClass} /> : <Check size={12} aria-hidden="true" />}
                        Mark read
                      </button>
                    )}
                  </div>
                  <section className="mt-3 grid gap-2 border-t border-[#f4f4f5] pt-3 lg:grid-cols-[1fr_280px] lg:items-center" aria-label="Active thread tools">
                    <div className="min-w-0 text-[12px] font-bold text-[#71717b]">
                      <span className="font-black text-[#3f3f46]">{messages.length}</span> loaded messages
                      {hasThreadSearch && <span className="ml-2 font-black text-[#453dee]">{threadSearchMatches.length} match{threadSearchMatches.length === 1 ? '' : 'es'}</span>}
                    </div>
                    <div aria-label="Search active thread">
                      <label className="flex min-h-10 items-center gap-2 rounded-[11px] border border-[#e4e4e7] bg-white px-3 text-[#71717b] transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[#453dee] focus-within:ring-4 focus-within:ring-[#453dee]/10 motion-reduce:transition-none">
                        <Search size={14} className="shrink-0 text-[#9f9fa9]" aria-hidden="true" />
                        <input
                          aria-label="Search messages in this thread"
                          value={threadSearch}
                          onChange={(event) => setThreadSearch(event.target.value)}
                          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] font-bold text-[#3f3f46] outline-none placeholder:text-[#a1a1aa]"
                          placeholder="Search thread"
                        />
                        {hasThreadSearch && (
                          <button
                            type="button"
                            aria-label="Clear thread search"
                            onClick={() => setThreadSearch('')}
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#9f9fa9] hover:bg-[#f4f4f5] hover:text-[#52525c] ${professorChatControlMotionClass}`}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        )}
                      </label>
                    </div>
                  </section>
                </div>
                <div className="relative min-h-[300px] flex-1 bg-[#fbfbfc]">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-[#fbfbfc] via-[#fbfbfc]/80 to-transparent" />
                  <div ref={messagesScrollerRef} className="h-full max-h-[64svh] min-h-[300px] overflow-auto p-4 sm:p-5 lg:max-h-none">
                    <div className="mx-auto grid max-w-[760px] gap-2">
                      {messagesRefreshing && messages.length > 0 && (
                        <div
                          key="professor-messages-refreshing"
                          className="sticky top-0 z-10 flex justify-center py-1"
                        >
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white/95 px-3 py-1 text-[11px] font-black text-[#a1a1aa] shadow-sm">
                            <Loader2 size={12} className={professorChatSpinnerClass} />
                            Syncing
                          </span>
                        </div>
                      )}
                      {messagesLoading && (
                        <div className="rounded-[14px] border-[2px] border-[#e4e4e7] bg-white p-4 text-[14px] font-bold text-[#71717b]">
                          Loading messages...
                        </div>
                      )}
                      {messagesError && messages.length === 0 && !messagesLoading && (
                        <div className="rounded-[14px] border-[2px] border-[#e4e4e7] bg-white p-4">
                          <p className="m-0 text-[14px] font-black text-[#3f3f46]">Could not load messages.</p>
                          <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">{messageErrorMessage}</p>
                          <button type="button" onClick={() => void mutateMessages()} className={`mt-3 h-10 rounded-[12px] border-0 bg-[#453dee] px-4 text-[12px] font-black text-white ${professorChatControlMotionClass}`}>
                            Retry
                          </button>
                        </div>
                      )}
                      {messagesError && messages.length > 0 && (
                        <div role="status" className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-[12px] font-black text-[#9a3412]">
                          Could not refresh messages.
                          <button type="button" onClick={() => void mutateMessages()} className={`ml-2 rounded-[7px] px-1 underline ${professorChatControlMotionClass}`}>
                            Retry
                          </button>
                        </div>
                      )}
                      {!hasThreadSearch && messageWindow.canShowOlder && (
                        <div
                          key="show-older"
                          className="flex justify-center py-1"
                        >
                          <button
                            type="button"
                            onClick={showOlderMessages}
                            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#71717b] hover:border-[#c7c8ff] hover:bg-[#fbfbff] hover:text-[#3f3f46] ${professorChatControlMotionClass}`}
                            aria-label={`Show ${Math.min(CHAT_OLDER_MESSAGE_BATCH_SIZE, messageWindow.hiddenBeforeCount)} older messages`}
                          >
                            <ChevronUp size={14} aria-hidden="true" />
                            Show older
                          </button>
                        </div>
                      )}
                      {hasThreadSearch && threadSearchMatches.length === 0 && !messagesLoading && (
                        <div
                          key="thread-search-empty"
                          className="rounded-[14px] border-[2px] border-[#e4e4e7] bg-white p-4 text-center"
                        >
                          <p className="m-0 text-[14px] font-black text-[#3f3f46]">No messages match this search.</p>
                          <p className="m-0 mt-1 text-[12px] font-bold text-[#71717b]">Clear the thread search to return to the full conversation.</p>
                          <button type="button" onClick={() => setThreadSearch('')} className={`mt-3 h-10 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-4 text-[12px] font-black text-[#453dee] hover:border-[#c7c8ff] hover:bg-[#fbfbff] ${professorChatControlMotionClass}`}>
                            Clear thread search
                          </button>
                        </div>
                      )}
                      {renderedThreadMessageRows.map(({ message, mine, showTimestamp, showStudentAvatar, attachmentUrl }) => {
                        const isEditing = editingMessageId === message.id
                        const isDeleting = deletingMessageIds.has(message.id)
                        const isPending = isPendingChatMessage(message)
                        const isFailed = isFailedChatMessage(message)
                        const isMessageMenuOpen = messageMenuId === message.id
                        const canUseMessageActions = mine && !isEditing && !isPending && !isFailed && savingEditId !== message.id
                        const canEdit = canUseMessageActions && canEditChatMessage(message.created_at)
                        const stateLabel = messageStateLabel(message, savingEditId === message.id)
                        const mineBubbleClass = isFailed
                          ? 'border-[2px] border-[#fecaca] bg-[#fff1f2] text-[#991b1b]'
                          : isPending
                            ? 'bg-[#453dee] text-white opacity-80'
                            : 'bg-[#453dee] text-white'
                        const otherBubbleClass = isFailed
                          ? 'border-[2px] border-[#fecaca] bg-[#fff1f2] text-[#991b1b]'
                          : 'border-[2px] border-[#e4e4e7] bg-white text-[#3f3f46]'
                        return (
                        <div
                          key={message.id}
                          className={`flex [contain-intrinsic-size:0_96px] [content-visibility:auto] ${isDeleting ? 'opacity-0' : ''} ${showTimestamp ? 'mb-3' : 'mb-0'} ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`group flex max-w-[min(88%,560px)] items-start gap-2 sm:max-w-[min(74%,560px)] ${mine ? 'justify-end' : 'justify-start'}`}>
                            {!mine && (showStudentAvatar ? (
                              <ChatAvatar name={active.student.full_name} src={active.student.avatar_url} />
                            ) : (
                              <ChatAvatarSpacer />
                            ))}
                            {mine && isPending && (
                              <span className="mr-2 mt-2 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#e4e4e7] bg-white text-[#a1a1aa] shadow-sm" aria-label="Sending">
                                <Loader2 size={11} className={professorChatSpinnerClass} />
                              </span>
                            )}
                            <div className={`relative min-w-0 rounded-[16px] px-4 py-3 ${hasThreadSearch ? 'ring-2 ring-[#453dee]/20' : ''} ${mine ? mineBubbleClass : otherBubbleClass}`}>
                              {canUseMessageActions && (
                                <div data-chat-message-actions className={`absolute right-[calc(100%+6px)] top-1 z-10 h-10 w-10 transition-[opacity] duration-150 ease-out motion-reduce:transition-none ${isMessageMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                                  {isMessageMenuOpen ? (
                                    <div className="absolute right-0 top-0 z-10 grid min-w-28 gap-1 rounded-[12px] border border-[#e4e4e7] bg-white p-1 text-[#3f3f46] shadow-[0_12px_30px_rgba(24,24,27,0.14)]">
                                      {canEdit && (
                                        <button type="button" onClick={() => startEditingMessage(message)} className={`flex h-10 items-center gap-2 rounded-[9px] border-0 bg-transparent px-2 text-left text-[12px] font-black text-[#52525c] hover:bg-[#f4f4f5] ${professorChatControlMotionClass}`}>
                                          <Pencil size={13} aria-hidden="true" />
                                          Edit
                                        </button>
                                      )}
                                      <button type="button" onClick={() => void removeMessage(message)} className={`flex h-10 items-center gap-2 rounded-[9px] border-0 bg-transparent px-2 text-left text-[12px] font-black text-red-500 hover:bg-red-50 ${professorChatControlMotionClass}`}>
                                        <Trash2 size={13} aria-hidden="true" />
                                        Delete
                                      </button>
                                    </div>
                                  ) : (
                                    <button type="button" onClick={() => setMessageMenuId(message.id)} className={`grid h-10 w-10 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#71717b] shadow-sm hover:border-[#c7c8ff] hover:text-[#3f3f46] ${professorChatControlMotionClass}`} aria-label="Message actions">
                                      <MoreHorizontal size={15} aria-hidden="true" />
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
                                    className={`min-h-20 w-full resize-none rounded-[10px] border px-3 py-2 text-[14px] font-bold leading-[1.35] outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:ring-4 motion-reduce:transition-none ${mine ? 'border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white/50 focus:ring-white/10' : 'border-[#e4e4e7] bg-white text-[#3f3f46] focus:border-[#5b60f9] focus:ring-[#453dee]/10'}`}
                                    autoFocus
                                  />
                                  <span className="flex justify-end gap-1">
                                    <button type="button" onClick={() => setEditingMessageId(null)} className={`grid h-10 w-10 place-items-center rounded-[9px] border-0 ${professorChatControlMotionClass} ${mine ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'bg-[#f4f4f5] text-[#71717b] hover:text-[#3f3f46]'}`} aria-label="Cancel edit">
                                      <X size={14} aria-hidden="true" />
                                    </button>
                                    <button type="submit" disabled={!editDraft.trim() || savingEditId === message.id} className={`grid h-10 w-10 place-items-center rounded-[9px] border-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${professorChatControlMotionClass} ${mine ? 'bg-white text-[#453dee]' : 'bg-[#453dee] text-white'}`} aria-label="Save edit">
                                      {savingEditId === message.id ? <Loader2 size={14} className={professorChatSpinnerClass} /> : <Check size={14} aria-hidden="true" />}
                                    </button>
                                  </span>
                                </form>
                              ) : (
                                <>
                                  {message.body && <p className="m-0 whitespace-pre-wrap break-words text-[14px] font-bold leading-[1.4]">{message.body}</p>}
                                  {attachmentUrl && (
                                    <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className={message.body ? 'mt-3 block overflow-hidden rounded-[12px] border border-black/10 bg-white/10' : 'block overflow-hidden rounded-[12px] border border-black/10 bg-white/10'}>
                                      <Image
                                        src={attachmentUrl}
                                        alt={message.attachment_name || 'Chat image'}
                                        width={520}
                                        height={280}
                                        unoptimized
                                        className="kresco-media-outline max-h-[280px] w-full object-cover"
                                      />
                                    </a>
                                  )}
                                  {showTimestamp && (
                                    <span className={`mt-2 block text-[11px] font-bold ${mine && !isFailed ? 'text-white/70' : 'text-[#71717b]'}`}>{formatTime(message.created_at)}</span>
                                  )}
                                </>
                              )}
                              {stateLabel && (
                                <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 ${isFailed ? 'border-[#fecaca]' : mine ? 'border-white/20' : 'border-[#e4e4e7]'}`}>
                                  <span className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] font-black ${isFailed ? 'text-[#dc2626]' : mine ? 'text-white/75' : 'text-[#a1a1aa]'}`}>
                                    {!isFailed && <Loader2 size={11} className={`${professorChatSpinnerClass} shrink-0`} />}
                                    <span className="truncate">{stateLabel}</span>
                                  </span>
                                  {isFailed && (
                                    <span className="ml-auto flex shrink-0 items-center gap-1">
                                      <button type="button" onClick={() => void retryFailedMessage(message)} disabled={retryingMessageIds.has(message.id)} className={`h-10 rounded-[8px] border border-[#fecaca] bg-white px-2 text-[11px] font-black text-[#dc2626] hover:bg-[#fff1f2] disabled:opacity-60 disabled:active:scale-100 ${professorChatControlMotionClass}`}>
                                        {retryingMessageIds.has(message.id) ? 'Retrying' : 'Retry'}
                                      </button>
                                      <button type="button" onClick={() => void removeFailedMessage(message)} className={`h-10 rounded-[8px] border-0 bg-transparent px-2 text-[11px] font-black text-[#71717b] hover:bg-white ${professorChatControlMotionClass}`}>
                                        Remove
                                      </button>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        )
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                </div>
                <form
                  onSubmit={submit}
                  onDragEnter={handleComposerDragEnter}
                  onDragOver={handleComposerDragOver}
                  onDragLeave={handleComposerDragLeave}
                  onDrop={handleComposerDrop}
                  aria-label="Professor reply composer"
                  className={`sticky bottom-0 z-20 border-t border-[#e4e4e7] p-4 transition-[background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none lg:static ${
                    isComposerDragActive ? 'bg-[#f7f7ff] shadow-[0_-12px_30px_rgba(69,61,238,0.1)]' : 'bg-white'
                  }`}
                >
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Professor quick replies">
                    {PROFESSOR_QUICK_REPLIES.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        onClick={() => applyQuickReply(reply)}
                        className={`shrink-0 rounded-full border border-[#e4e4e7] bg-[#fbfbfc] px-3 py-1.5 text-[12px] font-black text-[#52525c] hover:border-[#5b60f9] hover:bg-[#fbfbff] hover:text-[#453dee] ${professorChatControlMotionClass}`}
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                  {isComposerDragActive && (
                    <div className="mb-3 rounded-[14px] border-[2px] border-dashed border-[#c7c8ff] bg-[#f0f0ff] px-3 py-2 text-[12px] font-black text-[#453dee]" aria-live="polite">
                      Drop image to attach
                    </div>
                  )}
                  {selectedImagePreview && (
                    <div className="mb-3 flex items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-[#fbfbfc] p-2">
                      <Image src={selectedImagePreview} alt="" width={64} height={64} unoptimized className="kresco-media-outline h-16 w-16 rounded-[10px] object-cover" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#52525c]">{selectedImage?.name}</span>
                      <button type="button" onClick={clearSelectedImage} className={`grid h-10 w-10 place-items-center rounded-[11px] border-0 bg-white text-[#71717b] hover:bg-[#f4f4f5] hover:text-[#3f3f46] ${professorChatControlMotionClass}`} aria-label="Remove image">
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-[48px_1fr_48px] items-end gap-3">
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
                    <button type="button" onClick={() => imageInputRef.current?.click()} className={`grid h-12 w-12 place-items-center rounded-[14px] border-[2px] border-[#e4e4e7] bg-white text-[#71717b] hover:border-[#c7c8ff] hover:bg-[#f8f9fc] hover:text-[#453dee] ${professorChatControlMotionClass}`} aria-label="Add image">
                      <ImageIcon size={18} aria-hidden="true" />
                    </button>
                    <textarea
                      ref={draftTextareaRef}
                      aria-label={selectedImage ? 'Reply caption' : 'Reply to this student'}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onPaste={handleComposerPaste}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          event.currentTarget.form?.requestSubmit()
                        }
                      }}
                      className="min-h-12 min-w-0 resize-none rounded-[14px] border-[2px] border-[#e4e4e7] px-4 py-3 text-[14px] font-bold leading-[1.35] text-[#3f3f46] outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-[#5b60f9] focus:ring-4 focus:ring-[#453dee]/10 motion-reduce:transition-none"
                      placeholder={selectedImage ? 'Add a caption' : 'Reply to this student'}
                    />
                    <button type="submit" aria-label="Send reply" disabled={sending || (!draft.trim() && !selectedImage)} className={`grid h-12 w-12 place-items-center rounded-[14px] border-0 bg-[#453dee] text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${professorChatControlMotionClass}`}>
                      {sending ? <Loader2 size={18} className={professorChatSpinnerClass} /> : <Send size={18} aria-hidden="true" />}
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

function InboxMetric({ label, value, tone = 'calm' }: { label: string; value: number; tone?: 'calm' | 'attention' }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-2">
      <span className={`block text-[15px] font-black leading-none tabular-nums ${tone === 'attention' ? 'text-[#f5900b]' : 'text-[#3f3f46]'}`}>{value}</span>
      <span className="mt-1 block truncate text-[10px] font-black uppercase tracking-[0.08em] text-[#71717b]">{label}</span>
    </div>
  )
}

function ChatAvatar({ name, src }: { name: string; src?: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const shouldShowImage = Boolean(src) && failedSrc !== src

  return (
    <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[#f0f0ff] text-[12px] font-black text-[#453dee]">
      {shouldShowImage ? (
        <Image
          src={src || ''}
          alt=""
          width={36}
          height={36}
          unoptimized
          className="kresco-media-outline h-full w-full object-cover"
          onError={() => setFailedSrc(src || null)}
        />
      ) : initials(name)}
    </span>
  )
}

function ChatAvatarSpacer() {
  return <span aria-hidden="true" className="mt-1 h-9 w-9 shrink-0" />
}

function createOptimisticProfessorMessage({
  id,
  conversationId,
  senderUserId,
  body,
  image,
  attachmentUrl,
}: {
  id: number
  conversationId: number
  senderUserId: number
  body: string
  image: File | null
  attachmentUrl: string
}): ProfessorMessage {
  return {
    id,
    conversation_id: conversationId,
    sender_user_id: senderUserId,
    sender_role: 'professor',
    body,
    attachment_url: attachmentUrl,
    attachment_mime_type: image?.type ?? '',
    attachment_name: image?.name ?? '',
    attachment_size: image?.size ?? 0,
    status: 'sending',
    created_at: new Date().toISOString(),
  }
}

function numericUserId(userId: string | number | undefined | null) {
  const parsed = Number(userId)
  return Number.isFinite(parsed) ? parsed : 0
}

function sendProfessorChatMessage(conversationId: number, body: string, image: File | null) {
  return image
    ? sendProfessorImageMessage(conversationId, image, body)
    : sendProfessorMessage(conversationId, body)
}

function replaceOptimisticMessage(items: ProfessorMessage[], optimisticId: number, replacement: ProfessorMessage) {
  let replaced = false
  const next: ProfessorMessage[] = []

  for (const item of items) {
    if (item.id === optimisticId) {
      replaced = true
      if (!next.some((existing) => existing.id === replacement.id)) next.push(replacement)
      continue
    }

    if (item.id === replacement.id) {
      if (!next.some((existing) => existing.id === replacement.id)) next.push(item)
      continue
    }

    next.push(item)
  }

  if (!replaced && !next.some((item) => item.id === replacement.id)) next.push(replacement)
  return next
}

function updateProfessorConversationPreview(
  conversations: ProfessorConversation[],
  conversationId: number,
  message: ProfessorMessage,
) {
  const preview = message.body || (message.attachment_url ? 'Image' : '')
  const lastMessageAt = message.created_at

  return conversations.map((conversation) => (
    conversation.id === conversationId
      ? {
          ...conversation,
          last_message_preview: preview,
          unread_for_professor: 0,
          updated_at: lastMessageAt,
          last_message_at: lastMessageAt,
        }
      : conversation
  ))
}

function updateProfessorConversationReadState(
  conversations: ProfessorConversation[],
  conversationId: number,
) {
  return conversations.map((conversation) => (
    conversation.id === conversationId
      ? { ...conversation, unread_for_professor: 0 }
      : conversation
  ))
}

function professorConversationButtonLabel(conversation: ProfessorConversation) {
  const unread = conversation.unread_for_professor > 0 ? `${conversation.unread_for_professor} unread. ` : ''
  const pinned = conversation.is_pinned_by_professor ? 'Pinned. ' : ''
  const preview = conversation.last_message_preview?.trim() || conversation.offering_title || 'No messages yet'
  return `${conversation.student.full_name}. ${conversation.subject_title}. ${pinned}${unread}${preview}`
}

function isPendingChatMessage(message: ProfessorMessage) {
  return message.status === 'sending'
}

function isFailedChatMessage(message: ProfessorMessage) {
  return message.status === 'failed'
}

function messageStateLabel(message: ProfessorMessage, isSavingEdit: boolean) {
  if (isFailedChatMessage(message)) return "Couldn't send"
  if (isSavingEdit) return 'Saving'
  if (isPendingChatMessage(message)) return 'Sending'
  return ''
}

function professorMessageMatchesThreadSearch(message: ProfessorMessage, query: string) {
  const searchable = [
    message.body,
    message.attachment_name,
    message.attachment_mime_type,
    message.sender_role,
    message.status,
    message.created_at,
    formatTime(message.created_at),
  ].filter(Boolean).join(' ').toLowerCase()

  return searchable.includes(query)
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
}

function shouldShowStudentAvatar(messages: ProfessorMessage[], index: number, showTimestamp = shouldShowChatTimestamp(messages, index)) {
  const current = messages[index]
  const next = messages[index + 1]
  return !next || !isSameUser(next.sender_user_id, current.sender_user_id) || showTimestamp
}

function formatTime(value: string) {
  const date = parseChatTimestamp(value)
  if (!date) return ''
  return PROFESSOR_MESSAGE_TIME_FORMATTER.format(date)
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
