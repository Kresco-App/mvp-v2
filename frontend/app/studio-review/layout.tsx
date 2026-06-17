import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Révision Studio - Kresco Admin',
  description: 'Révision et application des demandes de modification de cours.',
}

export default function StudioReviewRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
