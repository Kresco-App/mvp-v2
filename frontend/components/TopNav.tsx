'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  StickyNote,
  Trophy,
  User,
  Video,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import KrescoWordmark from '@/components/KrescoWordmark'
import { useAuthStore } from '@/lib/store'

const links = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/courses', label: 'Courses', Icon: BookOpen },
  { href: '/exam-bank', label: 'Exam Bank', Icon: ClipboardList },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/classement', label: 'Leaderboard', Icon: Trophy },
  { href: '/live', label: 'Live', Icon: Video },
  { href: '/zed', label: 'Zed Mode', Icon: Zap },
]

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)

  function active(href: string | null) {
    if (!href) return false
    return href === '/home' ? pathname === '/home' : pathname === href || pathname.startsWith(`${href}/`)
  }

  function doLogout() {
    logout()
    router.push('/')
  }

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-[#f4f4f5] bg-white/95 shadow-[0_0_7.5px_rgba(24,24,27,0.1)] backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[var(--figma-shell-width)] items-center gap-6 px-[var(--figma-shell-gutter)]">
        <Link href="/home" className="flex h-full w-[82px] shrink-0 items-center no-underline">
          <KrescoWordmark />
        </Link>

        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
          {links.map(({ href, label, Icon }) => {
            const isActive = active(href)
            const content = (
              <>
                <Icon size={16} strokeWidth={2.2} />
                <span>{label}</span>
                {isActive && (
                  <motion.span
                    layoutId="top-nav-active-rail"
                    className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-[#3a2fd3]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
              </>
            )
            const className = `relative flex h-full shrink-0 items-center justify-center gap-2 px-4 text-[13px] font-black no-underline transition duration-200 ${
              isActive ? 'text-[#3a2fd3]' : 'text-[#52525c] hover:text-[#3a2fd3]'
            }`
            if (!href) {
              return (
                <button key={label} type="button" onClick={() => toast.info(`${label} coming soon`)} className={`${className} border-0 bg-transparent`}>
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

        <div className="flex h-full shrink-0 items-center justify-end gap-1">
          <motion.button
            type="button"
            title="Notes"
            onClick={() => toast.info('Notes are available inside each topic.')}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] hover:bg-[#f4f4f5]"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.94 }}
          >
            <StickyNote size={18} />
          </motion.button>
          <motion.button
            type="button"
            title="Notifications"
            onClick={() => toast.info('Notifications are local-only in this pass.')}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] hover:bg-[#f4f4f5]"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.94 }}
          >
            <Bell size={18} />
          </motion.button>
          <div className="relative">
            <motion.button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="grid h-11 w-11 place-items-center overflow-hidden rounded-[14px] border border-[#e4e4e7] bg-[#e4e4e7] text-sm font-black text-[#3a2fd3] transition-colors hover:border-[#d4d4d8] hover:bg-[#f4f4f5]"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.95 }}
            >
              {user?.full_name?.[0]?.toUpperCase() || <User size={18} />}
            </motion.button>
            <AnimatePresence>
              {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                className="absolute right-0 top-[calc(100%+10px)] w-64 origin-top-right rounded-2xl border border-[#e4e4e7] bg-white p-2 shadow-[0_18px_40px_rgba(24,24,27,0.16)]"
              >
                <div className="border-b border-[#f4f4f5] px-3 py-3">
                  <p className="m-0 truncate text-sm font-black text-[#3f3f46]">{user?.full_name || 'Student'}</p>
                  <p className="m-0 mt-1 truncate text-xs font-bold text-[#71717b]">{user?.email}</p>
                </div>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#52525c] no-underline hover:bg-[#f4f4f5]">
                  <User size={15} />
                  Profile
                </Link>
                <button onClick={doLogout} className="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-sm font-bold text-red-500 hover:bg-red-50">
                  <LogOut size={15} />
                  Log out
                </button>
              </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
  )
}
