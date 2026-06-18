'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Dumbbell,
  Home,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  StickyNote,
  Trash2,
  Trophy,
  User,
  Video,
  X,
  Zap,
} from 'lucide-react'
import KrescoWordmark from '@/components/KrescoWordmark'
import { subscribeKrescoRealtime, userNotificationsChannelName } from '@/lib/realtime'
import { AUTH_ROUTES, canUseStudentProfessorChat } from '@/lib/authPolicy'
import { isActiveNavHref } from '@/lib/navigationPolicy'
import { deleteAllNotifications, deleteNotification, listNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '@/lib/notifications'
import { useAuthStore } from '@/lib/store'
import { useDismissable } from '@/hooks/useClickOutside'

const links = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/courses', label: 'Courses', Icon: BookOpen },
  { href: '/exam-bank', label: 'Exam Bank', Icon: ClipboardList },
  { href: '/exercise-bank', label: 'Exercises', Icon: Dumbbell },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/classement', label: 'Leaderboard', Icon: Trophy },
  { href: '/live', label: 'Live', Icon: Video },
  { href: '/zed', label: 'Zed Mode', Icon: Zap },
]

const professorStudentLinks = [
  ...links,
  { href: AUTH_ROUTES.studentProfessorChat, label: 'Professor Chat', Icon: MessageCircle },
]

