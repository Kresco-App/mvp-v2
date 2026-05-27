'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImageIcon, Loader2, MessageCircle, MoreHorizontal, Pencil, Pin, Search, Send, Star, Trash2, UserRoundCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import ProfessorShell from '@/components/professor/ProfessorShell'
import { professorInboxChannelName, subscribeKrescoRealtime } from '@/lib/ably'
import { canEditChatMessage, parseChatTimestamp, shouldShowChatTimestamp } from '@/lib/chatTime'
import {
  chatMediaUrl,
  deleteProfessorChatMessage,
  listProfessorConversations,
  listProfessorMessages,
  patchProfessorConversation,
  sendProfessorImageMessage,
  sendProfessorMessage,
  updateProfessorChatMessage,
  type ProfessorConversation,
  type ProfessorMessage,
} from '@/lib/professor'
import { useAuthStore } from '@/lib/store'

export default function ProfessorChatPage() {
  const { user } = useAuthStore()
  const [conversations, setConversations] = useState<ProfessorConversation[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ProfessorMessage[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread' | 'pinned'>('all')
  const [draft, setDraft] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEditId, setSavingEditId] = useState<number | null>(null)
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<number>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    document.title = 'Professor Chat - Kresco'
  }, [])

  const refreshConversations = useCallback(async () => {
    const items = await listProfessorConversations({
      q: query || undefined,
      unread: filter === 'unread',
      pinned: filter === 'pinned',
    })
    setConversations(items)
    setActiveId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? null))
    return items
  }, [filter, query])

  const refreshActiveMessages = useCallback(async (conversationId = activeId) => {
    if (!conversationId) return []
    const items = await listProfessorMessages(conversationId)
    setMessages(items)
    return items
  }, [activeId])

  const refreshChat = useCallback(async () => {
    await refreshConversations()
    if (activeId) await refreshActiveMessages(activeId)
  }, [activeId, refreshActiveMessages, refreshConversations])

  useEffect(() => {
    let alive = true
    setLoading(true)
    refreshConversations()
      .catch(() => toast.error('Could not load conversations.'))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [refreshConversations])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    let alive = true
    refreshActiveMessages(activeId)
      .then((items) => {
        if (alive) setMessages(items)
      })
      .catch(() => toast.error('Could not load messages.'))
    return () => {
      alive = false
    }
  }, [activeId, refreshActiveMessages])

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
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [activeId, messages])

  useEffect(() => {
    return () => {
      if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview)
    }
  }, [selectedImagePreview])

  const active = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? null, [activeId, conversations])

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
      setMessages((current) => [...current, sent])
      await refreshConversations()
    } catch {
      setDraft(body)
      if (image) setSelectedImageFile(image)
      toast.error('Could not send message.')
    } finally {
      setSending(false)
    }
  }

  async function togglePin(conversation: ProfessorConversation) {
    const updated = await patchProfessorConversation(conversation.id, {
      is_pinned_by_professor: !conversation.is_pinned_by_professor,
    })
    setConversations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
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
      setMessages((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setEditingMessageId(null)
      setEditDraft('')
      await refreshConversations()
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
    setMessages((current) => current.filter((item) => item.id !== message.id))
    try {
      await deleteProfessorChatMessage(message.id)
      await refreshConversations()
    } catch {
      if (activeId) await refreshActiveMessages(activeId)
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
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] font-bold text-[#3f3f46] outline-none"
                  placeholder="Search conversations"
                />
              </label>
              <div className="mt-3 flex gap-2">
                {(['all', 'unread', 'pinned'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    className={`h-9 rounded-[12px] px-3 text-[12px] font-black ${filter === item ? 'bg-[#453dee] text-white' : 'border-[2px] border-[#e4e4e7] bg-white text-[#52525c]'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="p-4 text-[14px] font-bold text-[#71717b]">Loading inbox...</div>
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
                    onClick={() => setActiveId(conversation.id)}
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
                  >
                    <Pin size={17} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-[#fbfbfc] p-5">
                  <div className="mx-auto grid max-w-[760px] gap-2">
                    <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-[12px] bg-[#fff7df] px-3 py-2 text-[12px] font-black text-[#7c5200]">
                      <Star size={14} />
                      VIP private thread
                    </div>
                    {messages.map((message, index) => {
                      const mine = isSameUser(message.sender_user_id, user?.id)
                      const showTimestamp = shouldShowChatTimestamp(messages, index)
                      const isEditing = editingMessageId === message.id
                      const isDeleting = deletingMessageIds.has(message.id)
                      const canEdit = mine && canEditChatMessage(message.created_at)
                      return (
                        <div key={message.id} className={`flex transition duration-150 ${showTimestamp ? 'mb-3' : 'mb-0'} ${mine ? 'justify-end' : 'justify-start'} ${isDeleting ? '-translate-y-1 scale-[0.98] opacity-0' : 'translate-y-0 opacity-100'}`}>
                          <div className={`group flex max-w-[72%] items-start ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`relative min-w-0 rounded-[16px] px-4 py-3 ${mine ? 'bg-[#453dee] text-white' : 'border-[2px] border-[#e4e4e7] bg-white text-[#3f3f46]'}`}>
                              {mine && !isEditing && (
                                <div className="absolute right-[calc(100%+6px)] top-1 z-10 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
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
                                      <img src={chatMediaUrl(message.attachment_url)} alt={message.attachment_name || 'Chat image'} className="max-h-[280px] w-full object-cover" />
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
                      <img src={selectedImagePreview} alt="" className="h-16 w-16 rounded-[10px] object-cover" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#52525c]">{selectedImage?.name}</span>
                      <button type="button" onClick={clearSelectedImage} className="grid h-9 w-9 place-items-center rounded-[11px] border-0 bg-white text-[#71717b]">
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
                    <button type="button" onClick={() => imageInputRef.current?.click()} className="grid h-12 w-12 place-items-center rounded-[14px] border-[2px] border-[#e4e4e7] bg-white text-[#71717b]">
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
