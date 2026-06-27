'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ChevronDown,
  ClipboardCheck,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  Star,
  Ticket,
  TrendingUp,
  UserCog,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

import AuthGuard from '@/components/AuthGuard'
import KrescoWordmark from '@/components/KrescoWordmark'
import { useAuthStore } from '@/lib/store'

type AdminNavItem = {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  children?: Array<{
    href: string
    label: string
    icon: LucideIcon
    exact?: boolean
  }>
}

const navItems: AdminNavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  {
    href: '/admin/finance',
    label: 'Finance',
    icon: CircleDollarSign,
    children: [
      { href: '/admin/finance', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/admin/finance/expenses', label: 'Expenses', icon: ReceiptText },
      { href: '/admin/finance/revenue', label: 'Revenue', icon: TrendingUp },
    ],
  },
  { href: '/admin/staff-payments', label: 'Payment codes', icon: Ticket },
  { href: '/admin/students', label: 'Students', icon: Users },
  { href: '/admin/communications', label: 'Messages', icon: MessageSquareText },
  {
    href: '/admin/users',
    label: 'Accounts',
    icon: ShieldCheck,
    children: [
      { href: '/admin/users', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/admin/users/students', label: 'Student accounts', icon: Users },
      { href: '/admin/users/staff', label: 'Staff management', icon: UserCog },
    ],
  },
  { href: '/admin/courses', label: 'Courses', icon: BookOpenCheck },
  {
    href: '/admin/reviews',
    label: 'Reviews',
    icon: ClipboardCheck,
    children: [
      { href: '/admin/reviews', label: 'Studio changes', icon: ClipboardCheck, exact: true },
      { href: '/admin/reviews/video-feedback', label: 'Video feedback', icon: Star },
    ],
  },
  { href: '/admin/activity', label: 'Operations', icon: Activity },
  { href: '/admin/statistics', label: 'Analytics', icon: BarChart3 },
]

function pathActive(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

function groupState(openHref: string | null) {
  return navItems.reduce<Record<string, boolean>>((state, item) => {
    if (item.children?.length) state[item.href] = item.href === openHref
    return state
  }, {})
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const activeGroups = navItems
      .filter((item) => item.children?.length && pathActive(pathname, item.href, item.exact))
      .map((item) => item.href)

    if (!activeGroups.length) return
    setOpenGroups((current) => {
      const next = groupState(activeGroups[0])
      for (const [href, isOpen] of Object.entries(next)) {
        if (current[href] !== isOpen) return next
      }
      return current
    })
  }, [pathname])

  function toggleGroup(href: string) {
    setOpenGroups((current) => groupState(current[href] ? null : href))
  }

  function signOut() {
    logout()
    router.push('/auth/login')
  }

  return (
    <AuthGuard requireStaff>
      <div className="min-h-screen bg-[#f5f7fb] text-[#1f2937] [--admin-accent:var(--primary)] [--admin-accent-soft:var(--primary-soft)]">
        <aside className="fixed inset-y-0 left-0 z-40 flex w-[76px] flex-col border-r border-[#e6ebf2] bg-white px-3 py-4 lg:w-[272px] lg:px-5 lg:py-5">
          <Link
            href="/admin"
            aria-label="Kresco admin overview"
            className="mb-7 flex h-11 items-center justify-center no-underline lg:justify-start"
          >
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[color:var(--admin-accent)] text-[17px] font-black text-white shadow-[0_12px_22px_rgba(69,61,238,0.18)] lg:hidden">
              K
            </span>
            <span className="hidden lg:flex">
              <KrescoWordmark />
            </span>
          </Link>
          <nav aria-label="Admin navigation" className="grid gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathActive(pathname, item.href, item.exact)
              const hasChildren = Boolean(item.children?.length)
              const isOpen = hasChildren && Boolean(openGroups[item.href])
              const parentHighlighted = isActive || isOpen
              const panelId = `admin-subnav-${item.href.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`
              return (
                <div key={item.href} className={hasChildren ? 't-acc relative' : undefined} data-open={isOpen ? 'true' : 'false'}>
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.href)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      aria-label={item.label}
                      title={item.label}
                      className={`relative flex h-11 w-full items-center justify-center rounded-[12px] text-[14px] font-bold no-underline transition-[background-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--admin-accent)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 lg:justify-start lg:gap-3 lg:px-3 ${
                        parentHighlighted
                          ? 'bg-[color:var(--admin-accent-soft)] text-[color:var(--admin-accent)] shadow-[inset_0_0_0_1px_rgba(69,61,238,0.08)]'
                          : 'text-[#718096] hover:bg-[#f5f7fb] hover:text-[#111827]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute left-[-12px] top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[color:var(--admin-accent)] transition-[opacity] duration-150 motion-reduce:transition-none lg:left-[-20px] ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
                      <span className="hidden min-w-0 flex-1 truncate lg:inline">{item.label}</span>
                      <span className="hidden shrink-0 lg:inline-flex">
                        <ChevronDown size={15} className="t-acc-chevron" aria-hidden="true" />
                      </span>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.label}
                      title={item.label}
                      className={`relative flex h-11 items-center justify-center rounded-[12px] text-[14px] font-bold no-underline transition-[background-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--admin-accent)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 lg:justify-start lg:gap-3 lg:px-3 ${
                        isActive
                          ? 'bg-[color:var(--admin-accent-soft)] text-[color:var(--admin-accent)] shadow-[inset_0_0_0_1px_rgba(69,61,238,0.08)]'
                          : 'text-[#718096] hover:bg-[#f5f7fb] hover:text-[#111827]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute left-[-12px] top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[color:var(--admin-accent)] transition-[opacity] duration-150 motion-reduce:transition-none lg:left-[-20px] ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
                      <span className="hidden min-w-0 flex-1 truncate lg:inline">{item.label}</span>
                    </Link>
                  )}
                  {hasChildren && (
                    <div
                      id={panelId}
                      className="t-acc-panel absolute left-[calc(100%+8px)] top-0 z-50 w-[220px] rounded-[14px] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.14)] ring-1 ring-black/5 lg:static lg:z-auto lg:w-auto lg:rounded-none lg:bg-transparent lg:shadow-none lg:ring-0"
                      aria-hidden={!isOpen}
                    >
                      <div className="t-acc-panel-inner min-h-0 p-2 lg:py-1.5 lg:pl-8 lg:pr-0">
                        <div className="grid gap-1 lg:border-l lg:border-[#e6ebf2] lg:pl-3">
                          {item.children?.map((child) => {
                            const ChildIcon = child.icon
                            const childActive = pathActive(pathname, child.href, child.exact)
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                aria-current={childActive ? 'page' : undefined}
                                tabIndex={isOpen ? undefined : -1}
                                className={`flex h-10 items-center gap-2 rounded-[10px] px-2 text-[12px] font-black no-underline transition-[background-color,color,transform] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--admin-accent)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 lg:h-9 ${
                                  childActive
                                    ? 'bg-[color:var(--admin-accent-soft)] text-[color:var(--admin-accent)] shadow-[inset_0_0_0_1px_rgba(69,61,238,0.08)] lg:bg-white lg:shadow-[0_6px_14px_rgba(15,23,42,0.06)]'
                                    : 'text-[#718096] hover:bg-[#f5f7fb] hover:text-[#111827] lg:text-[#8a97a8]'
                                }`}
                              >
                                <ChildIcon size={14} strokeWidth={2.3} aria-hidden="true" />
                                <span className="truncate">{child.label}</span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
          <div className="mt-auto">
            <div className="hidden rounded-[14px] border border-[#edf2f7] bg-[#f8fafc] p-3 lg:block">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white text-[color:var(--admin-accent)] shadow-sm">
                  <WalletCards size={17} />
                </span>
                <div className="min-w-0">
                  <p className="m-0 truncate text-[13px] font-black text-[#111827]">{user?.full_name || 'Operator'}</p>
                  <p className="m-0 truncate text-[11px] font-bold text-[#9ca3af]">{user?.email || 'staff account'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white text-[12px] font-black text-[#6b7280] transition-[border-color,color,transform] duration-150 ease-out hover:border-[#fecaca] hover:text-[#dc2626] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc2626] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <LogOut size={14} aria-hidden="true" /> Sign out
              </button>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="grid h-11 w-full place-items-center rounded-[12px] border border-[#e5e7eb] bg-white text-[#718096] transition-[border-color,color,transform] duration-150 ease-out hover:border-[#fecaca] hover:text-[#dc2626] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc2626] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 lg:hidden"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="min-h-screen pl-[76px] lg:pl-[272px]">{children}</div>
      </div>
    </AuthGuard>
  )
}
