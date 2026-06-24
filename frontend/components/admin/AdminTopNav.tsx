'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Database,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  MessageSquareText,
  ShieldCheck,
  ClipboardCheck,
  TrendingUp,
  User,
  X,
  Users,
} from 'lucide-react'
import KrescoWordmark from '@/components/KrescoWordmark'
import { useDropdownTransition } from '@/hooks/useDropdownTransition'
import { getJson } from '@/lib/apiClient'
import { getAdminRootUrl } from '@/lib/apiConfig'
import { numberValue, type AdminOverview } from '@/lib/adminOverview'
import { listAdminChangeRequests } from '@/lib/studio'
import { useAuthStore } from '@/lib/store'

const adminLinks = [
  { href: '/admin', label: 'Vue', Icon: LayoutDashboard, exact: true },
  { href: '/admin/activity', label: 'Activité', Icon: Activity, exact: false },
  { href: '/admin/reviews', label: 'Révisions', Icon: ClipboardCheck, exact: false },
  { href: '/admin/users', label: 'Utilisateurs', Icon: Users, exact: false },
  { href: '/admin/courses', label: 'Cours', Icon: LibraryBig, exact: false },
  { href: '/admin/students', label: 'Élèves', Icon: TrendingUp, exact: false },
  { href: '/admin/communications', label: 'Messages', Icon: MessageSquareText, exact: false },
  { href: '/admin/finance', label: 'Finance', Icon: CircleDollarSign, exact: false },
  { href: '/admin/statistics', label: 'Stats', Icon: BarChart3, exact: false },
]

type NavBadgeMap = Partial<Record<string, number>>

function sectionNumber(section: Record<string, unknown> | undefined, key: string) {
  return numberValue(section?.[key])
}

function adminNavBadgesFromOverview(overview: AdminOverview): NavBadgeMap {
  const communications = overview.communications
  const finance = overview.finance
  const progressStatuses = overview.progress_xp?.topic_item_progress_by_status as Record<string, unknown> | undefined

  return {
    '/admin/communications':
      (sectionNumber(communications, 'chat_unread_for_professors') || sectionNumber(communications, 'unread_for_professors')) +
      sectionNumber(communications, 'pending_live_interactions') +
      sectionNumber(communications, 'open_reports'),
    '/admin/finance':
      sectionNumber(finance, 'pending_manual_review') +
      sectionNumber(finance, 'pending_provider') +
      sectionNumber(finance, 'failed_or_mismatch'),
    '/admin/students':
      sectionNumber(progressStatuses, 'in_progress') +
      sectionNumber(progressStatuses, 'started') +
      sectionNumber(progressStatuses, 'needs_review'),
  }
}

function compactBadge(value: number) {
  if (value > 99) return '99+'
  return String(value)
}

function badgeClassName(href: string) {
  if (href === '/admin/finance') return 'bg-[#ef4444]'
  if (href === '/admin/students') return 'bg-[#5b60f9]'
  return 'bg-[#f5900b]'
}

