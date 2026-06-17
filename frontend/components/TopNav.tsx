'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Dumbbell,
  Home,
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

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
  const [deletingAll, setDeletingAll] = useState(false)
  const notificationsRef = useRef<HTMLDivElement | null>(null)
  const navLinks = canUseStudentProfessorChat(user) ? professorStudentLinks : links

  function active(href: string | null) {
    return isActiveNavHref(pathname, href, [AUTH_ROUTES.studentHome])
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
    if (!item.is_read) {
      await markNotificationRead(item.id)
      await refreshNotifications()
    }
  }

  async function markAllRead() {
    await markAllNotificationsRead()
    await refreshNotifications()
  }

  async function removeNotification(item: NotificationItem) {
    if (deletingIds.has(item.id) || deletingAll) return

    setDeletingIds((current) => new Set(current).add(item.id))
    await waitForRemoval()
    setNotifications((current) => current.filter((notification) => notification.id !== item.id))
    if (!item.is_read) setUnreadCount((current) => Math.max(0, current - 1))
    try {
      await deleteNotification(item.id)
    } catch (error) {
      if (isNotFoundError(error)) {
        return
      }
      await showErrorToast('Could not delete notification.')
      await refreshNotifications()
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

    setDeletingAll(true)
    setDeletingIds(new Set(notifications.map((item) => item.id)))
    await waitForRemoval()
    try {
      await deleteAllNotifications()
      setNotifications([])
      setUnreadCount(0)
    } catch {
      await showErrorToast('Could not clear notifications.')
      await refreshNotifications()
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
          {navLinks.map(({ href, label, Icon }) => {
            const isActive = active(href)
            const content = (
              <>
                <Icon size={16} strokeWidth={2.2} />
                <span>{label}</span>
                {isActive && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-[#3a2fd3]"
                  />
                )}
              </>
            )
            const className = `relative flex h-full shrink-0 items-center justify-center gap-2 px-4 text-[13px] font-black no-underline transition duration-200 ${
              isActive ? 'text-[#3a2fd3]' : 'text-[#52525c] hover:text-[#3a2fd3]'
            }`
            if (!href) {
              return (
                <button key={label} type="button" onClick={() => void showInfoToast(`${label} coming soon`)} className={`${className} border-0 bg-transparent`}>
                  {content}
                </button>
              )
            }
            return (
              <Link key={href} href={href} className={className}>
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
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-[#f5900b] px-1 text-[10px] font-black leading-none text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div role="dialog" aria-label="Notifications" className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(360px,calc(100vw-2rem))] rounded-[16px] border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_40px_rgba(24,24,27,0.16)]">
                <div className="flex items-center justify-between gap-3 border-b border-[#f4f4f5] px-3 py-2">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-black text-[#3f3f46]">Notifications</strong>
                    <span className="block text-[11px] font-bold text-[#71717b]">{unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      disabled={unreadCount === 0}
                      className="inline-flex h-8 items-center gap-1 rounded-[10px] border-0 bg-transparent px-2 text-[12px] font-black text-[#453dee] transition hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:text-[#a1a1aa] disabled:hover:bg-transparent"
                      title="Mark all notifications read"
                    >
                      <CheckCheck size={14} aria-hidden="true" />
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
                      <Trash2 size={15} aria-hidden="true" />
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
                  {notifications.length === 0 ? (
                    <p className="m-0 px-3 py-5 text-sm font-bold text-[#71717b]">No notifications yet.</p>
                  ) : (
                    notifications.map((item) => {
                      const isDeleting = deletingIds.has(item.id)
                      return (
                        <div
                          key={item.id}
                          className={`group grid grid-cols-[1fr_32px] items-center gap-1 rounded-xl transition duration-150 ${isDeleting ? '-translate-y-1 scale-[0.98] opacity-0' : 'translate-y-0 opacity-100 hover:bg-[#f4f4f5] focus-within:bg-[#f4f4f5]'}`}
                        >
                          <button
                            type="button"
                            onClick={() => void readNotification(item)}
                            disabled={isDeleting}
                            className="grid min-w-0 gap-1 border-0 bg-transparent px-3 py-2 text-left disabled:cursor-default"
                          >
                            <span className="flex items-center justify-between gap-3">
                              <strong className="min-w-0 truncate text-sm font-black text-[#3f3f46]">{item.title}</strong>
                              {!item.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#f5900b]" />}
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
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
              className="grid h-11 w-11 place-items-center overflow-hidden rounded-[14px] border border-[#e4e4e7] bg-[#e4e4e7] text-sm font-black text-[#3a2fd3] transition duration-150 hover:-translate-y-px hover:border-[#d4d4d8] hover:bg-[#f4f4f5] active:scale-95"
            >
              {user?.full_name?.[0]?.toUpperCase() || <User size={18} aria-hidden="true" />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-64 origin-top-right rounded-2xl border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_40px_rgba(24,24,27,0.16)]">
                <div className="grid gap-1 border-b border-[#f4f4f5] pb-2 md:hidden">
                  {navLinks.map(({ href, label, Icon }) => {
                    const isActive = active(href)
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold no-underline ${
                          isActive ? 'bg-[#f0f0ff] text-[#3a2fd3]' : 'text-[#52525c] hover:bg-[#f4f4f5]'
                        }`}
                      >
                        <Icon size={15} />
                        {label}
                      </Link>
                    )
                  })}
                </div>
                <div className="border-b border-[#f4f4f5] px-3 py-3">
                  <p className="m-0 truncate text-sm font-black text-[#3f3f46]">{user?.full_name || 'Student'}</p>
                  <p className="m-0 mt-1 truncate text-xs font-bold text-[#71717b]">{user?.email}</p>
                </div>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#52525c] no-underline hover:bg-[#f4f4f5]">
                  <User size={15} aria-hidden="true" />
                  Profile
                </Link>
                <button type="button" onClick={doLogout} className="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-sm font-bold text-red-500 hover:bg-red-50">
                  <LogOut size={15} aria-hidden="true" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

function waitForRemoval() {
  return new Promise((resolve) => setTimeout(resolve, 140))
}

function isNotFoundError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'response' in error
    && (error as { response?: { status?: number } }).response?.status === 404
}
