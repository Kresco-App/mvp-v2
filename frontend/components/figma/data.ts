import { Beaker, BookOpen, CalendarDays, FileText, Home, ListChecks, Trophy, Video } from 'lucide-react'
import type { FigmaNavItem, FigmaRailItem, FigmaTabItem } from './types'

export const figmaNavItems: FigmaNavItem[] = [
  { key: 'home', label: 'Home', icon: Home, href: '/home' },
  { key: 'courses', label: 'Courses', icon: BookOpen, href: '/courses' },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy, href: '/classement' },
  { key: 'live', label: 'Live', icon: Video },
]

export const figmaWorkspaceTabs: FigmaTabItem[] = [
  { label: 'Course', icon: BookOpen, active: true },
  { label: 'Lab', icon: Beaker },
  { label: 'Resources', icon: ListChecks },
  { label: 'Notes', icon: FileText },
]

export const figmaLessonItems: FigmaRailItem[] = [
  { label: 'Lesson 1', active: true },
  { label: 'Lesson 2' },
  { label: 'Lesson 3' },
]

export const figmaChapterItems: FigmaRailItem[] = Array.from({ length: 8 }, (_, index) => ({
  label: `Chapter ${index + 1}`,
  active: index === 0,
}))

