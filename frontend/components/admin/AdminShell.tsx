'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  Ticket,
  Users,
  WalletCards,
} from 'lucide-react'

import AuthGuard from '@/components/AuthGuard'
import KrescoWordmark from '@/components/KrescoWordmark'
import { useAuthStore } from '@/lib/store'

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/finance', label: 'Finance', icon: CircleDollarSign },
  { href: '/admin/students', label: 'Students', icon: Users },
  { href: '/admin/communications', label: 'Messages', icon: MessageSquareText },
  { href: '/admin/users', label: 'Accounts', icon: ShieldCheck },
  { href: '/admin/courses', label: 'Courses', icon: BookOpenCheck },
  { href: '/admin/activity', label: 'Audit', icon: Activity },
  { href: '/admin/statistics', label: 'Analytics', icon: BarChart3 },
  { href: '/staff/payments', label: 'Staff codes', icon: Ticket },
]

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  function active(href: string, exact = false) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  }

  function signOut() {
    logout()
    router.push('/auth/login')
  }

  return (
    <AuthGuard requireStaff>
      <div className="min-h-screen bg-[#f5f7fb] text-[#1f2937]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-[#e6ebf2] bg-white px-5 py-5 lg:flex lg:flex-col">
          <Link href="/admin" className="mb-8 flex h-10 items-center no-underline">
            <KrescoWordmark />
          </Link>
          <nav className="grid gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = active(item.href, item.exact)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-[14px] font-bold no-underline transition ${
                    isActive ? 'bg-[#eef3ff] text-[#2563eb]' : 'text-[#6b7280] hover:bg-[#f5f7fb] hover:text-[#111827]'
                  }`}
                >
                  <Icon size={18} strokeWidth={2.2} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="mt-auto rounded-[12px] bg-[#f8fafc] p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-[#2563eb] shadow-sm">
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
              className="flex h-9 w-full items-center justify-center gap-2 rounded-[9px] border border-[#e5e7eb] bg-white text-[12px] font-black text-[#6b7280] transition hover:border-[#fecaca] hover:text-[#dc2626]"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </aside>

        <header className="sticky top-0 z-30 border-b border-[#e6ebf2] bg-white/90 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Link href="/admin" className="flex h-10 items-center no-underline"><KrescoWordmark /></Link>
            <Link href="/admin/finance" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#eef3ff] px-3 text-[13px] font-black text-[#2563eb] no-underline">
              <ReceiptText size={15} /> Finance
            </Link>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-3">
            {navItems.slice(0, 6).map((item) => {
              const Icon = item.icon
              const isActive = active(item.href, item.exact)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] px-3 text-[12px] font-black no-underline ${
                    isActive ? 'bg-[#2563eb] text-white' : 'bg-[#f3f4f6] text-[#6b7280]'
                  }`}
                >
                  <Icon size={14} /> {item.label}
                </Link>
              )
            })}
          </div>
        </header>

        <div className="lg:pl-[248px]">{children}</div>
      </div>
    </AuthGuard>
  )
}
