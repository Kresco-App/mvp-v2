'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { PermanentSidebarProps } from '@/components/figma/permanent-sidebar'
import { useSharedMediaQuery } from '@/hooks/useSharedMediaQuery'

const DESKTOP_SIDEBAR_QUERY = '(min-width: 1181px)'
const DeferredPermanentSidebar = dynamic(
  () => import('@/components/figma/permanent-sidebar').then((mod) => mod.PermanentSidebar),
  {
    ssr: false,
    loading: () => <PermanentSidebarPlaceholder />,
  },
)

type DashboardSidebarConfig = {
  containerClassName: string
  gridClassName: string
  sidebarProps?: PermanentSidebarProps
}

function getDashboardSidebarConfig(pathname: string): DashboardSidebarConfig | null {
  if (pathname === '/home') {
    return {
      containerClassName: 'figma-home-container',
      gridClassName: 'figma-home-grid',
    }
  }

  if (pathname.startsWith('/home/')) {
    return {
      containerClassName: 'figma-container',
      gridClassName: 'figma-dashboard-grid',
    }
  }

  if (pathname === '/courses') {
    return {
      containerClassName: 'figma-courses-container',
      gridClassName: 'figma-courses-grid',
      sidebarProps: { sections: ['quests', 'leaderboard'] },
    }
  }

  if (pathname === '/exam-bank') {
    return {
      containerClassName: 'figma-courses-container',
      gridClassName: 'figma-courses-grid',
    }
  }

  if (pathname === '/live') {
    return {
      containerClassName: 'figma-container',
      gridClassName: 'figma-dashboard-grid',
    }
  }

  return null
}

export default function DashboardLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const config = getDashboardSidebarConfig(pathname)
  const mainRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef(false)

  const content = config ? (
    <div className={config.containerClassName}>
      <div className={config.gridClassName}>
        <div className="min-w-0">{children}</div>
        <DeferredDashboardSidebar sidebarProps={config.sidebarProps} />
      </div>
    </div>
  ) : children

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div
      id="main-content"
      role="main"
      ref={mainRef}
      tabIndex={-1}
      className="min-w-0"
    >
      {content}
    </div>
  )
}

function DeferredDashboardSidebar({ sidebarProps }: { sidebarProps?: PermanentSidebarProps }) {
  const shouldLoadSidebar = useDesktopSidebar()

  if (!shouldLoadSidebar) return <PermanentSidebarPlaceholder />

  return <DeferredPermanentSidebar {...sidebarProps} />
}

function useDesktopSidebar() {
  return useSharedMediaQuery(DESKTOP_SIDEBAR_QUERY)
}

function PermanentSidebarPlaceholder() {
  return (
    <aside
      aria-hidden="true"
      className="w-[351px] shrink-0 pb-[120px] pt-11 max-[1180px]:hidden"
    />
  )
}
