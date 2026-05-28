import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'Plan study blocks, live sessions, and upcoming course events in Kresco.',
}

export default function CalendarRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
