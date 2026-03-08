'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { LogOut, User, ChevronDown, Moon, LayoutDashboard } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import KrescoLogo from '@/components/KrescoLogo'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/home', label: 'Accueil' },
  { href: '/courses', label: 'Matieres' },
]

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleLogout() {
    logout()
    toast.success('Deconnexion reussie.')
    router.push('/')
  }

  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-8">
        {/* Logo */}
        <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
          <KrescoLogo size={32} />
          <span className="font-bold text-[17px] text-white tracking-tight">kresco</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== '/home' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  active
                    ? 'bg-kresco/10 text-kresco font-semibold'
                    : 'text-slate-500 hover:text-white hover:bg-slate-100'
                )}
              >
                {label}
              </Link>
            )
          })}
          <Link
            href="/zed"
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
              pathname === '/zed'
                ? 'bg-indigo-600/10 text-indigo-600 font-semibold'
                : 'text-slate-500 hover:text-white hover:bg-slate-100'
            )}
          >
            <Moon size={13} />
            Zed Mode
          </Link>
          <button
            onClick={() => toast.info('Sessions en direct bientot disponibles !')}
            className="px-4 py-1.5 rounded-full text-sm font-medium text-slate-500 hover:text-white hover:bg-slate-100 transition-colors"
          >
            Live
          </button>
        </div>

        {/* Avatar dropdown */}
        <div className="ml-auto relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="w-8 h-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-kresco/10 flex items-center justify-center">
                <span className="text-kresco text-sm font-bold">{user?.full_name?.[0]}</span>
              </div>
            )}
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-slate-900 rounded-2xl shadow-lg border border-slate-800 py-2 z-50">
              <div className="px-4 py-2.5 border-b border-slate-800">
                <p className="text-sm font-semibold text-white truncate">{user?.full_name}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-950 transition-colors"
              >
                <User size={15} />
                Mon Profil
              </Link>
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-950 transition-colors"
              >
                <LayoutDashboard size={15} />
                Espace enseignant
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} />
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
