'use client'

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronUp, ImageIcon, Link2, Loader2, LockKeyhole, MessageCircle, MoreHorizontal, Pencil, Send, Trash2, X } from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { subscribeKrescoRealtime, userNotificationsChannelName } from '@/lib/realtime'
import { apiDataErrorMessage } from '@/lib/apiData'
import { canEditChatMessage, parseChatTimestamp, shouldShowChatTimestamp } from '@/lib/chatTime'
import {
  CHAT_INITIAL_VISIBLE_MESSAGE_COUNT,
  CHAT_OLDER_MESSAGE_BATCH_SIZE,
  getVisibleChatMessageWindow,
  nextVisibleChatMessageCount,
} from '@/lib/chatVirtualization'
import {
  chatMediaUrl,
  deleteProfessorChatMessage,
  listStudentProfessorMessages,
  sendStudentProfessorImageMessage,
  sendStudentProfessorMessage,
  startStudentProfessorConversation,
  updateProfessorChatMessage,
  type ProfessorMessage,
  type StudentProfessorChatStatus,
} from '@/lib/professor'
import { useAuthStore } from '@/lib/store'
import {
  parseStudentProfessorChatUrlState,
  studentProfessorMessagesSWRKey,
  studentProfessorChatUrlStateToSearchParams,
  studentProfessorChatUrlStatesEqual,
  updateStudentProfessorMessagesEnvelope,
  useStudentProfessorChatData,
  type StudentProfessorMessagesEnvelope,
  type StudentProfessorChatUrlState,
} from '@/lib/studentProfessorChatData'

const threadSwitchTransition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 } as const
const chatFrameTransition = { duration: 0.16, ease: 'easeOut' } as const
const messageMotionTransition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.72 } as const

