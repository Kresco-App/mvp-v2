import type { LucideIcon } from 'lucide-react'

export type FigmaNavKey = 'home' | 'courses' | 'calendar' | 'leaderboard' | 'live'

export type FigmaNavItem = {
  key: FigmaNavKey
  label: string
  icon: LucideIcon
  href?: string
}

export type FigmaTabItem = {
  id?: string | number
  label: string
  icon: LucideIcon
  active?: boolean
}

export type FigmaRailItem = {
  id?: string | number
  label: string
  active?: boolean
  completed?: boolean
  disabled?: boolean
  meta?: string
}

export type FigmaRailSection = {
  id: string | number
  title: string
  copy: string
  items?: FigmaRailItem[]
  open?: boolean
}
