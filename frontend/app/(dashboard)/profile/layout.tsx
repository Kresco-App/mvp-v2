import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Manage your Kresco profile, learning progress, saved items, and notes.',
}

export default function ProfileRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
