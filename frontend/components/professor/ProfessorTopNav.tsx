'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bell, ClipboardList, LayoutDashboard, LogOut, Menu, MessageCircle, Radio, User } from 'lucide-react'
import KrescoWordmark from '@/components/KrescoWordmark'
import { AUTH_ROUTES } from '@/lib/authPolicy'
import { isActiveNavHref } from '@/lib/navigationPolicy'
import { useAuthStore } from '@/lib/store'

const professorLinks = [
  { href: AUTH_ROUTES.professorHome, label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/professor/live', label: 'Live Sessions', Icon: Radio },
  { href: '/professor/changes', label: 'Change Requests', Icon: ClipboardList },
  { href: AUTH_ROUTES.professorChat, label: 'Chat', Icon: MessageCircle },
]

export default function ProfessorTopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)

  function active(href: string) {
    return isActiveNavHref(pathname, href, [AUTH_ROUTES.professorHome])
  }

  function doLogout() {
    logout()
    router.push(AUTH_ROUTES.professorLogin)
  }

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-[#f4f4f5] bg-white/95 shadow-[0_0_7.5px_rgba(24,24,27,0.1)] backdrop-blur-xl">
      <div className="mx-auto flex h-full w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] items-center gap-6 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]">
        <Link href="/professor" className="flex h-full w-[82px] shrink-0 items-center no-underline">
          <KrescoWordmark />
        </Link>
        <div className="hidden h-full min-w-0 flex-1 items-center md:flex">
          {professorLinks.map(({ href, label, Icon }) => {
            const isActive = active(href)
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
          <span className="hidden rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 py-2 text-[12px] font-black text-[#453dee] sm:inline-flex">
            Professor
          </span>
          <button type="button" className="relative grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#52525c] hover:bg-[#f4f4f5]">
            <Bell size={18} />
            <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#f5900b]" />
          </button>
          <div className="grid h-11 w-11 place-items-center rounded-[14px] border-[2px] border-[#e4e4e7] bg-[#f4f4f5] text-sm font-black text-[#3a2fd3]">
            {user?.full_name?.[0]?.toUpperCase() || <User size={18} />}
          </div>
          <button
            type="button"
            onClick={doLogout}
            className="grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent text-[#71717b] transition hover:bg-red-50 hover:text-red-500"
            title="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="border-b border-[#e4e4e7] bg-white px-4 py-3 shadow-[0_18px_40px_rgba(24,24,27,0.08)] md:hidden">
          <div className="mx-auto grid max-w-[420px] gap-1">
            {professorLinks.map(({ href, label, Icon }) => {
              const isActive = active(href)
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
          </div>
        </div>
      )}
    </nav>
  )
}
