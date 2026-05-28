import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Home',
  description: 'Continue lessons, review progress, and jump back into Kresco study flows.',
}

export default function HomeRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
