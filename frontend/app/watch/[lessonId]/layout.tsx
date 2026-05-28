import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lesson',
  description: 'Watch a Kresco lesson, answer checkpoints, and save learning progress.',
}

export default function WatchRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
