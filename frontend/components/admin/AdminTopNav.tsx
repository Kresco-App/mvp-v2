'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CircleDollarSign, Database, LayoutDashboard, LibraryBig, LogOut, Menu, ShieldCheck, ClipboardCheck, User } from 'lucide-react'
import KrescoWordmark from '@/components/KrescoWordmark'
import { getAdminRootUrl } from '@/lib/apiConfig'
import { listAdminChangeRequests } from '@/lib/studio'
import { useAuthStore } from '@/lib/store'

const adminLinks = [
  { href: '/admin', label: 'Tableau de bord', Icon: LayoutDashboard, exact: true },
  { href: '/admin/reviews', label: 'Révisions', Icon: ClipboardCheck, exact: false },
  { href: '/admin/courses', label: 'Cours', Icon: LibraryBig, exact: false },
  { href: '/admin/finance', label: 'Finance', Icon: CircleDollarSign, exact: false },
]

export default function AdminTopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingReviews, setPendingReviews] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    listAdminChangeRequests('pending')
      .then((items) => { if (alive) setPendingReviews(items.length) })
      .catch(() => { /* badge stays hidden if the call fails */ })
    return () => { alive = false }
  }, [pathname])

  function active(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  }

  async function doLogout() {
    if (await logout()) router.push('/')
  }

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-[#f4f4f5] bg-white/95 shadow-[0_0_7.5px_rgba(24,24,27,0.1)] backdrop-blur-xl">
      <div className="mx-auto flex h-full w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] items-center gap-6 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <Link href="/admin" className="flex h-full w-[82px] shrink-0 items-center no-underline">
          <KrescoWordmark />
        </Link>
        <div className="hidden h-full min-w-0 flex-1 items-center md:flex">
          {adminLinks.map(({ href, label, Icon, exact }) => {
            const isActive = active(href, exact)
            const showBadge = href === '/admin/reviews' && (pendingReviews ?? 0) > 0
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex h-full shrink-0 items-center justify-center gap-2 px-4 text-[13px] font-black no-underline transition duration-200 ${
                  isActive ? 'text-[#3a2fd3]' : 'text-[#52525c] hover:text-[#3a2fd3]'
                }`}
              >
                <Icon size={16} strokeWidth={2.2} />
                <span>{label}</span>
                {showBadge && (
                  <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#f5900b] px-1 text-[10px] font-black text-white">
                    {pendingReviews}
                  </span>
                )}
                {isActive && <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-[#3a2fd3]" />}
              </Link>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            title="Navigation"
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] transition hover:bg-[#f4f4f5] md:hidden"
          >
            <Menu size={19} />
          </button>
          <span className="hidden items-center gap-1.5 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-2 text-[12px] font-black text-[#453dee] sm:inline-flex">
            <ShieldCheck size={13} /> Staff
          </span>
          <a
            href={getAdminRootUrl()}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir SQLAdmin"
            className="hidden h-11 items-center gap-2 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#52525c] transition hover:border-[#5b60f9] hover:text-[#5b60f9] sm:inline-flex"
          >
            <Database size={15} /> SQLAdmin
          </a>
          <div className="grid h-11 w-11 place-items-center rounded-[14px] border-[2px] border-[#e4e4e7] bg-[#f4f4f5] text-sm font-black text-[#3a2fd3]">
            {user?.full_name?.[0]?.toUpperCase() || <User size={18} />}
          </div>
          <button
            type="button"
            onClick={doLogout}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#71717b] transition hover:bg-red-50 hover:text-red-500"
            title="Se déconnecter"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="border-b border-[#e4e4e7] bg-white px-4 py-3 shadow-[0_18px_40px_rgba(24,24,27,0.08)] md:hidden">
          <div className="mx-auto grid max-w-[420px] gap-1">
            {adminLinks.map(({ href, label, Icon, exact }) => {
              const isActive = active(href, exact)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex h-11 items-center gap-2 rounded-[12px] px-3 text-[14px] font-black no-underline ${
                    isActive ? 'bg-[#f0f0ff] text-[#3a2fd3]' : 'text-[#52525c] hover:bg-[#f4f4f5]'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              )
            })}
            <a href={getAdminRootUrl()} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-2 rounded-[12px] px-3 text-[14px] font-black text-[#52525c] no-underline hover:bg-[#f4f4f5]">
              <Database size={16} /> SQLAdmin
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}
