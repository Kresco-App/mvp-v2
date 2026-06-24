'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { PermanentSidebar, type PermanentSidebarProps } from '@/components/figma'

const routeEase = [0.22, 1, 0.36, 1] as const
const routeExitEase = [0.4, 0, 1, 1] as const

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
  const reduceMotion = useReducedMotion()
  const routeKey = dashboardRouteKey(pathname)
  const routeInitial = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(3px)' }
  const routeAnimate = reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }
  const routeExit = reduceMotion
    ? { opacity: 0, transition: { duration: 0.08 } }
    : { opacity: 0, y: 4, filter: 'blur(2px)', transition: { duration: 0.15, ease: routeExitEase } }

  const content = config ? (
    <div className={config.containerClassName}>
      <div className={config.gridClassName}>
        <div className="min-w-0">{children}</div>
        <PermanentSidebar {...config.sidebarProps} />
      </div>
    </div>
  ) : children

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        id="main-content"
        role="main"
        tabIndex={-1}
        key={routeKey}
        initial={routeInitial}
        animate={routeAnimate}
        exit={routeExit}
        transition={{ duration: 0.25, ease: routeEase }}
        className="min-w-0"
      >
        {content}
      </motion.div>
    </AnimatePresence>
  )
}

function dashboardRouteKey(pathname: string) {
  return pathname.split('/').filter(Boolean).join('/') || 'home'
}
