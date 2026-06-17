import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Révisions - Kresco Admin',
  description: 'Réviser et appliquer les demandes de modification des professeurs.',
}

export default function AdminReviewsLayout({ children }: { children: React.ReactNode }) {
  return children
}