export default function AdminTopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const {
    closeDropdown: closeMenu,
    dropdownStateClassName: menuStateClassName,
    isOpen: menuOpen,
    shouldRenderDropdown: shouldRenderMenu,
    toggleDropdown: toggleMenu,
  } = useDropdownTransition()
  const [navBadges, setNavBadges] = useState<NavBadgeMap>({})

  useEffect(() => {
    let alive = true

    async function loadNavBadges() {
      const nextBadges: NavBadgeMap = {}
      const [reviewsResult, overviewResult] = await Promise.allSettled([
        listAdminChangeRequests('pending'),
        getJson<AdminOverview>('/admin/overview'),
      ])

      if (reviewsResult.status === 'fulfilled') {
        nextBadges['/admin/reviews'] = reviewsResult.value.length
      }
      if (overviewResult.status === 'fulfilled') {
        Object.assign(nextBadges, adminNavBadgesFromOverview(overviewResult.value))
      }
      if (alive) setNavBadges(nextBadges)
    }

    void loadNavBadges()
    return () => { alive = false }
  }, [pathname])

  useEffect(() => {
    closeMenu()
  }, [closeMenu, pathname])

  function active(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  }

  async function doLogout() {
    if (await logout()) router.push('/')
  }

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-[#e6e9f0] bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-full w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] items-center gap-5 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <Link href="/admin" className="flex h-full w-[82px] shrink-0 items-center no-underline">
          <KrescoWordmark />
        </Link>
        <div className="hidden h-full min-w-0 flex-1 items-center md:flex">
          {adminLinks.map(({ href, label, Icon, exact }) => {
            const isActive = active(href, exact)
            const badge = navBadges[href] ?? 0
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex h-full shrink-0 items-center justify-center gap-2 px-3 text-[13px] font-black no-underline transition-[background-color,color,transform] duration-200 active:scale-[0.96] ${
                  isActive ? 'text-[#3a2fd3]' : 'text-[#5f6878] hover:text-[#3a2fd3]'
                }`}
              >
                <Icon size={16} strokeWidth={2.2} />
                <span>{label}</span>
                {badge > 0 && (
                  <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-black text-white tabular-nums ${badgeClassName(href)}`}>
                    {compactBadge(badge)}
                  </span>
                )}
                {isActive && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[#3a2fd3]" />}
              </Link>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            title="Navigation"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            onClick={toggleMenu}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#5f6878] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] hover:bg-[#f4f6fb] md:hidden"
          >
            <span className="t-icon-swap" data-state={menuOpen ? 'b' : 'a'} aria-hidden="true">
              <span className="t-icon" data-icon="a"><Menu size={19} /></span>
              <span className="t-icon" data-icon="b"><X size={19} /></span>
            </span>
          </button>
          <span className="hidden items-center gap-1.5 rounded-[12px] border border-[#dfe3ea] bg-white px-3 py-2 text-[12px] font-black text-[#453dee] sm:inline-flex">
            <ShieldCheck size={13} /> Staff
          </span>
          <a
            href={getAdminRootUrl()}
            target="_blank"
            rel="noreferrer"
            title="Open SQLAdmin"
            className="hidden h-11 items-center gap-2 rounded-[14px] border border-[#dfe3ea] bg-white px-3 text-[12px] font-black text-[#5f6878] transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96] hover:border-[#5b60f9] hover:text-[#5b60f9] sm:inline-flex"
          >
            <Database size={15} /> SQLAdmin
          </a>
          <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-[#dfe3ea] bg-[#f7f8fb] text-sm font-black text-[#3a2fd3]">
            {user?.full_name?.[0]?.toUpperCase() || <User size={18} />}
          </div>
          <button
            type="button"
            onClick={doLogout}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#7b8494] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] hover:bg-red-50 hover:text-red-500"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
      {shouldRenderMenu && (
        <div id="admin-mobile-menu" className={`t-dropdown border-b border-[#e6e9f0] bg-white px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:hidden ${menuStateClassName}`} data-origin="top-right">
          <div className="mx-auto grid max-w-[420px] gap-1">
            {adminLinks.map(({ href, label, Icon, exact }) => {
              const isActive = active(href, exact)
              const badge = navBadges[href] ?? 0
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMenu}
                  className={`flex h-11 items-center gap-2 rounded-[12px] px-3 text-[14px] font-black no-underline transition-[background-color,color] duration-150 ease-out ${
                    isActive ? 'bg-[#eef0ff] text-[#3a2fd3]' : 'text-[#5f6878] hover:bg-[#f4f6fb]'
                  }`}
                >
                  <Icon size={16} />
                  <span className="min-w-0 flex-1">{label}</span>
                  {badge > 0 && (
                    <span className={`grid h-[20px] min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-black text-white tabular-nums ${badgeClassName(href)}`}>
                      {compactBadge(badge)}
                    </span>
                  )}
                </Link>
              )
            })}
            <a href={getAdminRootUrl()} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-2 rounded-[12px] px-3 text-[14px] font-black text-[#5f6878] no-underline transition-[background-color,color] duration-150 ease-out hover:bg-[#f4f6fb]">
              <Database size={16} /> SQLAdmin
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}
