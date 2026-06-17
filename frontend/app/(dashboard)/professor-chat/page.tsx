'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronUp, ImageIcon, Link2, Loader2, LockKeyhole, MessageCircle, MoreHorizontal, Pencil, Send, Trash2, X } from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
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
  studentProfessorChatUrlStateToSearchParams,
  studentProfessorChatUrlStatesEqual,
  updateStudentProfessorMessagesEnvelope,
  useStudentProfessorChatData,
  type StudentProfessorChatUrlState,
} from '@/lib/studentProfessorChatData'

export default function StudentProfessorChatPage() {
  const user = useAuthStore((state) => state.user)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const routeChatState = useMemo(() => parseStudentProfessorChatUrlState(new URLSearchParams(searchKey)), [searchKey])
  const [activeId, setActiveId] = useState<number | null>(routeChatState.conversationId)
  const [draft, setDraft] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState('')
  const [selectedOfferingId, setSelectedOfferingId] = useState<number | null>(routeChatState.offeringId)
  const [sending, setSending] = useState(false)
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEditId, setSavingEditId] = useState<number | null>(null)
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<number>>(new Set())
  const [visibleMessageCount, setVisibleMessageCount] = useState(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const statusErrorRef = useRef<unknown>(null)
  const messagesErrorRef = useRef<unknown>(null)
  const chatUrlStateRef = useRef(routeChatState)
  const {
    status,
    statusError,
    statusLoading,
    messages,
    messagesError,
    messagesLoading,
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
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, messagesLoading])

  useEffect(() => {
    return () => {
      if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview)
    }
  }, [selectedImagePreview])

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

  const active = useMemo(() => status?.conversations.find((conversation) => conversation.id === activeId) ?? null, [activeId, status])
  const threadOptions = useMemo(() => status ? teacherThreads(status) : [], [status])
  const messageWindow = useMemo(
    () => getVisibleChatMessageWindow(messages, visibleMessageCount),
    [messages, visibleMessageCount],
  )
  const selectedThread = useMemo(() => {
    return threadOptions.find((thread) => thread.course_offering_id === selectedOfferingId) ?? null
  }, [selectedOfferingId, threadOptions])

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

  useEffect(() => {
    setVisibleMessageCount(CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)
  }, [activeId])

  const showOlderMessages = useCallback(() => {
    setVisibleMessageCount((current) => nextVisibleChatMessageCount(current, messages.length))
  }, [messages.length])

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOfferingId || !newMessage.trim()) return
    const conversation = await startStudentProfessorConversation(selectedOfferingId, newMessage.trim())
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
    setNewMessage('')
    toast.success('Conversation started.')
  }

  function selectThread(courseOfferingId: number, conversationId?: number | null) {
    setNewMessage('')
    setMessageMenuId(null)
    setEditingMessageId(null)
    applyChatUrlState({ conversationId: conversationId ?? null, offeringId: courseOfferingId })
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!active || sending || (!draft.trim() && !selectedImage)) return
    const body = draft.trim()
    const image = selectedImage
    setDraft('')
    clearSelectedImage()
    setSending(true)
    try {
      const message = image
        ? await sendStudentProfessorImageMessage(active.id, image, body)
        : await sendStudentProfessorMessage(active.id, body)
      await mutateMessages(
        (current) => updateStudentProfessorMessagesEnvelope(current, active.id, (items) => [...items, message]),
        { revalidate: false },
      )
      void mutateStatus()
    } catch {
      setDraft(body)
      if (image) setSelectedImageFile(image)
      toast.error('Could not send message.')
    } finally {
      setSending(false)
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
        (current) => updateStudentProfessorMessagesEnvelope(current, message.conversation_id, (items) => (
          items.map((item) => (item.id === updated.id ? updated : item))
        )),
        { revalidate: false },
      )
      setEditingMessageId(null)
      setEditDraft('')
      await mutateStatus()
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
        <section className="mx-auto flex h-[calc(100vh-72px)] min-h-[720px] w-full max-w-[1180px] items-start justify-center gap-3 py-11">
          <section className="flex h-full min-w-0 flex-1 flex-col items-center">
            {active ? (
              <>
                <div className="w-full max-w-[720px] shrink-0">
                  <h1 className="m-0 text-[24px] font-black leading-[1.4] tracking-[0.24px] text-[#3f3f46]">{active.professor.full_name}</h1>
                </div>
                <div className="mt-6 w-full max-w-[720px] flex-1 overflow-y-auto overflow-x-hidden scroll-smooth pr-1">
                  <div className="flex min-h-full flex-col justify-end gap-3">
                    {messagesLoading ? (
                      <div className="flex justify-center py-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-[#f4f4f5] px-3 py-2 text-[12px] font-bold text-[#71717b]">
                          <Loader2 size={14} className="animate-spin" />
                          Loading messages...
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
                        <div className="transition duration-200 ease-out hover:-translate-y-0.5">
                          <Image src="/mascot/happy.png" alt="" width={152} height={200} className="mx-auto mb-[-18px] h-[200px] w-[152px] object-cover" />
                          <p className="m-0 text-[24px] font-black leading-[1.4] tracking-[0.24px] text-[#3f3f46]">No message yet</p>
                          <p className="m-0 mt-1 text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#a1a1aa]">Start a conversation</p>
                        </div>
                      </div>
                    ) : (
                      <>
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
                          const showAvatar = shouldShowClusterAvatar(messages, index)
                          const isEditing = editingMessageId === message.id
                          const isDeleting = deletingMessageIds.has(message.id)
                          const canEdit = mine && canEditChatMessage(message.created_at)
                          return (
                            <div key={message.id} className={`flex w-full flex-col transition duration-150 ${showTimestamp ? 'mb-5' : 'mb-0'} ${mine ? 'items-end' : 'items-start'} ${isDeleting ? '-translate-y-1 scale-[0.98] opacity-0' : 'translate-y-0 opacity-100'}`}>
                              <div className={`group flex w-full items-start gap-3 ${mine ? 'justify-end' : 'justify-start'}`}>
                                {!mine && (showAvatar ? <Avatar name={active.professor.full_name} src={active.professor.avatar_url} /> : <AvatarSpacer />)}
                                <div className={`relative max-w-[min(72%,290px)] rounded-b-[12px] border border-[#e4e4e7] bg-[#f4f4f5] p-3 ${mine ? 'rounded-tl-[12px]' : 'rounded-tr-[12px]'}`}>
                                  {mine && !isEditing && (
                                    <div className="absolute -left-11 top-1 z-10 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                      <button type="button" onClick={() => setMessageMenuId((current) => (current === message.id ? null : message.id))} className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#71717b] shadow-sm transition hover:-translate-y-px hover:text-[#3f3f46]" aria-label="Message actions">
                                        <MoreHorizontal size={15} />
                                      </button>
                                      {messageMenuId === message.id && (
                                        <div className="absolute right-0 top-9 z-10 grid min-w-28 gap-1 rounded-[12px] border border-[#e4e4e7] bg-white p-1 text-[#3f3f46] shadow-[0_12px_30px_rgba(24,24,27,0.14)]">
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
                                      )}
                                    </div>
                                  )}
                                  {isEditing ? (
                                    <form
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
                                    </form>
                                  ) : (
                                    <>
                                      {message.body && <p className="m-0 whitespace-pre-wrap break-words text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#71717b]">{message.body}</p>}
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
                                    </>
                                  )}
                                </div>
                                {mine && (showAvatar ? <Avatar name={user?.full_name || 'Student'} src={user?.avatar_url} /> : <AvatarSpacer />)}
                              </div>
                              {showTimestamp && (
                                <span className={`mt-1 block text-[11px] font-bold text-[#a1a1aa] ${mine ? 'mr-14' : 'ml-14'}`}>{formatMessageTime(message.created_at)}</span>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}
                    {sending && (
                      <div className="flex justify-end pr-14 text-[12px] font-bold text-[#a1a1aa]">
                        Sending...
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                <form onSubmit={send} className="mt-6 flex w-full max-w-[720px] shrink-0 flex-col gap-3 rounded-[12px] border border-[#e4e4e7] bg-[#f4f4f5] p-3">
                  {selectedImagePreview && (
                    <div className="flex items-center gap-3 rounded-[10px] border border-[#e4e4e7] bg-white p-2">
                      <Image src={selectedImagePreview} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-[8px] object-cover" />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#71717b]">{selectedImage?.name}</span>
                      <button type="button" onClick={clearSelectedImage} className="grid h-8 w-8 place-items-center rounded-[8px] border-0 bg-[#f4f4f5] text-[#71717b]" aria-label="Remove image">
                        <X size={15} />
                      </button>
                    </div>
                  )}
                  <textarea
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
                      <button type="button" onClick={() => imageInputRef.current?.click()} className="grid h-8 w-5 place-items-center border-0 bg-transparent p-0 text-[#71717b]" aria-label="Add image">
                        <ImageIcon size={16} />
                      </button>
                      <button type="button" className="grid h-8 w-5 place-items-center border-0 bg-transparent p-0 text-[#71717b] opacity-40" aria-label="Attach file" disabled title="File attachments are not available yet">
                        <Link2 size={16} />
                      </button>
                    </div>
                    <button type="submit" disabled={(!draft.trim() && !selectedImage) || sending} className="grid h-8 w-8 place-items-center rounded-[7px] border-0 bg-[#5b60f9] text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send message">
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-0">
                <form onSubmit={startConversation} className="min-h-[700px] w-full max-w-[840px] rounded-[16px] border-[2px] border-[#e4e4e7] bg-white px-[38px] py-[40px]">
                  <MessageCircle size={42} className="text-[#453dee]" strokeWidth={2.5} />
                  <h2 className="m-0 mt-[38px] text-[28px] font-black leading-[1.2] tracking-[0.14px] text-[#3f3f46]">Start a private question</h2>
                  {selectedThread && (
                    <p className="m-0 mt-3 text-[18px] font-black leading-[1.2] tracking-[0.18px] text-[#27272a]">{selectedThread.professor.full_name} - {displayStartSubject(selectedThread.subject_title)}</p>
                  )}
                  <p className="m-0 mt-[24px] text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#71717b]">Professors can only reply after you start the conversation.</p>
                  <select
                    aria-label="Professor conversation"
                    value={selectedOfferingId ?? ''}
                    onChange={(event) => selectThread(Number(event.target.value), null)}
                    className="mt-[38px] h-[68px] w-full rounded-[16px] border-[2px] border-[#e4e4e7] bg-white px-[34px] text-[18px] font-black tracking-[0.18px] text-[#27272a] outline-none transition focus:border-[#5b60f9]"
                  >
                    {threadOptions.map((thread) => (
                      <option value={thread.course_offering_id} key={thread.course_offering_id}>{thread.professor.full_name} - {displayStartSubject(thread.subject_title)}</option>
                    ))}
                  </select>
                  <textarea
                    aria-label="Question"
                    value={newMessage}
                    onChange={(event) => setNewMessage(event.target.value)}
                    className="mt-[24px] min-h-[204px] w-full resize-none rounded-[16px] border-[2px] border-[#e4e4e7] p-[30px] text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#3f3f46] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#5b60f9]"
                    placeholder="Write your question..."
                  />
                  <button type="submit" disabled={!newMessage.trim() || !selectedOfferingId || sending} className="mt-[33px] inline-flex h-[64px] items-center gap-[14px] rounded-[14px] border-0 bg-[#a09cf7] px-[30px] text-[16px] font-black tracking-[0.16px] text-white transition hover:-translate-y-px hover:bg-[#8f8af4] disabled:cursor-not-allowed disabled:opacity-100">
                    <Send size={19} />
                    Start conversation
                  </button>
                </form>
              </div>
            )}
          </section>
          <aside className={`${active ? 'hidden w-[351px] shrink-0 pb-[120px] lg:block' : 'hidden'}`}>
            <div className="rounded-[16px] border-2 border-[#e4e4e7] bg-white px-[18px] pb-8 pt-[18px]">
              <div>
                <h2 className="m-0 text-[16px] font-black leading-[1.1] tracking-[0.24px] text-[#3f3f46]">Teachers</h2>
                <p className="m-0 mt-1 text-[14px] font-bold leading-[1.1] tracking-[0.21px] text-[#71717b]">Contact a teacher</p>
              </div>
              <div className="mt-8 flex flex-col gap-4">
                {threadOptions.map((thread) => (
                  <button
                    key={thread.course_offering_id}
                    type="button"
                    onClick={() => selectThread(thread.course_offering_id, thread.conversation?.id)}
                    aria-pressed={thread.conversation?.id === activeId || (!activeId && selectedOfferingId === thread.course_offering_id)}
                    className={`grid w-full grid-cols-[40px_1fr_auto] gap-4 rounded-[12px] border-0 bg-transparent p-0 text-left transition hover:bg-[#f4f4f5] ${thread.conversation?.id === activeId || (!activeId && selectedOfferingId === thread.course_offering_id) ? 'bg-[#f4f4f5]' : ''}`}
                  >
                    <Avatar name={thread.professor.full_name} src={thread.professor.avatar_url} />
                    <span className="min-w-0">
                      <strong className="block truncate text-[16px] font-black leading-[0.95] tracking-[0.24px] text-[#3f3f46]">{thread.professor.full_name}</strong>
                      <span className="mt-1 block truncate text-[12px] font-bold leading-[1.1] tracking-[0.18px] text-[#71717b]">{thread.subject_title}</span>
                      {threadPreview(thread) && <span className="mt-2 block truncate text-[12px] font-bold leading-[1.2] text-[#a1a1aa]">{threadPreview(thread)}</span>}
                    </span>
                    {thread.unread_count > 0 && (
                      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#f5900b] px-2 text-[11px] font-black text-white">
                        {thread.unread_count > 9 ? '9+' : thread.unread_count}
                      </span>
                    )}
                  </button>
                ))}
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

function waitForMessageRemoval() {
  return new Promise((resolve) => setTimeout(resolve, 140))
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

function displayStartSubject(subject: string) {
  return subject === 'Mathematics' ? 'Math' : subject
}
