'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useSWRConfig } from 'swr'
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
  Trash2,
  Trophy,
  User,
  Video,
  X,
  Zap,
} from 'lucide-react'
import KrescoWordmark from '@/components/KrescoWordmark'
import { AUTH_ROUTES, canUseStudentProfessorChat } from '@/lib/authPolicy'
import { isActiveNavHref } from '@/lib/navigationPolicy'
import type { NotificationItem } from '@/lib/notifications'
import { useAuthStore } from '@/lib/store'
import { showToastError, showToastInfo } from '@/lib/lazyToast'
import { preloadStudentRouteData } from '@/lib/studentRoutePreload'
import { useDismissable } from '@/hooks/useClickOutside'
import {
  deleteAllTopNavNotifications,
  deleteTopNavNotification,
  loadTopNavNotifications,
  loadTopNavProfessorChatUnread,
  markAllTopNavNotificationsRead,
  markTopNavNotificationRead,
  readTopNavNotificationCache,
  readTopNavProfessorChatCache,
  writeCurrentNotificationCache,
} from '@/lib/topNavBadgeCache'

type RealtimeModule = typeof import('@/lib/realtime')

type TopNavLink = {
  href: string
  label: string
  Icon: typeof Home
  prefetch?: false
}

const links: TopNavLink[] = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/courses', label: 'Courses', Icon: BookOpen },
  { href: '/exam-bank', label: 'Exam Bank', Icon: ClipboardList },
  { href: '/exercise-bank', label: 'Exercises', Icon: Dumbbell },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/classement', label: 'Leaderboard', Icon: Trophy },
  { href: '/live', label: 'Live', Icon: Video },
  { href: '/zed', label: 'Zed Mode', Icon: Zap, prefetch: false },
]

const professorChatLink: TopNavLink = { href: AUTH_ROUTES.studentProfessorChat, label: 'Professor Chat', Icon: MessageCircle }

const professorStudentLinks = [
  ...links,
  professorChatLink,
]

const DROPDOWN_CLOSE_MS = 150
const NAV_PRELOAD_INTENT_DEDUP_MS = 1500
const controlMotion = 'transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const dropdownMotionClass = '[--dropdown-close-dur:150ms] [--dropdown-open-dur:220ms] [--dropdown-pre-scale:0.97]'
const spinnerMotionClass = 'animate-spin motion-reduce:animate-none'

function TopNavIconSwap({
  busy,
  idle,
  busyIcon,
  className = 'h-4 w-4',
}: {
  busy: boolean
  idle: ReactNode
  busyIcon: ReactNode
  className?: string
}) {
  return (
    <span className={`t-icon-swap ${className}`} data-state={busy ? 'b' : 'a'} aria-hidden="true">
      <span className="t-icon" data-icon="a">{idle}</span>
      <span className="t-icon" data-icon="b">{busyIcon}</span>
    </span>
  )
}

let realtimeModulePromise: Promise<RealtimeModule> | null = null