const notificationPanelTransition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const
const notificationRowTransition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.72 } as const
const topNavIndicatorTransition = { type: 'spring', stiffness: 520, damping: 44, mass: 0.7 } as const

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [readingIds, setReadingIds] = useState<Set<number>>(new Set())
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
  const [deletingAll, setDeletingAll] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const notificationsRef = useRef<HTMLDivElement | null>(null)
  const navLinks = canUseStudentProfessorChat(user) ? professorStudentLinks : links

  function active(href: string | null) {
    return isActiveNavHref(pathname, href, [AUTH_ROUTES.studentHome])
  }

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, href: string, isActive: boolean) {
    if (
      isActive
      || event.defaultPrevented
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.button !== 0
    ) {
      return
    }

    setPendingHref(href)
    setMenuOpen(false)
    setNotificationsOpen(false)
  }

  async function doLogout() {
    if (await logout()) {
      router.push('/')
    }
  }

  async function showInfoToast(message: string) {
    const { toast } = await import('sonner')
    toast.info(message)
  }

  async function showErrorToast(message: string) {
    const { toast } = await import('sonner')
    toast.error(message)
  }

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await listNotifications()
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
    } catch {
      setNotifications([])
      setUnreadCount(0)
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    void refreshNotifications()
  }, [refreshNotifications, user?.id])

  useEffect(() => {
    if (!user?.id) return
    const refresh = () => void refreshNotifications()
    return subscribeKrescoRealtime({
      channelName: userNotificationsChannelName(user.id),
      onMessage: refresh,
      fallback: { intervalMs: 5000, poll: refreshNotifications },
    })
  }, [refreshNotifications, user?.id])

  useDismissable(notificationsRef, () => setNotificationsOpen(false), {
    enabled: notificationsOpen,
    eventName: 'mousedown',
  })

  async function openNotifications() {
    setNotificationsOpen((value) => !value)
    setMenuOpen(false)
    await refreshNotifications()
  }

  async function readNotification(item: NotificationItem) {
    if (item.is_read || readingIds.has(item.id) || deletingIds.has(item.id) || deletingAll) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    setReadingIds((current) => new Set(current).add(item.id))
    setNotifications((current) => current.map((notification) => (
      notification.id === item.id ? { ...notification, is_read: true } : notification
    )))
    setUnreadCount((current) => Math.max(0, current - 1))

    try {
      const updated = await markNotificationRead(item.id)
      setNotifications((current) => current.map((notification) => (
        notification.id === updated.id ? updated : notification
      )))
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      await showErrorToast('Could not mark notification read.')
    } finally {
      setReadingIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  async function markAllRead() {
    if (unreadCount === 0 || markingAllRead || deletingAll) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    setMarkingAllRead(true)
    setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })))
    setUnreadCount(0)

    try {
      await markAllNotificationsRead()
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      await showErrorToast('Could not mark notifications read.')
    } finally {
      setMarkingAllRead(false)
    }
  }

  async function removeNotification(item: NotificationItem) {
    if (deletingIds.has(item.id) || deletingAll) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    setDeletingIds((current) => new Set(current).add(item.id))
    setNotifications((current) => current.filter((notification) => notification.id !== item.id))
    if (!item.is_read) setUnreadCount((current) => Math.max(0, current - 1))
    try {
      await deleteNotification(item.id)
    } catch (error) {
      if (isNotFoundError(error)) {
        return
      }
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      await showErrorToast('Could not delete notification.')
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  async function removeAllNotifications() {
    if (notifications.length === 0 || deletingAll) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    setDeletingAll(true)
    setDeletingIds(new Set(notifications.map((item) => item.id)))
    setNotifications([])
    setUnreadCount(0)
    try {
      await deleteAllNotifications()
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      await showErrorToast('Could not clear notifications.')
    } finally {
      setDeletingAll(false)
      setDeletingIds(new Set())
    }
  }

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-[#f4f4f5] bg-white/95 shadow-[0_0_7.5px_rgba(24,24,27,0.1)] backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[var(--figma-shell-width)] items-center gap-6 px-[var(--figma-shell-gutter)]">
        <Link href="/home" className="flex h-full w-[82px] shrink-0 items-center no-underline">
          <KrescoWordmark />
        </Link>

        <div className="hidden h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden md:flex">
          <LayoutGroup id="top-nav-tabs">
            {navLinks.map(({ href, label, Icon }) => {
              const isActive = active(href)
              const content = (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="top-nav-active-pill"
                      transition={topNavIndicatorTransition}
                      className="absolute inset-0 rounded-[14px] bg-[#f0f0ff] shadow-[inset_0_0_0_1px_rgba(91,96,249,0.13)]"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon size={16} strokeWidth={2.2} />
                    <span>{label}</span>
                  </span>
                  {isActive && (
                    <motion.span
                      layoutId="top-nav-active-indicator"
                      transition={topNavIndicatorTransition}
                      className="absolute -bottom-3 left-5 right-5 h-0.5 rounded-full bg-[#3a2fd3]"
                    />
                  )}
                </>
              )
              const className = `relative flex h-10 shrink-0 items-center justify-center gap-2 overflow-visible rounded-[14px] px-3.5 text-[13px] font-black no-underline outline-none transition duration-200 focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 ${
                isActive ? 'text-[#3a2fd3]' : 'text-[#52525c] hover:bg-[#f7f7ff] hover:text-[#3a2fd3]'
              }`
              if (!href) {
                return (
                  <button key={label} type="button" onClick={() => void showInfoToast(`${label} coming soon`)} className={`${className} border-0 bg-transparent`}>
                    {content}
                  </button>
                )
              }
              return (
                <Link key={href} href={href} onClick={(event) => handleNavClick(event, href, isActive)} aria-current={isActive ? 'page' : undefined} className={className}>
                  {content}
                </Link>
              )
            })}
          </LayoutGroup>
        </div>

        <div className="flex h-full min-w-0 flex-1 items-center justify-end gap-1 md:flex-none">
          <button
            type="button"
            aria-label="Navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] transition duration-150 hover:-translate-y-px hover:bg-[#f4f4f5] active:scale-95 md:hidden"
          >
            <Menu size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Notes"
            onClick={() => void showInfoToast('Notes are available inside each topic.')}
            className="hidden h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] transition duration-150 hover:-translate-y-px hover:bg-[#f4f4f5] active:scale-95 sm:grid"
          >
            <StickyNote size={18} aria-hidden="true" />
          </button>
          <div ref={notificationsRef} className="relative hidden sm:block">
            <button
              type="button"
              title="Notifications"
              aria-label="Notifications"
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              onClick={() => void openNotifications()}
              className="relative grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] transition duration-150 hover:-translate-y-px hover:bg-[#f4f4f5] active:scale-95"
            >
              <Bell size={18} aria-hidden="true" />
              <AnimatePresence initial={false}>
                {unreadCount > 0 && (
                  <motion.span
                    key="notifications-count"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-[#f5900b] px-1 text-[10px] font-black leading-none text-white"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <AnimatePresence>
              {notificationsOpen && (
                <motion.div
                  role="dialog"
                  aria-label="Notifications"
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={notificationPanelTransition}
                  className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(360px,calc(100vw-2rem))] origin-top-right rounded-[16px] border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_40px_rgba(24,24,27,0.16)]"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#f4f4f5] px-3 py-2">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-black text-[#3f3f46]">Notifications</strong>
                      <motion.span layout className="block text-[11px] font-bold text-[#71717b]">{unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}</motion.span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void markAllRead()}
                        disabled={unreadCount === 0 || markingAllRead || deletingAll}
                        className="inline-flex h-8 items-center gap-1 rounded-[10px] border-0 bg-transparent px-2 text-[12px] font-black text-[#453dee] transition hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:text-[#a1a1aa] disabled:hover:bg-transparent"
                        title="Mark all notifications read"
                      >
                        {markingAllRead ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCheck size={14} aria-hidden="true" />}
                        Read
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAllNotifications()}
                        disabled={notifications.length === 0 || deletingAll}
                        className="grid h-8 w-8 place-items-center rounded-[10px] border-0 bg-transparent text-[#71717b] transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:text-[#d4d4d8] disabled:hover:bg-transparent"
                        title="Delete all notifications"
                        aria-label="Delete all notifications"
                      >
                        {deletingAll ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="grid h-8 w-8 place-items-center rounded-[10px] border-0 bg-transparent text-[#71717b] hover:bg-[#f4f4f5] hover:text-[#3f3f46]"
                        title="Close notifications"
                        aria-label="Close notifications"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto py-1">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {notifications.length === 0 ? (
                        <motion.p
                          key="notifications-empty"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16 }}
                          className="m-0 px-3 py-5 text-sm font-bold text-[#71717b]"
                        >
                          No notifications yet.
                        </motion.p>
                      ) : (
                        notifications.map((item) => {
                          const isReading = readingIds.has(item.id)
                          const isDeleting = deletingIds.has(item.id)
                          return (
                            <motion.div
                              key={item.id}
                              layout
                              initial={{ opacity: 0, y: 8, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -8, scale: 0.98 }}
                              transition={notificationRowTransition}
                              className="group grid grid-cols-[1fr_32px] items-center gap-1 rounded-xl hover:bg-[#f4f4f5] focus-within:bg-[#f4f4f5]"
                            >
                              <button
                                type="button"
                                onClick={() => void readNotification(item)}
                                disabled={isReading || deletingAll}
                                className="grid min-w-0 gap-1 border-0 bg-transparent px-3 py-2 text-left disabled:cursor-default"
                              >
                                <span className="flex items-center justify-between gap-3">
                                  <strong className="min-w-0 truncate text-sm font-black text-[#3f3f46]">{item.title}</strong>
                                  <AnimatePresence initial={false}>
                                    {isReading ? (
                                      <motion.span
                                        key="reading"
                                        initial={{ opacity: 0, scale: 0.7 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.7 }}
                                        transition={{ duration: 0.14 }}
                                        className="grid h-4 w-4 shrink-0 place-items-center text-[#a1a1aa]"
                                      >
                                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                                      </motion.span>
                                    ) : !item.is_read && (
                                      <motion.span
                                        key="unread"
                                        initial={{ opacity: 0, scale: 0.7 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.7 }}
                                        transition={{ duration: 0.14 }}
                                        className="h-2 w-2 shrink-0 rounded-full bg-[#f5900b]"
                                      />
                                    )}
                                  </AnimatePresence>
                                </span>
                                <span className="line-clamp-2 text-[12px] font-bold leading-[1.35] text-[#71717b]">{item.body}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeNotification(item)}
                                disabled={isDeleting || deletingAll}
                                className="mr-1 grid h-8 w-8 place-items-center rounded-[10px] border-0 bg-transparent text-[#a1a1aa] opacity-0 transition duration-150 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-not-allowed"
                                title="Delete notification"
                                aria-label={`Delete notification: ${item.title}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </motion.div>
                          )
                        })
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((value) => !value)
                setNotificationsOpen(false)
              }}
              className="grid h-11 w-11 place-items-center overflow-hidden rounded-[14px] border border-[#e4e4e7] bg-[#e4e4e7] text-sm font-black text-[#3a2fd3] transition duration-150 hover:-translate-y-px hover:border-[#d4d4d8] hover:bg-[#f4f4f5] active:scale-95"
            >
              {user?.full_name?.[0]?.toUpperCase() || <User size={18} aria-hidden="true" />}
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={notificationPanelTransition}
                  className="absolute right-0 top-[calc(100%+10px)] w-64 origin-top-right rounded-2xl border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_40px_rgba(24,24,27,0.16)]"
                >
                  <div className="grid gap-1 border-b border-[#f4f4f5] pb-2 md:hidden">
                    {navLinks.map(({ href, label, Icon }, index) => {
                      const isActive = active(href)
                      return (
                        <motion.div
                          key={href}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.015, duration: 0.14 }}
                        >
                          <Link
                            href={href}
                            onClick={(event) => handleNavClick(event, href, isActive)}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold no-underline transition hover:-translate-y-px ${
                              isActive ? 'bg-[#f0f0ff] text-[#3a2fd3]' : 'text-[#52525c] hover:bg-[#f4f4f5]'
                            }`}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <Icon size={15} aria-hidden="true" />
                            {label}
                          </Link>
                        </motion.div>
                      )
                    })}
                  </div>
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }} className="border-b border-[#f4f4f5] px-3 py-3">
                    <p className="m-0 truncate text-sm font-black text-[#3f3f46]">{user?.full_name || 'Student'}</p>
                    <p className="m-0 mt-1 truncate text-xs font-bold text-[#71717b]">{user?.email}</p>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.025, duration: 0.14 }}>
                    <Link href="/profile" onClick={() => setMenuOpen(false)} className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#52525c] no-underline transition hover:-translate-y-px hover:bg-[#f4f4f5]">
                      <User size={15} aria-hidden="true" />
                      Profile
                    </Link>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04, duration: 0.14 }}>
                    <button type="button" onClick={doLogout} className="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-sm font-bold text-red-500 transition hover:-translate-y-px hover:bg-red-50">
                      <LogOut size={15} aria-hidden="true" />
                      Log out
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {pendingHref && (
          <motion.div
            key="top-nav-loading-rail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-0.5 overflow-hidden bg-[#eef0ff]"
          >
            {reduceMotion ? (
              <span className="absolute inset-y-0 left-0 w-full rounded-full bg-[#5b60f9]" />
            ) : (
              <motion.span
                className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#5b60f9]"
                initial={{ x: '-120%' }}
                animate={{ x: '320%' }}
                transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}

function isNotFoundError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'response' in error
    && (error as { response?: { status?: number } }).response?.status === 404
}
