import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Live Sessions',
  description: 'Join scheduled Kresco live classes and live learning rooms.',
}

export default function StudentLiveRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
