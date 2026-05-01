'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import {
  LogOut,
  User,
  Bell,
  LayoutDashboard,
  CheckCheck,
  Zap,
  Flame,
  Star,
  AlertCircle,
  Home,
  BookOpen,
  CalendarDays,
  Trophy,
  Video,
  ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import KrescoLogo from '@/components/KrescoLogo'
import api from '@/lib/axios'

const NAV_LINKS = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/courses', label: 'Courses', Icon: BookOpen },
  { href: null, label: 'Calendar', Icon: CalendarDays },
  { href: '/classement', label: 'Leaderboard', Icon: Trophy },
  { href: null, label: 'Live', Icon: Video },
]

interface Notification {
  id: number
  type: string
  title: string
  body: string
  is_read: boolean
  created_at: string
}

const NOTIF_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  xp:     { icon: <Zap size={13} />,        color: '#453dee' },
  quest:  { icon: <Star size={13} />,        color: '#f59e0b' },
  streak: { icon: <Flame size={13} />,       color: '#f97316' },
  badge:  { icon: <Star size={13} />,        color: '#7c3aed' },
  system: { icon: <AlertCircle size={13} />, color: '#52525c' },
}

function timeAgo(isoDate: string) {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (diff < 60) return 'à l\'instant'
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get('/notifications').then(r => {
      setNotifications(r.data.notifications ?? [])
      setUnreadCount(r.data.unread_count ?? 0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleLogout() {
    logout()
    toast.success('Déconnexion réussie.')
    router.push('/')
  }

  function markRead(id: number) {
    api.post(`/notifications/${id}/read`).then(() => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }).catch(() => {})
  }

  function markAllRead() {
    api.post('/notifications/read-all').then(() => {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    }).catch(() => {})
  }

  function isActive(href: string | null) {
    if (!href) return false
    if (href === '/home') return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isZedActive = pathname === '/zed'

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      backgroundColor: 'var(--surface-card)',
      borderBottom: '1px solid var(--border)',
      height: 64,
      boxShadow: '0 4px 18px rgba(24,24,27,0.05)',
    }}>
      <div style={{
        maxWidth: 1440, margin: '0 auto', paddingLeft: 28, paddingRight: 28,
        height: '100%', display: 'flex', alignItems: 'center', gap: 32,
      }}>
        {/* Logo */}
        <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, textDecoration: 'none' }}>
          <KrescoLogo size={30} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.9 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#2d2a91' }}>kresco</span>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#f59e0b', letterSpacing: 2.2 }}>ACADEMIA</span>
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflowX: 'auto' }}>
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const active = isActive(href)
            const sharedStyle: React.CSSProperties = {
              position: 'relative', padding: '0 12px', height: 64, gap: 7,
              display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700,
              textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none',
              color: active ? 'var(--primary)' : 'var(--text-secondary)', transition: 'color 150ms',
              whiteSpace: 'nowrap',
            }
            const underline = active ? (
              <span style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 2, borderRadius: 2, backgroundColor: 'var(--primary)' }} />
            ) : null

            if (!href) return (
              <button key={label} onClick={() => toast.info(`${label} bientôt disponible !`)} style={sharedStyle}>
                <Icon size={16} />
                {label}{underline}
              </button>
            )
            return (
              <Link key={href} href={href} style={sharedStyle}>
                <Icon size={16} />
                {label}{underline}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Planificateur */}
          <button
            onClick={() => toast.info('Planificateur bientôt disponible !')}
            title="Planificateur"
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'transparent', border: '1px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            <ClipboardList size={17} />
          </button>

          {/* Zed Mode */}
          <Link
            href="/zed"
            title="Zed Mode — session de concentration"
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: isZedActive ? 'var(--primary-soft)' : 'transparent',
              border: isZedActive ? '1px solid rgba(69,61,238,0.3)' : '1px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: isZedActive ? 'var(--primary)' : 'var(--text-secondary)',
              textDecoration: 'none', transition: 'all 150ms',
            }}
          >
            <Zap size={17} />
          </Link>

          {/* Notifications */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(v => !v); setMenuOpen(false) }}
              style={{
                width: 44, height: 44, borderRadius: 14, position: 'relative',
                background: notifOpen ? 'var(--primary-soft)' : 'var(--surface-input)',
                border: notifOpen ? '1px solid rgba(69,61,238,0.3)' : '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: notifOpen ? 'var(--primary)' : 'var(--text-secondary)', transition: 'all 150ms',
              }}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 7, right: 7, width: 8, height: 8,
                  borderRadius: '50%', background: '#ef4444', border: '2px solid var(--surface-card)',
                }} />
              )}
            </button>

            {notifOpen && (
              <div className="animate-fade-in" style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                width: 340, background: 'var(--surface-card)', borderRadius: 16,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid var(--border)', zIndex: 100,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Notifications</p>
                    {unreadCount > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--primary)', margin: '1px 0 0', fontWeight: 600 }}>
                        {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                    >
                      <CheckCheck size={14} />
                      Tout lire
                    </button>
                  )}
                </div>
                <div style={{ borderTop: '1px solid var(--border)' }} />

                {notifications.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                    <Bell size={28} style={{ color: 'var(--text-tertiary)', margin: '0 auto 10px', display: 'block' }} />
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Aucune notification</p>
                  </div>
                ) : (
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {notifications.map(n => {
                      const meta = NOTIF_ICONS[n.type] ?? NOTIF_ICONS.system
                      return (
                        <div
                          key={n.id}
                          onClick={() => !n.is_read && markRead(n.id)}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px',
                            background: n.is_read ? 'transparent' : 'var(--surface-hover)',
                            cursor: n.is_read ? 'default' : 'pointer',
                            borderBottom: '1px solid var(--border)', transition: 'background 150ms',
                          }}
                          onMouseEnter={e => { if (!n.is_read) (e.currentTarget as HTMLDivElement).style.background = 'var(--primary-soft)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = n.is_read ? 'transparent' : 'var(--surface-hover)' }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                            background: meta.color + '15',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: meta.color,
                          }}>
                            {meta.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{n.title}</p>
                            {n.body && <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: '0 0 3px', lineHeight: 1.4 }}>{n.body}</p>}
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>{timeAgo(n.created_at)}</p>
                          </div>
                          {!n.is_read && (
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 4 }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Avatar dropdown */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false) }}
              style={{
                width: 44, height: 44, borderRadius: 14, overflow: 'hidden',
                border: menuOpen ? '1px solid rgba(69,61,238,0.3)' : '1px solid var(--border)',
                background: menuOpen ? 'var(--primary-soft)' : 'var(--surface-input)',
                cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 150ms',
              }}
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{user?.full_name?.[0]}</span>
              )}
            </button>

            {menuOpen && (
              <div className="animate-fade-in" style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                width: 224, background: 'var(--surface-card)', borderRadius: 16,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid var(--border)',
                paddingTop: 8, paddingBottom: 8, zIndex: 100,
              }}>
                <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
                  {user?.is_pro && (
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'linear-gradient(135deg,#f59e0b,#f97316)', color: '#fff' }}>
                      PRO ✦
                    </span>
                  )}
                </div>
                {[
                  { href: '/profile', Icon: User, label: 'Mon Profil' },
                  { href: '/admin', Icon: LayoutDashboard, label: 'Espace enseignant' },
                ].map(({ href, Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none', transition: 'background 150ms' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }} />
                <button
                  onClick={handleLogout}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', fontSize: 14, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogOut size={15} />
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