function scheduleTopNavIdleWork(work: () => void) {
  if (typeof window === 'undefined') return () => {}

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(work, { timeout: 1500 })
    return () => window.cancelIdleCallback?.(handle)
  }

  const handle = window.setTimeout(work, 0)
  return () => window.clearTimeout(handle)
}

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { cache: swrCache, mutate: mutateSWRCache } = useSWRConfig()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [professorChatUnreadCount, setProfessorChatUnreadCount] = useState(0)
  const [readingIds, setReadingIds] = useState<Set<number>>(new Set())
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
  const [deletingAll, setDeletingAll] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const notificationsRef = useRef<HTMLDivElement | null>(null)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const preloadedNavHrefsRef = useRef<Map<string, number>>(new Map())
  const notificationDropdown = useDropdownPresence(notificationsOpen)
  const accountDropdown = useDropdownPresence(menuOpen)
  const canUseProfessorChat = canUseStudentProfessorChat(user)
  const topNavCacheKey = user?.id == null ? null : String(user.id)
  const desktopNavLinks = links
  const menuNavLinks = canUseProfessorChat ? professorStudentLinks : links
  const notificationsLabel = unreadCount > 0 ? `Notifications, ${unreadCount > 9 ? '9 plus' : unreadCount} unread` : 'Notifications'

  function active(href: string | null) {
    return isActiveNavHref(pathname, href, [AUTH_ROUTES.studentHome])
  }

  const preloadNavHref = useCallback((href: string, isActive: boolean) => {
    if (isActive) return
    const now = Date.now()
    const lastPreloadAt = preloadedNavHrefsRef.current.get(href)
    if (lastPreloadAt !== undefined && now - lastPreloadAt < NAV_PRELOAD_INTENT_DEDUP_MS) return
    preloadedNavHrefsRef.current.set(href, now)
    preloadStudentRouteData(href, mutateSWRCache, { cache: swrCache })
  }, [mutateSWRCache, swrCache])

  useEffect(() => {
    preloadedNavHrefsRef.current.clear()
  }, [user?.id])

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  useEffect(() => {
    if (topNavCacheKey === null) return

    const cachedNotifications = readTopNavNotificationCache(topNavCacheKey)
    if (cachedNotifications) {
      setNotifications(cachedNotifications.notifications)
      setUnreadCount(cachedNotifications.unread_count)
    }

    if (!canUseProfessorChat) {
      setProfessorChatUnreadCount(0)
      return
    }

    const cachedUnreadCount = readTopNavProfessorChatCache(topNavCacheKey)
    if (cachedUnreadCount !== null) setProfessorChatUnreadCount(cachedUnreadCount)
  }, [canUseProfessorChat, topNavCacheKey])

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, href: string, isActive: boolean) {
    if (
      event.defaultPrevented
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.button !== 0
    ) {
      return
    }

    if (isActive) {
      setMenuOpen(false)
      setNotificationsOpen(false)
      return
    }

    preloadNavHref(href, isActive)
    setPendingHref(href)
    setMenuOpen(false)
    setNotificationsOpen(false)
  }

  async function doLogout() {
    if (await logout()) {
      router.push('/')
    }
  }

  const refreshNotifications = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (topNavCacheKey === null) return

    const cached = readTopNavNotificationCache(topNavCacheKey)
    if (cached) {
      setNotifications(cached.notifications)
      setUnreadCount(cached.unread_count)
    }

    try {
      const data = await loadTopNavNotifications(topNavCacheKey, { force })
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
    } catch {
      if (!cached) {
        setNotifications([])
        setUnreadCount(0)
      }
    }
  }, [topNavCacheKey])

  const refreshProfessorChatUnread = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (topNavCacheKey === null) return

    if (!canUseProfessorChat) {
      setProfessorChatUnreadCount(0)
      return
    }

    const cachedUnreadCount = readTopNavProfessorChatCache(topNavCacheKey)
    if (cachedUnreadCount !== null) setProfessorChatUnreadCount(cachedUnreadCount)

    try {
      const unreadCount = await loadTopNavProfessorChatUnread(topNavCacheKey, { force })
      setProfessorChatUnreadCount(unreadCount)
    } catch {
      if (cachedUnreadCount === null) setProfessorChatUnreadCount(0)
    }
  }, [canUseProfessorChat, topNavCacheKey])

  const refreshTopNavData = useCallback(async (options?: { force?: boolean }) => {
    await Promise.allSettled([
      refreshNotifications(options),
      refreshProfessorChatUnread(options),
    ])
  }, [refreshNotifications, refreshProfessorChatUnread])

  useEffect(() => {
    if (!user?.id) return
    return scheduleTopNavIdleWork(() => {
      void refreshTopNavData()
    })
  }, [refreshTopNavData, user?.id])

  useEffect(() => {
    const userId = user?.id
    if (!userId) return
    const refresh = () => void refreshTopNavData({ force: true })
    let stopped = false
    let unsubscribe: (() => void) | null = null

    const cancelStartup = scheduleTopNavIdleWork(() => {
      void loadRealtimeModule().then(({ subscribeKrescoRealtime, userNotificationsChannelName }) => {
        if (stopped) return
        unsubscribe = subscribeKrescoRealtime({
          channelName: userNotificationsChannelName(userId),
          onMessage: refresh,
          fallback: { intervalMs: 5000, poll: refreshTopNavData },
        })
      })
    })

    return () => {
      stopped = true
      cancelStartup()
      unsubscribe?.()
    }
  }, [refreshTopNavData, user?.id])

  useDismissable(notificationsRef, () => setNotificationsOpen(false), {
    enabled: notificationsOpen,
    eventName: 'mousedown',
    closeOnEscape: false,
  })

  useDismissable(accountMenuRef, () => setMenuOpen(false), {
    enabled: menuOpen,
    eventName: 'mousedown',
    closeOnEscape: false,
  })

  useEffect(() => {
    if (!menuOpen && !notificationsOpen) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      setNotificationsOpen(false)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen, notificationsOpen])

  async function openNotifications() {
    setNotificationsOpen((value) => !value)
    setMenuOpen(false)
    await refreshNotifications({ force: true })
  }

  async function readNotification(item: NotificationItem) {
    if (item.is_read || readingIds.has(item.id) || deletingIds.has(item.id) || deletingAll) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    const nextNotifications = notifications.map((notification) => (
      notification.id === item.id ? { ...notification, is_read: true } : notification
    ))
    const nextUnreadCount = Math.max(0, unreadCount - 1)
    setReadingIds((current) => new Set(current).add(item.id))
    setNotifications(nextNotifications)
    setUnreadCount(nextUnreadCount)
    writeCurrentNotificationCache(topNavCacheKey, nextNotifications, nextUnreadCount)

    try {
      const updated = await markTopNavNotificationRead(item.id)
      const updatedNotifications = notifications.map((notification) => (
        notification.id === updated.id ? updated : notification
      ))
      setNotifications(updatedNotifications)
      writeCurrentNotificationCache(topNavCacheKey, updatedNotifications, nextUnreadCount)
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      writeCurrentNotificationCache(topNavCacheKey, previousNotifications, previousUnreadCount)
      showToastError('Could not mark notification read.')
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
    const nextNotifications = notifications.map((notification) => ({ ...notification, is_read: true }))
    setMarkingAllRead(true)
    setNotifications(nextNotifications)
    setUnreadCount(0)
    writeCurrentNotificationCache(topNavCacheKey, nextNotifications, 0)

    try {
      await markAllTopNavNotificationsRead()
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      writeCurrentNotificationCache(topNavCacheKey, previousNotifications, previousUnreadCount)
      showToastError('Could not mark notifications read.')
    } finally {
      setMarkingAllRead(false)
    }
  }

  async function removeNotification(item: NotificationItem) {
    if (deletingIds.has(item.id) || deletingAll) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    const nextNotifications = notifications.filter((notification) => notification.id !== item.id)
    const nextUnreadCount = item.is_read ? unreadCount : Math.max(0, unreadCount - 1)
    setDeletingIds((current) => new Set(current).add(item.id))
    setNotifications(nextNotifications)
    if (!item.is_read) setUnreadCount(nextUnreadCount)
    writeCurrentNotificationCache(topNavCacheKey, nextNotifications, nextUnreadCount)
    try {
      await deleteTopNavNotification(item.id)
    } catch (error) {
      if (isNotFoundError(error)) {
        return
      }
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      writeCurrentNotificationCache(topNavCacheKey, previousNotifications, previousUnreadCount)
      showToastError('Could not delete notification.')
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
    writeCurrentNotificationCache(topNavCacheKey, [], 0)
    try {
      await deleteAllTopNavNotifications()
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
      writeCurrentNotificationCache(topNavCacheKey, previousNotifications, previousUnreadCount)
      showToastError('Could not clear notifications.')
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
          {desktopNavLinks.map(({ href, label, Icon, prefetch }) => {
            const isActive = active(href)
            const content = (
              <>
                {isActive && (
                  <span className="absolute inset-0 rounded-[14px] bg-[#f0f0ff] shadow-[inset_0_0_0_1px_rgba(91,96,249,0.13)]" />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon size={16} strokeWidth={2.2} />
                  <span>{label}</span>
                </span>
                {isActive && (
                  <span className="absolute -bottom-3 left-5 right-5 h-0.5 rounded-full bg-[#3a2fd3]" />
                )}
              </>
            )
            const className = `relative flex h-10 shrink-0 items-center justify-center gap-2 overflow-visible rounded-[14px] px-3.5 text-[13px] font-black no-underline outline-none ${controlMotion} focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 ${
              isActive ? 'text-[#3a2fd3]' : 'text-[#52525c] hover:bg-[#f7f7ff] hover:text-[#3a2fd3]'
            }`
            if (!href) {
              return (
                <button key={label} type="button" onClick={() => showToastInfo(`${label} coming soon`)} className={`${className} border-0 bg-transparent`}>
                  {content}
                </button>
              )
            }
            return (
              <Link
                key={href}
                href={href}
                prefetch={prefetch}
                onClick={(event) => handleNavClick(event, href, isActive)}
                onFocus={() => preloadNavHref(href, isActive)}
                onMouseOver={() => preloadNavHref(href, isActive)}
                onPointerEnter={() => preloadNavHref(href, isActive)}
                aria-current={isActive ? 'page' : undefined}
                className={className}
              >
                {content}
              </Link>
            )
          })}
        </div>

        <div className="flex h-full min-w-0 flex-1 items-center justify-end gap-1 md:flex-none">
          <button
            type="button"
            aria-label="Navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className={`grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] ${controlMotion} hover:bg-[#f4f4f5] md:hidden`}
          >
            <Menu size={19} aria-hidden="true" />
          </button>
          {canUseProfessorChat && (
            <Link
              href={AUTH_ROUTES.studentProfessorChat}
              title="Professor Chat"
              aria-label={professorChatUnreadCount > 0 ? `Professor Chat, ${professorChatUnreadCount > 9 ? '9 plus' : professorChatUnreadCount} unread` : 'Professor Chat'}
              onClick={(event) => handleNavClick(event, AUTH_ROUTES.studentProfessorChat, active(AUTH_ROUTES.studentProfessorChat))}
              onFocus={() => preloadNavHref(AUTH_ROUTES.studentProfessorChat, active(AUTH_ROUTES.studentProfessorChat))}
              onMouseOver={() => preloadNavHref(AUTH_ROUTES.studentProfessorChat, active(AUTH_ROUTES.studentProfessorChat))}
              onPointerEnter={() => preloadNavHref(AUTH_ROUTES.studentProfessorChat, active(AUTH_ROUTES.studentProfessorChat))}
              aria-current={active(AUTH_ROUTES.studentProfessorChat) ? 'page' : undefined}
              className={`relative hidden h-11 w-11 place-items-center rounded-[14px] no-underline outline-none ${controlMotion} sm:grid ${
                active(AUTH_ROUTES.studentProfessorChat)
                  ? 'bg-[#f0f0ff] text-[#3a2fd3] shadow-[inset_0_0_0_1px_rgba(91,96,249,0.13)]'
                  : 'text-[#52525c] hover:bg-[#f4f4f5] hover:text-[#3a2fd3]'
              }`}
            >
              <MessageCircle size={18} aria-hidden="true" />
              {professorChatUnreadCount > 0 && (
                <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-[#f5900b] px-1 text-[10px] font-black leading-none text-white tabular-nums">
                  {professorChatUnreadCount > 9 ? '9+' : professorChatUnreadCount}
                </span>
              )}
            </Link>
          )}
          <div ref={notificationsRef} className="relative hidden sm:block">
            <button
              type="button"
              title="Notifications"
              aria-label={notificationsLabel}
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              onClick={() => void openNotifications()}
              className={`relative grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] ${controlMotion} hover:bg-[#f4f4f5]`}
            >
              <Bell size={18} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-[#f5900b] px-1 text-[10px] font-black leading-none text-white tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notificationDropdown.present && (
                <div
                  role="dialog"
                  aria-label="Notifications"
                  data-origin="top-right"
                  className={`t-dropdown ${notificationDropdown.stateClass} ${dropdownMotionClass} absolute right-0 top-[calc(100%+10px)] z-50 w-[min(360px,calc(100vw-2rem))] rounded-[16px] border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_40px_rgba(24,24,27,0.16)]`}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#f4f4f5] px-3 py-2">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-black text-[#3f3f46]">Notifications</strong>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void markAllRead()}
                        disabled={unreadCount === 0 || markingAllRead || deletingAll}
                        className={`inline-flex h-10 items-center gap-1 rounded-[10px] border-0 bg-transparent px-2 text-[12px] font-black text-[#453dee] ${controlMotion} hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:text-[#a1a1aa] disabled:hover:bg-transparent disabled:active:scale-100`}
                        title="Mark all notifications read"
                      >
                        <TopNavIconSwap
                          busy={markingAllRead}
                          idle={<CheckCheck size={14} aria-hidden="true" />}
                          busyIcon={<Loader2 size={14} className={markingAllRead ? spinnerMotionClass : undefined} aria-hidden="true" />}
                          className="h-3.5 w-3.5"
                        />
                        Read
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAllNotifications()}
                        disabled={notifications.length === 0 || deletingAll}
                        className={`grid h-10 w-10 place-items-center rounded-[10px] border-0 bg-transparent text-[#71717b] ${controlMotion} hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:text-[#d4d4d8] disabled:hover:bg-transparent disabled:active:scale-100`}
                        title="Delete all notifications"
                        aria-label="Delete all notifications"
                      >
                        <TopNavIconSwap
                          busy={deletingAll}
                          idle={<Trash2 size={15} aria-hidden="true" />}
                          busyIcon={<Loader2 size={15} className={deletingAll ? spinnerMotionClass : undefined} aria-hidden="true" />}
                          className="h-4 w-4"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className={`grid h-10 w-10 place-items-center rounded-[10px] border-0 bg-transparent text-[#71717b] ${controlMotion} hover:bg-[#f4f4f5] hover:text-[#3f3f46]`}
                        title="Close notifications"
                        aria-label="Close notifications"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto py-1">
                      {notifications.length === 0 ? (
                        <div className="grid min-h-[92px] place-items-center px-3 py-5 text-center">
                          <p className="m-0 text-sm font-black text-[#71717b]">
                            No notifications
                          </p>
                        </div>
                      ) : (
                        notifications.map((item) => {
                          const isReading = readingIds.has(item.id)
                          const isDeleting = deletingIds.has(item.id)
                          return (
                            <div
                              key={item.id}
                              className="group grid grid-cols-[1fr_40px] items-center gap-1 rounded-xl transition-[background-color,box-shadow] duration-150 ease-out hover:bg-[#f4f4f5] focus-within:bg-[#f4f4f5] focus-within:shadow-[var(--shadow-border)] motion-reduce:transition-none"
                            >
                              <button
                                type="button"
                                onClick={() => void readNotification(item)}
                                disabled={isReading || deletingAll}
                                className="grid min-w-0 gap-1 border-0 bg-transparent px-3 py-2 text-left disabled:cursor-default"
                              >
                                <span className="flex items-center justify-between gap-3">
                                  <strong className="min-w-0 truncate text-sm font-black text-[#3f3f46]">{item.title}</strong>
                                  {(isReading || !item.is_read) && (
                                    <span className="grid h-4 w-4 shrink-0 place-items-center text-[#a1a1aa]">
                                      <TopNavIconSwap
                                        busy={isReading}
                                        idle={<span className="h-2 w-2 rounded-full bg-[#f5900b]" />}
                                        busyIcon={<Loader2 size={12} className={isReading ? spinnerMotionClass : undefined} aria-hidden="true" />}
                                        className="h-4 w-4"
                                      />
                                    </span>
                                  )}
                                </span>
                                <span className="line-clamp-2 text-[12px] font-bold leading-[1.35] text-[#71717b]">{item.body}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeNotification(item)}
                                disabled={isDeleting || deletingAll}
                                className={`mr-1 grid h-10 w-10 place-items-center rounded-[10px] border-0 bg-transparent text-[#a1a1aa] opacity-0 ${controlMotion} hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-not-allowed disabled:active:scale-100`}
                                title="Delete notification"
                                aria-label={`Delete notification: ${item.title}`}
                              >
                                <TopNavIconSwap
                                  busy={isDeleting}
                                  idle={<Trash2 size={14} aria-hidden="true" />}
                                  busyIcon={<Loader2 size={14} className={isDeleting ? spinnerMotionClass : undefined} aria-hidden="true" />}
                                  className="h-3.5 w-3.5"
                                />
                              </button>
                            </div>
                          )
                        })
                      )}
                  </div>
                </div>
              )}
          </div>
          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-controls={menuOpen ? 'account-menu' : undefined}
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((value) => !value)
                setNotificationsOpen(false)
              }}
              className={`grid h-11 w-11 place-items-center overflow-hidden rounded-[14px] border border-[#e4e4e7] bg-[#e4e4e7] text-sm font-black text-[#3a2fd3] ${controlMotion} hover:border-[#d4d4d8] hover:bg-[#f4f4f5]`}
            >
              {user?.full_name?.[0]?.toUpperCase() || <User size={18} aria-hidden="true" />}
            </button>
            {accountDropdown.present && (
                <div
                  id="account-menu"
                  role="menu"
                  aria-label="Account menu"
                  data-origin="top-right"
                  className={`t-dropdown ${accountDropdown.stateClass} ${dropdownMotionClass} absolute right-0 top-[calc(100%+10px)] w-64 rounded-2xl border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_40px_rgba(24,24,27,0.16)]`}
                >
                  <div className="grid gap-1 border-b border-[#f4f4f5] pb-2 md:hidden">
                    {menuNavLinks.map(({ href, label, Icon, prefetch }) => {
                      const isActive = active(href)
                      return (
                        <Link
                          key={href}
                          href={href}
                          prefetch={prefetch}
                          onClick={(event) => handleNavClick(event, href, isActive)}
                          onFocus={() => preloadNavHref(href, isActive)}
                          onMouseOver={() => preloadNavHref(href, isActive)}
                          onPointerEnter={() => preloadNavHref(href, isActive)}
                          role="menuitem"
                          className={`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold no-underline ${controlMotion} ${
                            isActive ? 'bg-[#f0f0ff] text-[#3a2fd3]' : 'text-[#52525c] hover:bg-[#f4f4f5]'
                          }`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <Icon size={15} aria-hidden="true" />
                          {label}
                        </Link>
                      )
                    })}
                  </div>
                  <div className="border-b border-[#f4f4f5] px-3 py-3">
                    <p className="m-0 truncate text-sm font-black text-[#3f3f46]">{user?.full_name || 'Student'}</p>
                    <p className="m-0 mt-1 truncate text-xs font-bold text-[#71717b]">{user?.email}</p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    onFocus={() => preloadNavHref('/profile', active('/profile'))}
                    onMouseOver={() => preloadNavHref('/profile', active('/profile'))}
                    onPointerEnter={() => preloadNavHref('/profile', active('/profile'))}
                    role="menuitem"
                    className={`mt-2 flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#52525c] no-underline ${controlMotion} hover:bg-[#f4f4f5]`}
                  >
                    <User size={15} aria-hidden="true" />
                    Profile
                  </Link>
                  <button type="button" onClick={doLogout} role="menuitem" className={`flex min-h-10 w-full items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-sm font-bold text-red-500 ${controlMotion} hover:bg-red-50`}>
                    <LogOut size={15} aria-hidden="true" />
                    Log out
                  </button>
                </div>
              )}
          </div>
        </div>
      </div>
      {pendingHref && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-0.5 overflow-hidden bg-[#eef0ff]">
          <span className="kresco-route-progress absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#5b60f9]" />
        </div>
      )}
    </nav>
  )
}

function useDropdownPresence(open: boolean) {
  const [present, setPresent] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setPresent(true)
      setClosing(false)
      return
    }

    if (!present) return

    setClosing(true)
    const timeout = window.setTimeout(() => {
      setPresent(false)
      setClosing(false)
    }, DROPDOWN_CLOSE_MS)

    return () => window.clearTimeout(timeout)
  }, [open, present])

  return {
    present,
    stateClass: open && !closing ? 'is-open' : closing ? 'is-closing' : '',
  }
}

function isNotFoundError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'response' in error
    && (error as { response?: { status?: number } }).response?.status === 404
}

function loadRealtimeModule() {
  realtimeModulePromise ??= import('@/lib/realtime')
  return realtimeModulePromise
}
