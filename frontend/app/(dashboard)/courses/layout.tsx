import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Courses',
  description: 'Browse Kresco Bac subjects, topics, and course progress.',
}

export default function CoursesRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
