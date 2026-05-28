'use client'

import { usePathname } from 'next/navigation'
import { PermanentSidebar, type PermanentSidebarProps } from '@/components/figma'

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

  if (!config) return <>{children}</>

  return (
    <div className={config.containerClassName}>
      <div className={config.gridClassName}>
        <div className="min-w-0">{children}</div>
        <PermanentSidebar {...config.sidebarProps} />
      </div>
    </div>
  )
}