export default function StudentProfessorChatPage() {
  const user = useAuthStore((state) => state.user)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mutate: mutateSWRCache } = useSWRConfig()
  const searchKey = searchParams.toString()
  const routeChatState = useMemo(() => parseStudentProfessorChatUrlState(new URLSearchParams(searchKey)), [searchKey])
  const [activeId, setActiveId] = useState<number | null>(routeChatState.conversationId)
  const [draft, setDraft] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState('')
  const [selectedOfferingId, setSelectedOfferingId] = useState<number | null>(routeChatState.offeringId)
  const [startingConversation, setStartingConversation] = useState(false)
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEditId, setSavingEditId] = useState<number | null>(null)
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<number>>(new Set())
  const [retryingMessageIds, setRetryingMessageIds] = useState<Set<number>>(new Set())
  const [visibleMessageCounts, setVisibleMessageCounts] = useState<Record<number, number>>({})
  const [sentMessageStableKeys, setSentMessageStableKeys] = useState<Record<number, number>>({})
  const messagesScrollerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const statusErrorRef = useRef<unknown>(null)
  const messagesErrorRef = useRef<unknown>(null)
  const chatUrlStateRef = useRef(routeChatState)
  const optimisticMessageIdRef = useRef(-1)
  const optimisticImageFilesRef = useRef(new Map<number, File>())
  const optimisticAttachmentUrlsRef = useRef(new Set<string>())
  const olderPaginationSnapshotRef = useRef<{ frameKey: string; scrollHeight: number; scrollTop: number } | null>(null)
  const prefetchedConversationIdsRef = useRef(new Set<number>())
  const {
    status,
    statusError,
    statusLoading,
    messages,
    messagesError,
    messagesLoading,
    messagesRefreshing,
    mutateStatus,
    mutateMessages,
  } = useStudentProfessorChatData(activeId)

  const refreshChat = useCallback(async () => {
    const refreshes: Promise<unknown>[] = [mutateStatus()]
    if (activeId) refreshes.push(mutateMessages())
    await Promise.allSettled(refreshes)
  }, [activeId, mutateMessages, mutateStatus])

  const replaceChatUrlState = useCallback((nextState: StudentProfessorChatUrlState) => {
    const params = studentProfessorChatUrlStateToSearchParams(nextState, new URLSearchParams(searchKey))
    const queryString = params.toString()
    const nextUrl = queryString ? `${pathname}?${queryString}` : pathname
    const currentUrl = searchKey ? `${pathname}?${searchKey}` : pathname
    if (nextUrl !== currentUrl) router.replace(nextUrl, { scroll: false })
  }, [pathname, router, searchKey])

  const applyChatUrlState = useCallback((patch: Partial<StudentProfessorChatUrlState>) => {
    const nextState = { ...chatUrlStateRef.current, ...patch }
    chatUrlStateRef.current = nextState
    setActiveId((current) => (current === nextState.conversationId ? current : nextState.conversationId))
    setSelectedOfferingId((current) => (current === nextState.offeringId ? current : nextState.offeringId))
    replaceChatUrlState(nextState)
  }, [replaceChatUrlState])

  useEffect(() => {
    if (studentProfessorChatUrlStatesEqual(chatUrlStateRef.current, routeChatState)) return
    chatUrlStateRef.current = routeChatState
    setActiveId((current) => (current === routeChatState.conversationId ? current : routeChatState.conversationId))
    setSelectedOfferingId((current) => (current === routeChatState.offeringId ? current : routeChatState.offeringId))
  }, [routeChatState])

  useEffect(() => {
    if (!statusError) {
      statusErrorRef.current = null
      return
    }
    if (statusErrorRef.current !== statusError) {
      statusErrorRef.current = statusError
      toast.error(apiDataErrorMessage(statusError, 'Could not load professor chat.'))
    }
  }, [statusError])

  useEffect(() => {
    if (!messagesError) {
      messagesErrorRef.current = null
      return
    }
    if (messagesErrorRef.current !== messagesError) {
      messagesErrorRef.current = messagesError
      toast.error(apiDataErrorMessage(messagesError, 'Could not load messages.'))
    }
  }, [messagesError])

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

  useEffect(() => {
    if (!user?.id) return
    const listener = () => {
      void refreshChat()
    }
    return subscribeKrescoRealtime({
      channelName: userNotificationsChannelName(user.id),
      onMessage: listener,
      fallback: { intervalMs: 5000, poll: refreshChat },
    })
  }, [refreshChat, user?.id])

  const threadOptions = useMemo(() => status ? teacherThreads(status) : [], [status])
  const active = useMemo(() => status?.conversations.find((conversation) => conversation.id === activeId) ?? null, [activeId, status])
  const activeVisibleMessageCount = activeId
    ? visibleMessageCounts[activeId] ?? CHAT_INITIAL_VISIBLE_MESSAGE_COUNT
    : CHAT_INITIAL_VISIBLE_MESSAGE_COUNT
  const messageWindow = useMemo(
    () => getVisibleChatMessageWindow(messages, activeVisibleMessageCount),
    [messages, activeVisibleMessageCount],
  )
  const selectedThread = useMemo(() => {
    const explicitThread = selectedOfferingId
      ? threadOptions.find((thread) => thread.course_offering_id === selectedOfferingId) ?? null
      : null
    if (explicitThread) return explicitThread
    if (active) {
      return threadOptions.find((thread) => thread.conversation?.id === active.id) ?? null
    }
    return threadOptions.find((thread) => thread.conversation) ?? threadOptions[0] ?? null
  }, [active, selectedOfferingId, threadOptions])
  const chatProfessor = active?.professor ?? selectedThread?.professor ?? null
  const composerOfferingId = active?.course_offering_id ?? selectedThread?.course_offering_id ?? selectedOfferingId
  const pendingConversationId = !active && selectedThread?.conversation?.id ? selectedThread.conversation.id : null
  const chatFrameKey = active
    ? `conversation-${active.id}`
    : selectedThread
      ? `new-conversation-${selectedThread.course_offering_id}`
      : 'new-conversation'

  const prefetchThreadMessages = useCallback((conversationId?: number | null) => {
    if (!conversationId || conversationId === activeId || prefetchedConversationIdsRef.current.has(conversationId)) return
    prefetchedConversationIdsRef.current.add(conversationId)

    void mutateSWRCache(
      studentProfessorMessagesSWRKey(conversationId),
      async (current?: StudentProfessorMessagesEnvelope) => {
        if (current?.conversationId === conversationId && current.messages.length > 0) return current
        const prefetchedMessages = await listStudentProfessorMessages(conversationId)
        return { conversationId, messages: prefetchedMessages }
      },
      { populateCache: true, revalidate: false, rollbackOnError: false },
    ).catch(() => {
      prefetchedConversationIdsRef.current.delete(conversationId)
    })
  }, [activeId, mutateSWRCache])

  useLayoutEffect(() => {
    const scroller = messagesScrollerRef.current
    if (!scroller) return

    const snapshot = olderPaginationSnapshotRef.current
    if (!snapshot || snapshot.frameKey !== chatFrameKey) {
      scroller.scrollTop = scroller.scrollHeight
      olderPaginationSnapshotRef.current = null
      return
    }
    const scrollDelta = scroller.scrollHeight - snapshot.scrollHeight
    scroller.scrollTop = snapshot.scrollTop + scrollDelta
    olderPaginationSnapshotRef.current = null
  }, [chatFrameKey, messagesLoading, messageWindow.messages.length])

  useEffect(() => {
    if (!status || statusLoading) return

    const requestedOfferingThread = chatUrlStateRef.current.offeringId
      ? threadOptions.find((thread) => thread.course_offering_id === chatUrlStateRef.current.offeringId) ?? null
      : null
    const firstConversationId = status.teacher_threads?.find((thread) => thread.conversation)?.conversation?.id ?? status.conversations[0]?.id ?? null
    const activeConversationStillAvailable = activeId !== null && status.conversations.some((conversation) => conversation.id === activeId)
    const nextActiveId = activeConversationStillAvailable
      ? activeId
      : requestedOfferingThread?.conversation?.id ?? (chatUrlStateRef.current.offeringId ? null : firstConversationId)
    const nextActiveConversation = nextActiveId
      ? status.conversations.find((conversation) => conversation.id === nextActiveId) ?? null
      : null
    const selectedOfferingStillAvailable = selectedOfferingId !== null && threadOptions.some((thread) => thread.course_offering_id === selectedOfferingId)
    const nextOfferingId = nextActiveConversation?.course_offering_id
      ?? requestedOfferingThread?.course_offering_id
      ?? (selectedOfferingStillAvailable ? selectedOfferingId : null)
      ?? threadOptions[0]?.course_offering_id
      ?? status.offerings[0]?.id
      ?? null

    if (
      nextActiveId !== activeId
      || nextOfferingId !== selectedOfferingId
      || chatUrlStateRef.current.conversationId !== nextActiveId
      || chatUrlStateRef.current.offeringId !== nextOfferingId
    ) {
      applyChatUrlState({ conversationId: nextActiveId, offeringId: nextOfferingId })
    }
  }, [activeId, applyChatUrlState, selectedOfferingId, status, statusLoading, threadOptions])

  const showOlderMessages = useCallback(() => {
    if (!activeId) return
    const scroller = messagesScrollerRef.current
    if (scroller) {
      olderPaginationSnapshotRef.current = {
        frameKey: chatFrameKey,
        scrollHeight: scroller.scrollHeight,
        scrollTop: scroller.scrollTop,
      }
    }
    setVisibleMessageCounts((current) => ({
      ...current,
      [activeId]: nextVisibleChatMessageCount(
        current[activeId] ?? CHAT_INITIAL_VISIBLE_MESSAGE_COUNT,
        messages.length,
      ),
    }))
  }, [activeId, chatFrameKey, messages.length])

  async function createConversationFromBody(body: string) {
    if (!composerOfferingId || !body || startingConversation || pendingConversationId) return null
    setStartingConversation(true)
    try {
      const conversation = await startStudentProfessorConversation(composerOfferingId, body)
      await mutateStatus((current) => current ? {
        ...current,
        conversations: [conversation, ...current.conversations.filter((item) => item.id !== conversation.id)],
        teacher_threads: teacherThreads(current).map((thread) => (
          thread.course_offering_id === conversation.course_offering_id
            ? {
                ...thread,
                conversation,
                last_message_preview: conversation.last_message_preview,
                last_message_sender_role: 'student',
                unread_count: conversation.unread_for_student,
                last_message_at: conversation.last_message_at,
              }
            : thread
        )),
      } : current, { revalidate: false })
      applyChatUrlState({ conversationId: conversation.id, offeringId: conversation.course_offering_id })
      toast.success('Conversation started.')
      return conversation
    } catch (error) {
      toast.error(apiDataErrorMessage(error, 'Could not start conversation.'))
      return null
    } finally {
      setStartingConversation(false)
    }
  }

  async function startConversationFromComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.trim() || selectedImage || !composerOfferingId || pendingConversationId) return
    const conversation = await createConversationFromBody(draft.trim())
    if (conversation) setDraft('')
  }

  function selectThread(courseOfferingId: number, conversationId?: number | null) {
    prefetchThreadMessages(conversationId)
    olderPaginationSnapshotRef.current = null
    setMessageMenuId(null)
    setEditingMessageId(null)
    if (!conversationId) clearSelectedImage()
    applyChatUrlState({ conversationId: conversationId ?? null, offeringId: courseOfferingId })
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!active || (!draft.trim() && !selectedImage)) return
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
    if (attachmentUrl) optimisticAttachmentUrlsRef.current.add(attachmentUrl)

    setDraft('')
    clearSelectedImage()
    await mutateMessages(
      (current) => updateStudentProfessorMessagesEnvelope(current, active.id, (items) => [...items, optimisticMessage]),
      { revalidate: false },
    )
    void mutateStatus((current) => current
      ? updateStudentStatusWithLocalMessagePreview(current, active.id, active.course_offering_id, optimisticMessage)
      : current, { revalidate: false })

    try {
      const message = await sendStudentProfessorChatMessage(active.id, body, image)
      setSentMessageStableKeys((current) => ({ ...current, [message.id]: optimisticMessage.id }))
      cleanupOptimisticMessage(optimisticMessage)
      await mutateMessages(
        (current) => updateStudentProfessorMessagesEnvelope(current, active.id, (items) => (
          replaceOptimisticMessage(items, optimisticMessage.id, message)
        )),
        { revalidate: false },
      )
      void mutateStatus()
    } catch (error) {
      await mutateMessages(
        (current) => updateStudentProfessorMessagesEnvelope(current, active.id, (items) => (
          items.map((item) => (item.id === optimisticMessage.id ? { ...item, status: 'failed' } : item))
        )),
        { revalidate: false },
      )
      void mutateStatus()
      toast.error(apiDataErrorMessage(error, 'Message could not be sent.'))
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

  function cleanupOptimisticMessage(message: ProfessorMessage) {
    optimisticImageFilesRef.current.delete(message.id)
    if (message.attachment_url && optimisticAttachmentUrlsRef.current.has(message.attachment_url)) {
      URL.revokeObjectURL(message.attachment_url)
      optimisticAttachmentUrlsRef.current.delete(message.attachment_url)
    }
  }

  async function retryFailedMessage(message: ProfessorMessage) {
    if (!isFailedChatMessage(message) || retryingMessageIds.has(message.id)) return
    const image = optimisticImageFilesRef.current.get(message.id) ?? null
    setRetryingMessageIds((current) => new Set(current).add(message.id))
    await mutateMessages(
      (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
        items.map((item) => (item.id === message.id ? { ...item, status: 'sending' } : item))
      )),
      { revalidate: false },
    )

    try {
      const sentMessage = await sendStudentProfessorChatMessage(message.conversation_id, message.body, image)
      setSentMessageStableKeys((current) => ({ ...current, [sentMessage.id]: message.id }))
      cleanupOptimisticMessage(message)
      await mutateMessages(
        (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
          replaceOptimisticMessage(items, message.id, sentMessage)
        )),
        { revalidate: false },
      )
      void mutateStatus()
    } catch (error) {
      await mutateMessages(
        (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
          items.map((item) => (item.id === message.id ? { ...item, status: 'failed' } : item))
        )),
        { revalidate: false },
      )
      toast.error(apiDataErrorMessage(error, 'Message could not be sent.'))
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
      (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
        items.filter((item) => item.id !== message.id)
      )),
      { revalidate: false },
    )
  }

  async function saveMessageEdit(message: ProfessorMessage) {
    const body = editDraft.trim()
    if (!body || savingEditId) return
    const previousBody = message.body
    setSavingEditId(message.id)
    setEditingMessageId(null)
    setEditDraft('')
    await mutateMessages(
      (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
        items.map((item) => (item.id === message.id ? { ...item, body } : item))
      )),
      { revalidate: false },
    )
    try {
      const updated = await updateProfessorChatMessage(message.id, body)
      await mutateMessages(
        (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
          items.map((item) => (item.id === updated.id ? updated : item))
        )),
        { revalidate: false },
      )
      await mutateStatus()
    } catch (error) {
      await mutateMessages(
        (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
          items.map((item) => (item.id === message.id ? { ...item, body: previousBody } : item))
        )),
        { revalidate: false },
      )
      toast.error(apiDataErrorMessage(error, 'Could not edit message.'))
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
    await mutateMessages(
      (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
        items.filter((item) => item.id !== message.id)
      )),
      { revalidate: false },
    )
    try {
      await deleteProfessorChatMessage(message.id)
      await mutateStatus()
      setDeletingMessageIds((current) => {
        const next = new Set(current)
        next.delete(message.id)
        return next
      })
    } catch (error) {
      if (activeId) await mutateMessages()
      setDeletingMessageIds((current) => {
        const next = new Set(current)
        next.delete(message.id)
        return next
      })
      toast.error(apiDataErrorMessage(error, 'Could not delete message.'))
    }
  }

  return (
    <main className="min-h-[calc(100vh-72px)] bg-white px-[var(--figma-shell-gutter)]">
      {statusLoading ? (
        <div className="mx-auto grid min-h-[680px] w-full max-w-[1180px] place-items-center">
          <div className="inline-flex items-center gap-3 rounded-[12px] border border-[#e4e4e7] bg-[#f4f4f5] px-4 py-3 text-[14px] font-bold text-[#71717b]">
            <Loader2 size={18} className="animate-spin" />
            Loading chat...
          </div>
        </div>
      ) : statusError && !status ? (
        <section className="mx-auto mt-10 grid max-w-[720px] place-items-center rounded-[16px] border-[2px] border-[#fee2e2] bg-[#fef2f2] p-10 text-center">
          <MessageCircle size={38} className="text-[#991b1b]" />
          <h2 className="m-0 mt-4 text-[21px] font-black text-[#991b1b]">Could not load professor chat</h2>
          <p className="m-0 mt-2 max-w-[520px] text-[14px] font-bold leading-[1.4] text-[#b91c1c]">{apiDataErrorMessage(statusError, 'Could not load professor chat.')}</p>
          <button type="button" onClick={() => void mutateStatus()} className="mt-4 h-10 rounded-[12px] border-0 bg-[#991b1b] px-4 text-[13px] font-black text-white">
            Retry
          </button>
        </section>
      ) : !status?.eligible ? (
        <section className="mx-auto mt-10 grid max-w-[720px] place-items-center rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-10 text-center">
          <LockKeyhole size={38} className="text-[#71717b]" />
          <h2 className="m-0 mt-4 text-[21px] font-black text-[#3f3f46]">VIP chat is locked</h2>
          <p className="m-0 mt-2 max-w-[520px] text-[14px] font-bold leading-[1.4] text-[#71717b]">{status?.reason || 'VIP or Platinum access is required.'}</p>
        </section>
      ) : (
        <section className="mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-[1180px] items-start justify-center gap-3 py-6 lg:h-[calc(100vh-72px)] lg:min-h-[720px] lg:py-11">
          <section className="flex h-full min-w-0 flex-1 flex-col items-center">
            <AnimatePresence mode="wait" initial={false}>
              {chatProfessor ? (
                <div
                  className="flex h-full w-full flex-col items-center"
                >
                <div className="relative min-h-[460px] w-full flex-1">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={chatFrameKey}
                      className="absolute inset-0 flex min-h-0 w-full flex-col items-center"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={chatFrameTransition}
                    >
                <div className="w-full max-w-[720px] shrink-0">
                  <h1 className="m-0 text-[24px] font-black leading-[1.4] tracking-[0.24px] text-[#3f3f46]">{chatProfessor.full_name}</h1>
                </div>
                {threadOptions.length > 1 && (
                  <div className="mt-4 w-full max-w-[720px] lg:hidden" aria-label="Teacher conversations">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {threadOptions.map((thread) => {
                        const isSelected = thread.conversation?.id === activeId || (!activeId && selectedOfferingId === thread.course_offering_id)
                        const preview = threadPreview(thread)

                        return (
                          <button
                            key={thread.course_offering_id}
                            type="button"
                            onFocus={() => prefetchThreadMessages(thread.conversation?.id)}
                            onClick={() => selectThread(thread.course_offering_id, thread.conversation?.id)}
                            aria-pressed={isSelected}
                            aria-label={teacherThreadButtonLabel(thread)}
                            className={`grid min-w-[220px] max-w-[min(78vw,280px)] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#c7c8ff] ${isSelected ? 'border-[#d9d9e2] bg-[#fafafa]' : 'border-[#e4e4e7] bg-white hover:bg-[#f7f7f8]'}`}
                          >
                            <Avatar name={thread.professor.full_name} src={thread.professor.avatar_url} />
                            <span className="min-w-0">
                              <strong className="block truncate text-[14px] font-black leading-[1.15] tracking-[0.08px] text-[#3f3f46]">{thread.professor.full_name}</strong>
                              <span className="mt-0.5 block truncate text-[12px] font-black leading-[1.15] text-[#71717b]">{thread.subject_title}</span>
                              <span className="mt-1 block truncate text-[12px] font-bold leading-[1.2] text-[#a1a1aa]">{preview || 'No messages yet'}</span>
                            </span>
                            {thread.unread_count > 0 && (
                              <span className="grid h-5 min-w-5 place-items-center self-start rounded-full bg-[#f5900b] px-1.5 text-[10px] font-black text-white">
                                {thread.unread_count > 9 ? '9+' : thread.unread_count}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="relative mt-6 min-h-0 w-full max-w-[720px] flex-1">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-white via-white/80 to-transparent" />
                  <div ref={messagesScrollerRef} className="h-full overflow-y-auto overflow-x-hidden pr-1">
                    <div className="flex min-h-full flex-col justify-end gap-3">
                    <AnimatePresence initial={false}>
                      {messagesRefreshing && messages.length > 0 && (
                        <motion.div
                          key="messages-refreshing"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16 }}
                          className="sticky top-0 z-10 flex justify-center py-1"
                        >
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white/95 px-3 py-1 text-[11px] font-black text-[#a1a1aa] shadow-sm">
                            <Loader2 size={12} className="animate-spin" />
                            Syncing
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {messagesLoading || pendingConversationId ? (
                      <div className="flex justify-center py-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-[#f4f4f5] px-3 py-2 text-[12px] font-bold text-[#71717b]">
                          <Loader2 size={14} className="animate-spin" />
                          {pendingConversationId ? 'Opening chat...' : 'Loading messages...'}
                        </div>
                      </div>
                    ) : messagesError && messages.length === 0 ? (
                      <div className="grid min-h-[390px] place-items-center text-center">
                        <div>
                          <p className="m-0 text-[20px] font-black leading-[1.4] tracking-[0.24px] text-[#991b1b]">Could not load messages</p>
                          <p className="m-0 mt-1 text-[14px] font-bold leading-[1.4] text-[#b91c1c]">{apiDataErrorMessage(messagesError, 'Could not load messages.')}</p>
                          <button type="button" onClick={() => void mutateMessages()} className="mt-4 h-10 rounded-[12px] border-0 bg-[#991b1b] px-4 text-[13px] font-black text-white">
                            Retry
                          </button>
                        </div>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="grid min-h-[390px] place-items-center text-center">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18 }}
                          className="grid justify-items-center gap-4"
                        >
                          <p className="m-0 text-[32px] font-black leading-[1.1] tracking-[0.24px] text-[#3f3f46]">No messages yet</p>
                          <button
                            type="button"
                            onClick={() => draftTextareaRef.current?.focus()}
                            className="inline-flex h-11 items-center gap-2 rounded-[12px] border-0 bg-[#5b60f9] px-4 text-[13px] font-black text-white transition hover:-translate-y-px hover:bg-[#4c50e8]"
                          >
                            <Send size={15} />
                            Ask your first question
                          </button>
                        </motion.div>
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {messageWindow.canShowOlder && (
                          <motion.div
                            key="show-older"
                            layout
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={messageMotionTransition}
                            className="flex justify-center py-1"
                          >
                            <button
                              type="button"
                              onClick={showOlderMessages}
                              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#71717b] transition hover:-translate-y-px hover:text-[#3f3f46]"
                              aria-label={`Show ${Math.min(CHAT_OLDER_MESSAGE_BATCH_SIZE, messageWindow.hiddenBeforeCount)} older messages`}
                            >
                              <ChevronUp size={14} />
                              Show older
                            </button>
                          </motion.div>
                        )}
                        {messageWindow.messages.map((message, visibleIndex) => {
                          const index = messageWindow.startIndex + visibleIndex
                          const mine = isSameUser(message.sender_user_id, user?.id)
                          const showTimestamp = shouldShowChatTimestamp(messages, index)
                          const showAvatar = shouldShowClusterAvatar(messages, index)
                          const isEditing = editingMessageId === message.id
                          const isPending = isPendingChatMessage(message)
                          const isFailed = isFailedChatMessage(message)
                          const isSavingEdit = savingEditId === message.id
                          const isMessageMenuOpen = messageMenuId === message.id
                          const canUseMessageActions = mine && !isEditing && !isPending && !isFailed && !isSavingEdit
                          const canEdit = canUseMessageActions && canEditChatMessage(message.created_at)
                          const bubbleTone = isFailed
                            ? 'border-[#fecaca] bg-[#fff1f2]'
                            : isSavingEdit
                              ? 'border-[#ddd6fe] bg-[#f5f3ff]'
                              : 'border-[#e4e4e7] bg-[#f4f4f5]'
                          const stateLabel = messageStateLabel(message, isSavingEdit)
                          const stableMessageKey = sentMessageStableKeys[message.id] ?? message.id
                          return (
                            <motion.div
                              key={stableMessageKey}
                              layout
                              initial={{ opacity: 0, y: 12, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -8, scale: 0.96 }}
                              transition={messageMotionTransition}
                              className={`flex w-full flex-col ${showTimestamp ? 'mb-5' : 'mb-0'} ${mine ? 'items-end' : 'items-start'}`}
                            >
                              <div className={`group flex w-full items-start gap-3 ${mine ? 'justify-end' : 'justify-start'}`}>
                                {!mine && (showAvatar ? <Avatar name={chatProfessor.full_name} src={chatProfessor.avatar_url} /> : <AvatarSpacer />)}
                                {mine && (
                                  <AnimatePresence initial={false}>
                                    {isPending && (
                                      <motion.span
                                        key="pending-side-indicator"
                                        layout
                                        aria-label="Sending"
                                        initial={{ opacity: 0, scale: 0.84, x: 5 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.84, x: 5 }}
                                        transition={{ duration: 0.16 }}
                                        className="mt-2 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#e4e4e7] bg-white text-[#a1a1aa] shadow-sm"
                                      >
                                        <Loader2 size={11} className="animate-spin" />
                                      </motion.span>
                                    )}
                                  </AnimatePresence>
                                )}
                                <motion.div layout transition={messageMotionTransition} className={`relative max-w-[min(78%,520px)] rounded-b-[12px] border p-3 sm:max-w-[min(72%,520px)] ${bubbleTone} ${mine ? 'rounded-tl-[12px]' : 'rounded-tr-[12px]'}`}>
                                  {canUseMessageActions && (
                                    <div data-chat-message-actions className={`absolute -left-11 top-1 z-10 h-8 w-8 transition duration-150 ${isMessageMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                                      <AnimatePresence mode="wait" initial={false}>
                                        {isMessageMenuOpen ? (
                                          <motion.div
                                            key="message-menu"
                                            initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                            transition={{ duration: 0.14 }}
                                            className="absolute right-0 top-0 z-10 grid min-w-28 gap-1 rounded-[12px] border border-[#e4e4e7] bg-white p-1 text-[#3f3f46] shadow-[0_12px_30px_rgba(24,24,27,0.14)]"
                                          >
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
                                          </motion.div>
                                        ) : (
                                          <motion.button
                                            key="message-actions"
                                            type="button"
                                            whileTap={{ scale: 0.96 }}
                                            onClick={() => setMessageMenuId(message.id)}
                                            className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#71717b] shadow-sm transition hover:-translate-y-px hover:text-[#3f3f46]"
                                            aria-label="Message actions"
                                          >
                                            <MoreHorizontal size={15} />
                                          </motion.button>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  )}
                                  <AnimatePresence mode="wait" initial={false}>
                                    {isEditing ? (
                                      <motion.form
                                        key="edit-message"
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        transition={{ duration: 0.16 }}
                                        onSubmit={(event) => {
                                          event.preventDefault()
                                          void saveMessageEdit(message)
                                        }}
                                        className="grid min-w-[220px] gap-2"
                                      >
                                        <textarea
                                          aria-label="Edit message"
                                          value={editDraft}
                                          onChange={(event) => setEditDraft(event.target.value)}
                                          className="min-h-20 w-full resize-none rounded-[10px] border border-[#e4e4e7] bg-white px-3 py-2 text-[14px] font-bold leading-[1.35] text-[#71717b] outline-none focus:border-[#5b60f9]"
                                          autoFocus
                                        />
                                        <span className="flex justify-end gap-1">
                                          <button type="button" onClick={() => setEditingMessageId(null)} className="grid h-8 w-8 place-items-center rounded-[9px] border-0 bg-white text-[#71717b] hover:text-[#3f3f46]" aria-label="Cancel edit">
                                            <X size={14} />
                                          </button>
                                          <button type="submit" disabled={!editDraft.trim() || savingEditId === message.id} className="grid h-8 w-8 place-items-center rounded-[9px] border-0 bg-[#5b60f9] text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Save edit">
                                            {savingEditId === message.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                          </button>
                                        </span>
                                      </motion.form>
                                    ) : (
                                      <motion.div
                                        key="message-body"
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        transition={{ duration: 0.16 }}
                                      >
                                        {message.body && <p className="m-0 whitespace-pre-wrap break-words text-[14px] font-bold leading-[1.35] text-[#71717b]">{message.body}</p>}
                                        {message.attachment_url && (
                                          <a href={chatMediaUrl(message.attachment_url)} target="_blank" rel="noreferrer" className={message.body ? 'mt-3 block overflow-hidden rounded-[10px] border border-[#e4e4e7]' : 'block overflow-hidden rounded-[10px] border border-[#e4e4e7]'}>
                                            <Image
                                              src={chatMediaUrl(message.attachment_url)}
                                              alt={message.attachment_name || 'Chat image'}
                                              width={520}
                                              height={260}
                                              unoptimized
                                              className="max-h-[260px] w-full object-cover"
                                            />
                                          </a>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                  <AnimatePresence initial={false}>
                                    {stateLabel && (
                                      <motion.div
                                        key="message-state"
                                        initial={{ opacity: 0, height: 0, y: -4 }}
                                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                                        exit={{ opacity: 0, height: 0, y: -4 }}
                                        transition={{ duration: 0.16 }}
                                        className={`mt-2 flex flex-wrap items-center justify-between gap-2 overflow-hidden border-t pt-2 ${isFailed ? 'border-[#fecaca]' : 'border-[#e4e4e7]'}`}
                                      >
                                        <span className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] font-black ${isFailed ? 'text-[#dc2626]' : 'text-[#a1a1aa]'}`}>
                                          {!isFailed && <Loader2 size={11} className="shrink-0 animate-spin" />}
                                          <span className="truncate">{stateLabel}</span>
                                        </span>
                                        {isFailed && (
                                          <span className="ml-auto flex shrink-0 items-center gap-1">
                                            <button type="button" onClick={() => void retryFailedMessage(message)} className="h-7 rounded-[8px] border border-[#fecaca] bg-white px-2 text-[11px] font-black text-[#dc2626] transition hover:-translate-y-px">
                                              Retry
                                            </button>
                                            <button type="button" onClick={() => void removeFailedMessage(message)} className="h-7 rounded-[8px] border-0 bg-transparent px-2 text-[11px] font-black text-[#71717b] transition hover:bg-white">
                                              Remove
                                            </button>
                                          </span>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.div>
                                {mine && (showAvatar ? <Avatar name={user?.full_name || 'Student'} src={user?.avatar_url} /> : <AvatarSpacer />)}
                              </div>
                              {showTimestamp && (
                                <span className={`mt-1 block text-[11px] font-bold text-[#a1a1aa] ${mine ? 'mr-14' : 'ml-14'}`}>{formatMessageTime(message.created_at)}</span>
                              )}
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
                    )}
                    <div ref={messagesEndRef} />
                    </div>
                  </div>
                </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <form
                  onSubmit={active ? send : startConversationFromComposer}
                  className="mt-6 flex w-full max-w-[720px] shrink-0 flex-col gap-3 rounded-[12px] border border-[#e4e4e7] bg-[#f4f4f5] p-3"
                >
                  <AnimatePresence initial={false}>
                    {selectedImagePreview && (
                      <motion.div
                        key="selected-image"
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        className="flex items-center gap-3 rounded-[10px] border border-[#e4e4e7] bg-white p-2"
                      >
                        <Image src={selectedImagePreview} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-[8px] object-cover" />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#71717b]">{selectedImage?.name}</span>
                        <button type="button" onClick={clearSelectedImage} className="grid h-8 w-8 place-items-center rounded-[8px] border-0 bg-[#f4f4f5] text-[#71717b]" aria-label="Remove image">
                          <X size={15} />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <textarea
                    ref={draftTextareaRef}
                    aria-label={selectedImage ? 'Message caption' : 'Message your professor'}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-h-[72px] resize-none border-0 bg-transparent text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#71717b] outline-none placeholder:text-[#a1a1aa]"
                    placeholder={selectedImage ? 'Add a caption' : 'Message your professor'}
                    onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            event.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <div className="flex h-8 items-center justify-between">
                    <div className="flex items-center gap-[10px] text-[#71717b]">
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
                      <button type="button" onClick={() => imageInputRef.current?.click()} className="grid h-8 w-5 place-items-center border-0 bg-transparent p-0 text-[#71717b] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Add image" disabled={!active} title={active ? undefined : 'Images are available after the first message'}>
                        <ImageIcon size={16} />
                      </button>
                      <button type="button" className="grid h-8 w-5 place-items-center border-0 bg-transparent p-0 text-[#71717b] opacity-40" aria-label="Attach file" disabled title="File attachments are not available yet">
                        <Link2 size={16} />
                      </button>
                    </div>
                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.94 }}
                      disabled={active ? (!draft.trim() && !selectedImage) : (!draft.trim() || Boolean(selectedImage) || !composerOfferingId || Boolean(pendingConversationId) || startingConversation)}
                      className="grid h-8 w-8 place-items-center rounded-[7px] border-0 bg-[#5b60f9] text-white disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send message"
                    >
                      {startingConversation && !active ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </motion.button>
                  </div>
                </form>
                </div>
              ) : (
                <motion.div
                  key="no-professor-chat-target"
                  className="grid min-h-[520px] w-full max-w-[720px] flex-1 place-items-center text-center"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={threadSwitchTransition}
                >
                  <div className="grid justify-items-center gap-3">
                    <MessageCircle size={38} className="text-[#71717b]" strokeWidth={2.5} />
                    <h2 className="m-0 text-[24px] font-black leading-[1.2] tracking-[0.18px] text-[#3f3f46]">No professor chat available</h2>
                    <p className="m-0 max-w-[360px] text-[14px] font-bold leading-[1.4] text-[#71717b]">
                      Your assigned teachers will appear here when professor chat is available for your courses.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
          <aside className={`${chatProfessor ? 'hidden w-[351px] shrink-0 pb-[120px] lg:block' : 'hidden'}`}>
            <div className="rounded-[16px] border-2 border-[#e4e4e7] bg-white px-[18px] pb-8 pt-[18px]">
              <div>
                <h2 className="m-0 text-[16px] font-black leading-[1.1] tracking-[0.24px] text-[#3f3f46]">Teachers</h2>
                <p className="m-0 mt-1 text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#71717b]">Contact a teacher</p>
              </div>
              <div className="mt-6 flex flex-col gap-1.5">
                {threadOptions.map((thread) => {
                  const isSelected = thread.conversation?.id === activeId || (!activeId && selectedOfferingId === thread.course_offering_id)
                  const preview = threadPreview(thread)

                  return (
                    <button
                      key={thread.course_offering_id}
                      type="button"
                      onMouseEnter={() => prefetchThreadMessages(thread.conversation?.id)}
                      onFocus={() => prefetchThreadMessages(thread.conversation?.id)}
                      onClick={() => selectThread(thread.course_offering_id, thread.conversation?.id)}
                      aria-pressed={isSelected}
                      className={`grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border px-2.5 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#c7c8ff] ${isSelected ? 'border-[#d9d9e2] bg-[#fafafa]' : 'border-transparent bg-transparent hover:border-[#ececf0] hover:bg-[#f7f7f8]'}`}
                    >
                      <Avatar name={thread.professor.full_name} src={thread.professor.avatar_url} />
                      <span className="min-w-0">
                        <strong className="block truncate text-[15px] font-black leading-[1.12] tracking-[0.12px] text-[#3f3f46]">{thread.professor.full_name}</strong>
                        <span className="mt-0.5 block truncate text-[12px] font-black leading-[1.15] tracking-[0.08px] text-[#71717b]">{thread.subject_title}</span>
                        {preview && <span className="mt-1.5 block truncate text-[12px] font-bold leading-[1.2] text-[#a1a1aa]">{preview}</span>}
                      </span>
                      {thread.unread_count > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center self-start rounded-full bg-[#f5900b] px-1.5 text-[10px] font-black text-white">
                          {thread.unread_count > 9 ? '9+' : thread.unread_count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>
        </section>
      )}
    </main>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const shouldShowImage = Boolean(src) && failedSrc !== src

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[12.727px] bg-[#e4e4e7] text-[13px] font-black text-[#71717b]">
      {shouldShowImage ? (
        <Image
          src={src || ''}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src || null)}
        />
      ) : initials(name)}
    </span>
  )
}

function AvatarSpacer() {
  return <span aria-hidden="true" className="h-10 w-10 shrink-0" />
}

function shouldShowClusterAvatar(messages: ProfessorMessage[], index: number) {
  const current = messages[index]
  const next = messages[index + 1]
  return !next
    || !isSameUser(next.sender_user_id, current.sender_user_id)
    || shouldShowChatTimestamp(messages, index)
}

function formatMessageTime(value: string) {
  const date = parseChatTimestamp(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
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
    sender_role: 'student',
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

function sendStudentProfessorChatMessage(conversationId: number, body: string, image: File | null) {
  return image
    ? sendStudentProfessorImageMessage(conversationId, image, body)
    : sendStudentProfessorMessage(conversationId, body)
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

function updateStudentStatusWithLocalMessagePreview(
  status: StudentProfessorChatStatus,
  conversationId: number,
  courseOfferingId: number,
  message: ProfessorMessage,
): StudentProfessorChatStatus {
  const preview = message.body || (message.attachment_url ? 'Image' : '')
  const lastMessageAt = message.created_at

  return {
    ...status,
    conversations: status.conversations.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            last_message_preview: preview,
            unread_for_student: 0,
            updated_at: lastMessageAt,
            last_message_at: lastMessageAt,
          }
        : conversation
    )),
    teacher_threads: teacherThreads(status).map((thread) => {
      const matchesThread = thread.conversation?.id === conversationId || thread.course_offering_id === courseOfferingId
      if (!matchesThread) return thread

      return {
        ...thread,
        conversation: thread.conversation
          ? {
              ...thread.conversation,
              last_message_preview: preview,
              unread_for_student: 0,
              updated_at: lastMessageAt,
              last_message_at: lastMessageAt,
            }
          : thread.conversation,
        last_message_preview: preview,
        last_message_sender_role: 'student',
        unread_count: 0,
        last_message_at: lastMessageAt,
      }
    }),
  }
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
  return ''
}

function isSameUser(senderId: number | string, userId: number | string | undefined | null) {
  return userId !== undefined && userId !== null && String(senderId) === String(userId)
}

function teacherThreads(status: StudentProfessorChatStatus) {
  if (status.teacher_threads?.length) return status.teacher_threads
  return status.offerings.map((offering) => {
    const conversation = status.conversations.find((item) => item.course_offering_id === offering.id) ?? null
    return {
      course_offering_id: offering.id,
      offering_title: offering.title,
      subject_title: offering.subject_title,
      niveau: offering.track.niveau,
      filiere: offering.track.filiere,
      professor: conversation?.professor ?? {
        id: offering.professor_user_id,
        full_name: 'Professor',
        avatar_url: '',
        tier: 'basic',
      },
      conversation,
      last_message_preview: conversation?.last_message_preview ?? '',
      last_message_sender_role: '',
      unread_count: conversation?.unread_for_student ?? 0,
      last_message_at: conversation?.last_message_at ?? null,
    }
  })
}

function threadPreview(thread: ReturnType<typeof teacherThreads>[number]) {
  if (!thread.conversation || (!thread.last_message_preview && !thread.last_message_sender_role)) return ''
  const sender = thread.last_message_sender_role === 'student' ? 'You' : 'Professor'
  return `${sender}: ${thread.last_message_preview || 'Image'}`
}

function teacherThreadButtonLabel(thread: ReturnType<typeof teacherThreads>[number]) {
  const preview = threadPreview(thread)
  const unread = thread.unread_count > 0 ? `${thread.unread_count > 9 ? '9 plus' : thread.unread_count} unread. ` : ''
  return `${thread.professor.full_name}. ${thread.subject_title}. ${unread}${preview || 'No messages yet'}`
}
